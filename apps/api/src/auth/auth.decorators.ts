import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@app/common';

/** What the guard attaches to each authenticated request. */
export interface AuthUser {
  id: string;
  orgId: string;
  role: Role;
  email: string;
  name: string;
}

export const IS_PUBLIC = 'isPublic';
/** Opt a route out of authentication (login, health checks). Everything else requires a token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Restrict a route to these roles. Routes without it allow any signed-in member. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
