import { User } from '@app/common';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser, IS_PUBLIC, ROLES } from './auth.decorators';

export interface JwtPayload {
  sub: string;
  org: string;
}

/**
 * Registered globally: every route requires a valid bearer token unless it is
 * marked @Public(). The token only identifies the user; org and role are
 * re-read from the database on each request, so removing someone or changing
 * their role takes effect immediately instead of when their token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Sign in to continue');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.orgId !== payload.org) {
      throw new UnauthorizedException('Your account no longer has access. Sign in again.');
    }
    req.user = { id: user.id, orgId: user.orgId, role: user.role, email: user.email, name: user.name } satisfies AuthUser;
    return true;
  }
}

/** Runs after JwtAuthGuard; enforces @Roles(...) where present. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Only an admin can do this');
    }
    return true;
  }
}
