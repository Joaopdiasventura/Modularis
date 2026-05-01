import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountService } from './account.service';
import type { CreateAccountResponse } from './types/create-account-response.type';
import { AuthService } from '../../shared/modules/auth/auth.service';
import { setAuthCookie } from '../../shared/modules/auth/set-auth-cookie';
import type { AuthenticatedRequest } from '../../shared/http/types/authenticated-request.type';

@Controller('accounts')
export class AccountController {
  public constructor(
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  public async create(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateAccountDto,
  ): Promise<CreateAccountResponse> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        title: 'Bad Request',
        status: 400,
        detail: 'Idempotency-Key header is required.',
      });
    }

    const result = await this.accountService.create(
      request.correlationId!,
      idempotencyKey.trim(),
      dto,
    );
    const token = await this.authService.sign(result.user.id);
    setAuthCookie(this.configService, response, token);
    response.setHeader(
      'Idempotency-Replayed',
      result.meta.replayed ? 'true' : 'false',
    );
    return result;
  }
}
