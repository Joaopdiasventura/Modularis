import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  public constructor(private readonly jwtService: JwtService) {}

  public async sign(userId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId });
  }

  public async verify(token: string): Promise<{ sub: string }> {
    try {
      return await this.jwtService.verifyAsync<{ sub: string }>(token);
    } catch {
      throw new UnauthorizedException({
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid authentication token.',
      });
    }
  }
}
