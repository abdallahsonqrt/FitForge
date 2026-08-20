import { ForbiddenException, Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces `@Roles(...)`.
 *
 * Registered globally in `AppModule`, immediately after `JwtAuthGuard` — a
 * `@Roles` decorator with no guard behind it looks like access control while
 * enforcing nothing, which is worse than no decorator at all. Handlers without
 * the decorator are unaffected.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (requiredRoles.some((role) => user?.role === role)) {
      return true;
    }

    // 403 rather than a bare false, so the client can tell "signed in but not
    // allowed" from "not signed in".
    throw new ForbiddenException('This action requires the ' + requiredRoles.join(' or ') + ' role.');
  }
}
