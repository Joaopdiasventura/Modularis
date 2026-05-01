import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { CreateAccountDto } from './dto/create-account.dto';
import { OnboardingService } from './onboarding.service';
import {
  createMessageEnvelope,
  MessageEnvelope,
  OnboardingAccountCreateCommandPayload,
  OnboardingAccountCreateResponsePayload,
  RpcResponse,
} from '../../shared/modules/messaging/contracts';
import { RabbitBusService } from '../../shared/modules/messaging/rabbit-bus.service';

@Injectable()
export class OnboardingCommandConsumer implements OnModuleInit {
  private readonly logger = new Logger(OnboardingCommandConsumer.name);

  public constructor(
    private readonly rabbitBus: RabbitBusService,
    private readonly onboardingService: OnboardingService,
  ) {}

  public onModuleInit(): void {
    this.rabbitBus.registerCommandHandler(
      async (
        message,
      ): Promise<
        MessageEnvelope<RpcResponse<OnboardingAccountCreateResponsePayload>>
      > => this.handleCreateCommand(message),
    );
  }

  private async handleCreateCommand(
    message: ConsumeMessage,
  ): Promise<
    MessageEnvelope<RpcResponse<OnboardingAccountCreateResponsePayload>>
  > {
    let command: MessageEnvelope<OnboardingAccountCreateCommandPayload> | null =
      null;

    try {
      command = JSON.parse(
        message.content.toString('utf8'),
      ) as MessageEnvelope<OnboardingAccountCreateCommandPayload>;

      const validation = validateSync(
        plainToInstance(CreateAccountDto, command.payload),
        {
          whitelist: true,
          forbidNonWhitelisted: false,
        },
      );
      if (validation.length > 0) {
        throw new BadRequestException({
          title: 'Bad Request',
          status: 400,
          detail: 'The onboarding command payload is invalid.',
          code: 'INVALID_COMMAND',
        });
      }

      const response = await this.onboardingService.create(command);
      return createMessageEnvelope({
        schemaVersion: '1.0.0',
        messageId: randomUUID(),
        correlationId: command.correlationId,
        causationId: command.messageId,
        occurredAt: new Date().toISOString(),
        type: 'onboarding.account.create.response',
        source: 'onboarding-service',
        payload: {
          success: true,
          data: response,
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof BadRequestException ||
          error instanceof ConflictException ||
          error instanceof BadGatewayException
        )
      ) {
        this.logger.error(
          'Unexpected onboarding command failure',
          error instanceof Error ? error.stack : undefined,
        );
      }

      const status = inferStatus(error);
      const detail = inferDetail(error);
      const title = inferTitle(error, status);
      const code = inferCode(error);

      return createMessageEnvelope({
        schemaVersion: '1.0.0',
        messageId: randomUUID(),
        correlationId:
          command?.correlationId ??
          headerString(message, 'x-correlation-id') ??
          messageCorrelationId(message) ??
          randomUUID(),
        causationId:
          command?.messageId ??
          headerString(message, 'x-causation-id') ??
          'onboarding.account.create',
        occurredAt: new Date().toISOString(),
        type: 'onboarding.account.create.response',
        source: 'onboarding-service',
        payload: {
          success: false,
          error: {
            status,
            title,
            detail,
            ...(code ? { code } : {}),
          },
        },
      });
    }
  }
}

function headerString(
  message: ConsumeMessage,
  key: string,
): string | undefined {
  const properties = message.properties as {
    headers?: Record<string, unknown>;
  };
  const headers = properties.headers;
  const value = headers?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function messageCorrelationId(message: ConsumeMessage): string | undefined {
  const properties = message.properties as {
    correlationId?: unknown;
  };
  const value = properties.correlationId;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function inferStatus(error: unknown): number {
  if (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof BadGatewayException
  ) {
    return error.getStatus();
  }
  return 500;
}

function inferTitle(error: unknown, status: number): string {
  const response = extractResponseBody(error);
  if (response && typeof response.title === 'string') return response.title;
  switch (status) {
    case 400:
      return 'Bad Request';
    case 409:
      return 'Conflict';
    case 502:
      return 'Bad Gateway';
    default:
      return 'Internal Server Error';
  }
}

function inferDetail(error: unknown): string {
  const response = extractResponseBody(error);
  if (response && typeof response.detail === 'string') return response.detail;
  return 'The onboarding request could not be processed.';
}

function inferCode(error: unknown): string | undefined {
  const response = extractResponseBody(error);
  return response && typeof response.code === 'string'
    ? response.code
    : undefined;
}

function extractResponseBody(
  error: unknown,
): Record<string, unknown> | undefined {
  if (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof BadGatewayException
  ) {
    const response = error.getResponse();
    return typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>)
      : undefined;
  }
  return undefined;
}
