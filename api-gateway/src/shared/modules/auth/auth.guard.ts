import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../../http/types/authenticated-request.type';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication is required to open the event stream.',
      });
    }

    const auth = await this.authService.verify(token);
    request.auth = auth;
    request.userId = auth.sub;
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const cookieName = this.configService.getOrThrow<string>('auth.cookieName');
    const cookies = this.toCookieRecord(request.cookies);
    const cookieToken = cookies?.[cookieName];
    if (typeof cookieToken === 'string' && cookieToken.trim()) {
      return cookieToken.trim();
    }

    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') return undefined;
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token?.trim()) return undefined;
    return token.trim();
  }

  private toCookieRecord(
    value: unknown,
  ): Record<string, string | undefined> | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return value as Record<string, string | undefined>;
  }
}
