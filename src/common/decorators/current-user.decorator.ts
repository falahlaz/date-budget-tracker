import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export interface AuthenticatedUser {
  id: number;
  email: string;
  displayName: string;
}

/**
 * Injects the authenticated user placed on the request by JwtStrategy.
 *
 * Every query in this app is scoped by `user_id` (PRD 11), so handlers take the id from
 * here rather than from anything the client sends.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
