import { Role } from '@app/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { authRateLimit } from './auth.config';
import { AuthUser, CurrentUser, Public, Roles } from './auth.decorators';
import { CreateMemberDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

/** Brute-force protection: a few attempts per minute per client IP. */
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: authRateLimit(), ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}

@Controller('team')
export class TeamController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.auth.listMembers(user.orgId);
  }

  @Post()
  @Roles(Role.ADMIN)
  add(@CurrentUser() user: AuthUser, @Body() dto: CreateMemberDto) {
    return this.auth.addMember(user, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.removeMember(user, id);
  }
}
