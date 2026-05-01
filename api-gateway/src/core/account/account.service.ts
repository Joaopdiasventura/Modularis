import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { stableHash } from '../../shared/utils/stable-hash';
import {
  createMessageEnvelope,
  MessageEnvelope,
  OnboardingAccountCreateCommandPayload,
  OnboardingAccountCreateResponsePayload,
  RpcResponse,
} from '../../shared/modules/messaging/contracts';
import { RabbitBusService } from '../../shared/modules/messaging/rabbit-bus.service';
import { CreateAccountDto } from './dto/create-account.dto';
import type { CreateAccountResponse } from './types/create-account-response.type';

@Injectable()
export class AccountService {
  public constructor(private readonly rabbitBus: RabbitBusService) {}

  public async create(
    correlationId: string,
    idempotencyKey: string,
    dto: CreateAccountDto,
  ): Promise<CreateAccountResponse> {
    const requestHash = stableHash({
      email: dto.email,
      name: dto.name,
      cellphone: dto.cellphone,
      taxId: dto.taxId,
      amount: dto.amount,
      currency: dto.currency,
    });

    const command: MessageEnvelope<OnboardingAccountCreateCommandPayload> =
      createMessageEnvelope({
        schemaVersion: '1.0.0',
        messageId: randomUUID(),
        correlationId,
        occurredAt: new Date().toISOString(),
        type: 'onboarding.account.create',
        source: 'api-gateway',
        payload: {
          idempotencyKey,
          requestHash,
          email: dto.email,
          name: dto.name,
          cellphone: dto.cellphone,
          taxId: dto.taxId,
          amount: dto.amount,
          currency: dto.currency,
        },
      });

    const response = await this.rabbitBus.sendRpc<
      OnboardingAccountCreateCommandPayload,
      OnboardingAccountCreateResponsePayload
    >('onboarding.account.create', command);

    return this.unwrapRpc(response);
  }

  private unwrapRpc(
    response: RpcResponse<OnboardingAccountCreateResponsePayload>,
  ): CreateAccountResponse {
    if (response.success) {
      return response.data;
    }

    switch (response.error.status) {
      case 400:
        throw new BadRequestException({
          title: response.error.title,
          status: 400,
          detail: response.error.detail,
          code: response.error.code,
        });
      case 409:
        throw new ConflictException({
          title: response.error.title,
          status: 409,
          detail: response.error.detail,
          code: response.error.code,
        });
      default:
        throw new BadGatewayException({
          title: response.error.title || 'Bad Gateway',
          status: response.error.status || 502,
          detail: response.error.detail,
          code: response.error.code,
        });
    }
  }
}
