import { Organization, Role, User } from '@app/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { signupAllowed } from './auth.config';
import { AuthUser } from './auth.decorators';
import { CreateMemberDto, LoginDto, RegisterDto } from './auth.dto';
import { JwtPayload } from './auth.guards';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

export interface Session {
  token: string;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  org: { id: string; name: string };
}

const isUniqueViolation = (e: unknown) =>
  e instanceof QueryFailedError && (e as { driverError?: { code?: string } }).driverError?.code === '23505';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Creates a new organization with the caller as its first admin. */
  async register(dto: RegisterDto): Promise<Session> {
    if (!signupAllowed()) throw new ForbiddenException('Sign-up is disabled on this server');
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.dataSource.transaction(async (tx) => {
        const org = await tx.save(tx.create(Organization, { name: dto.orgName.trim() }));
        return tx.save(
          tx.create(User, { orgId: org.id, email, name: dto.name.trim(), passwordHash, role: Role.ADMIN }),
        );
      });
      return this.session(user.id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('An account with this email already exists');
      throw e;
    }
  }

  /** Same message and similar timing whether the email is unknown or the password is wrong. */
  async login(dto: LoginDto): Promise<Session> {
    const user = await this.users.findOne({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Email or password is incorrect');
    return this.session(user.id);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { org: true } });
    if (!user) throw new UnauthorizedException();
    return toPublic(user);
  }

  listMembers(orgId: string): Promise<PublicUser[]> {
    return this.users
      .find({ where: { orgId }, relations: { org: true }, order: { createdAt: 'ASC' } })
      .then((us) => us.map(toPublic));
  }

  /** Admins add teammates to their own organization only. */
  async addMember(admin: AuthUser, dto: CreateMemberDto): Promise<PublicUser> {
    try {
      const user = await this.users.save(
        this.users.create({
          orgId: admin.orgId,
          email: dto.email.trim().toLowerCase(),
          name: dto.name.trim(),
          passwordHash: await hashPassword(dto.password),
          role: dto.role ?? Role.RECRUITER,
        }),
      );
      return this.me(user.id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('An account with this email already exists');
      throw e;
    }
  }

  async removeMember(admin: AuthUser, userId: string): Promise<void> {
    if (userId === admin.id) throw new BadRequestException("You can't remove yourself");
    // Scoped delete: an id from another org simply matches nothing.
    const res = await this.users.delete({ id: userId, orgId: admin.orgId });
    if (!res.affected) throw new NotFoundException('Team member not found');
  }

  private async session(userId: string): Promise<Session> {
    const user = await this.me(userId);
    const payload: JwtPayload = { sub: user.id, org: user.org.id };
    return { token: await this.jwt.signAsync(payload), user };
  }
}

function toPublic(u: User): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, org: { id: u.org.id, name: u.org.name } };
}
