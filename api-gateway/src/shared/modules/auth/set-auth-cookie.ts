import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

export function setAuthCookie(
  configService: ConfigService,
  response: Response,
  token: string,
): void {
  response.cookie(configService.getOrThrow('auth.cookieName'), token, {
    httpOnly: true,
    secure: configService.getOrThrow('auth.cookieSecure'),
    sameSite: configService.getOrThrow('auth.cookieSameSite'),
    path: '/',
  });
}
