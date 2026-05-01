import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { stableHash } from '../../shared/utils/stable-hash';
import {
  CompensationResultPayload,
  createMessageEnvelope,
  MessageEnvelope,
  OnboardingAccountCreateCommandPayload,
  PaymentCreateCommandPayload,
  PaymentIntentPayload,
  PublicPaymentIntentPayload,
  RpcErrorResponse,
  RpcResponse,
  UserCompensationCommandPayload,
  UserCreateCommandPayload,
  UserCreateResponsePayload,
  UserPayload,
} from '../../shared/modules/messaging/contracts';
import { RabbitBusService } from '../../shared/modules/messaging/rabbit-bus.service';
import {
  AccountCreationSaga,
  OnboardingRepository,
  ProblemSnapshot,
  SagaHashConflictError,
  SagaNextAction,
} from './onboarding.repository';
import type { CreateAccountResponse } from './types/create-account-response.type';

const DEFAULT_SAGA_LEASE_MS = 30_000;
const DEFAULT_RECOVERY_INTERVAL_MS = 2_000;
const DEFAULT_RECOVERY_BATCH_SIZE = 10;
const DEFAULT_WAIT_POLL_MS = 100;

@Injectable()
export class OnboardingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingService.name);
  private recoveryTimer?: NodeJS.Timeout;
  private recoveryInFlight = false;

  public constructor(
    private readonly rabbitBus: RabbitBusService,
    private readonly onboardingRepository: OnboardingRepository,
    private readonly configService: ConfigService,
  ) {}

  public onModuleInit(): void {
    this.recoveryTimer = setInterval(() => {
      void this.recoverPendingSagas();
    }, DEFAULT_RECOVERY_INTERVAL_MS);
  }

  public onModuleDestroy(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
  }

  public async create(
    command: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
  ): Promise<CreateAccountResponse> {
    const workerId = this.workerId('command');
    const leaseUntil = this.leaseUntil();

    let saga: AccountCreationSaga | null;
    try {
      saga = await this.onboardingRepository.tryAcquire({
        idempotencyKey: command.payload.idempotencyKey,
        requestHash: command.payload.requestHash,
        requestPayload: command.payload,
        correlationId: command.correlationId,
        workerId,
        lockedUntil: leaseUntil,
      });
    } catch (error) {
      if (error instanceof SagaHashConflictError) {
        throw conflict(
          'Idempotency-Key was already used with a different payload',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      throw error;
    }

    if (!saga) {
      return this.waitForSettledSaga(
        command.payload.idempotencyKey,
        command.payload.requestHash,
      );
    }

    try {
      return await this.executeStateMachine(command, saga, workerId);
    } finally {
      await this.onboardingRepository
        .release(command.payload.idempotencyKey, workerId)
        .catch((error: unknown) => {
          this.logger.warn(
            `failed to release saga lock ${command.payload.idempotencyKey}: ${String(error)}`,
          );
        });
    }
  }

  private async executeStateMachine(
    command: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
    saga: AccountCreationSaga,
    workerId: string,
  ): Promise<CreateAccountResponse> {
    const completed = this.tryCompletedReplay(saga);
    if (completed) {
      return withReplayFlag(completed, true);
    }

    if (isTerminalFailure(saga)) {
      throw toException(saga.error);
    }

    let current = saga;

    while (true) {
      this.logSaga('advancing', current, command.messageId);

      switch (current.nextAction) {
        case 'PROCESS_USER': {
          const userData = await this.requestUserCreation(command);
          current = await this.onboardingRepository.markUserCreated({
            idempotencyKey: current.idempotencyKey,
            workerId,
            correlationId: current.rootCorrelationId,
            causationId: command.messageId,
            userPayload: userData.user,
          });
          break;
        }
        case 'PROCESS_PAYMENT': {
          try {
            const paymentData = await this.requestPaymentCreation(
              command,
              current,
            );
            current = await this.onboardingRepository.markPaymentCreated({
              idempotencyKey: current.idempotencyKey,
              workerId,
              correlationId: current.rootCorrelationId,
              causationId: command.messageId,
              paymentPayload: toPublicPayment(paymentData),
            });
          } catch (error) {
            current = await this.handlePaymentFailure(
              command,
              current,
              workerId,
              error,
            );
            if (current.status === 'COMPENSATED') {
              throw toException(current.error!);
            }
          }
          break;
        }
        case 'COMPENSATE_USER': {
          await this.requestUserCompensation(command, current);
          current = await this.onboardingRepository.markCompensated({
            idempotencyKey: current.idempotencyKey,
            workerId,
            correlationId: current.rootCorrelationId,
            causationId: command.messageId,
            error:
              current.error ??
              downStreamProblem(
                'account creation was compensated after a partial failure',
                'COMPENSATED_AFTER_FAILURE',
              ),
          });
          throw toException(current.error!);
        }
        case 'COMPLETE': {
          const response = composeResponse(
            current.rootCorrelationId,
            current.idempotencyKey,
            current.userPayload,
            current.paymentPayload,
            false,
          );
          current = await this.onboardingRepository.markCompleted({
            idempotencyKey: current.idempotencyKey,
            workerId,
            correlationId: current.rootCorrelationId,
            causationId: command.messageId,
            response,
          });
          return response;
        }
        case 'NOOP': {
          const replay = this.tryCompletedReplay(current);
          if (replay) {
            return withReplayFlag(replay, current.status === 'COMPLETED');
          }
          if (current.error) {
            throw toException(current.error);
          }
          throw new BadGatewayException({
            title: 'Bad Gateway',
            status: 502,
            detail: 'The onboarding request reached an unexpected state.',
            code: 'SAGA_STATE_INVALID',
          });
        }
      }
    }
  }

  private async requestUserCreation(
    command: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
  ): Promise<UserCreateResponsePayload> {
    return this.sendRpc<UserCreateCommandPayload, UserCreateResponsePayload>(
      'identity.user.create',
      createMessageEnvelope({
        schemaVersion: '1.0.0',
        messageId: randomUUID(),
        correlationId: command.correlationId,
        causationId: command.messageId,
        occurredAt: new Date().toISOString(),
        type: 'identity.user.create',
        source: 'onboarding-service',
        payload: {
          idempotencyKey: userStepKey(command.payload.idempotencyKey),
          requestHash: stableHash({
            rootRequestHash: command.payload.requestHash,
            step: 'identity.user.create',
          }),
          email: command.payload.email,
          name: command.payload.name,
          cellphone: command.payload.cellphone,
          taxId: command.payload.taxId,
        },
      }),
    );
  }

  private async requestPaymentCreation(
    command: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
    saga: AccountCreationSaga,
  ): Promise<PaymentIntentPayload> {
    if (!saga.userPayload) {
      throw new Error('Saga cannot create payment without a user snapshot');
    }

    return this.sendRpc<PaymentCreateCommandPayload, PaymentIntentPayload>(
      'payment.intent.create',
      createMessageEnvelope({
        schemaVersion: '1.0.0',
        messageId: randomUUID(),
        correlationId: command.correlationId,
        causationId: command.messageId,
        occurredAt: new Date().toISOString(),
        type: 'payment.intent.create',
        source: 'onboarding-service',
        payload: {
          idempotencyKey: paymentStepKey(command.payload.idempotencyKey),
          requestHash: stableHash({
            rootRequestHash: command.payload.requestHash,
            step: 'payment.intent.create',
            userId: saga.userPayload.id,
            amount: command.payload.amount,
            currency: command.payload.currency,
          }),
          userId: saga.userPayload.id,
          customerName: command.payload.name,
          customerEmail: command.payload.email,
          customerCellphone: command.payload.cellphone,
          customerTaxId: command.payload.taxId,
          amount: command.payload.amount,
          currency: command.payload.currency,
        },
      }),
    );
  }

  private async requestUserCompensation(
    command: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
    saga: AccountCreationSaga,
  ): Promise<CompensationResultPayload> {
    if (!saga.userPayload) {
      throw new Error('Saga cannot compensate without a user snapshot');
    }

    return this.sendRpc<
      UserCompensationCommandPayload,
      CompensationResultPayload
    >(
      'identity.user.compensate',
      createMessageEnvelope({
        schemaVersion: '1.0.0',
        messageId: randomUUID(),
        correlationId: command.correlationId,
        causationId: command.messageId,
        occurredAt: new Date().toISOString(),
        type: 'identity.user.compensate',
        source: 'onboarding-service',
        payload: {
          idempotencyKey: compensationStepKey(command.payload.idempotencyKey),
          userId: saga.userPayload.id,
          reason:
            'payment step failed before the onboarding saga could complete',
        },
      }),
    );
  }

  private async handlePaymentFailure(
    command: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
    saga: AccountCreationSaga,
    workerId: string,
    error: unknown,
  ): Promise<AccountCreationSaga> {
    const problem = toProblem(error);
    const retryable = isRetryable(problem);
    const nextAction: SagaNextAction = retryable
      ? 'PROCESS_PAYMENT'
      : 'COMPENSATE_USER';

    return this.onboardingRepository.markFailed({
      idempotencyKey: saga.idempotencyKey,
      workerId,
      correlationId: saga.rootCorrelationId,
      causationId: command.messageId,
      error: problem,
      retryable,
      nextAction,
      nextRetryAt: retryable ? nextRetryAt(saga.attempts + 1) : new Date(),
    });
  }

  private async waitForSettledSaga(
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CreateAccountResponse> {
    const deadline =
      Date.now() +
      this.configService.getOrThrow<{ rpcTimeoutMs: number }>('rabbitmq')
        .rpcTimeoutMs;

    while (Date.now() < deadline) {
      const saga =
        await this.onboardingRepository.findByIdempotencyKey(idempotencyKey);
      if (!saga) {
        break;
      }
      if (saga.requestHash !== requestHash) {
        throw conflict(
          'Idempotency-Key was already used with a different payload',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }

      const replay = this.tryCompletedReplay(saga);
      if (replay) {
        return withReplayFlag(replay, true);
      }
      if (isTerminalFailure(saga)) {
        throw toException(saga.error);
      }

      await sleep(DEFAULT_WAIT_POLL_MS);
    }

    throw conflict(
      'account creation is already in progress for this Idempotency-Key',
      'SAGA_IN_PROGRESS',
    );
  }

  private tryCompletedReplay(
    saga: AccountCreationSaga,
  ): CreateAccountResponse | null {
    if (saga.status === 'COMPLETED' && saga.response) {
      return saga.response;
    }
    return null;
  }

  private async recoverPendingSagas(): Promise<void> {
    if (this.recoveryInFlight || !this.rabbitBus.isReady()) {
      return;
    }

    this.recoveryInFlight = true;
    const workerId = this.workerId('recovery');

    try {
      const sagas = await this.onboardingRepository.claimRecoverable(
        workerId,
        this.leaseUntil(),
        DEFAULT_RECOVERY_BATCH_SIZE,
      );

      for (const saga of sagas) {
        const command = createMessageEnvelope({
          schemaVersion: '1.0.0',
          messageId: randomUUID(),
          correlationId: saga.rootCorrelationId,
          occurredAt: new Date().toISOString(),
          type: 'onboarding.account.create',
          source: 'onboarding-service.recovery',
          payload: saga.requestPayload,
        });

        try {
          await this.executeStateMachine(command, saga, workerId);
        } catch (error) {
          this.logger.warn(
            `recovery iteration failed for saga ${saga.idempotencyKey}: ${String(error)}`,
          );
        } finally {
          await this.onboardingRepository
            .release(saga.idempotencyKey, workerId)
            .catch(() => undefined);
        }
      }
    } finally {
      this.recoveryInFlight = false;
    }
  }

  private async sendRpc<TPayload, TResponse>(
    routingKey: string,
    envelope: MessageEnvelope<TPayload>,
  ): Promise<TResponse> {
    try {
      const response = await this.rabbitBus.sendRpc<TPayload, TResponse>(
        routingKey,
        envelope,
      );
      return unwrapRpc(response);
    } catch (error) {
      if (isProblemResponse(error)) {
        throw toException(error.error);
      }
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      this.logger.error(
        `downstream request failed for ${routingKey}: ${String(error)}`,
      );
      throw new BadGatewayException({
        title: 'Bad Gateway',
        status: 502,
        detail: 'A dependent service is temporarily unavailable.',
        code: 'DOWNSTREAM_UNAVAILABLE',
      });
    }
  }

  private leaseUntil(): Date {
    return new Date(Date.now() + DEFAULT_SAGA_LEASE_MS);
  }

  private workerId(kind: 'command' | 'recovery'): string {
    return `${this.configService.getOrThrow<string>(
      'runtimeInstanceId',
    )}:${kind}:${randomUUID()}`;
  }

  private logSaga(
    message: string,
    saga: AccountCreationSaga,
    causationId: string,
  ): void {
    this.logger.log(
      JSON.stringify({
        message,
        idempotencyKey: saga.idempotencyKey,
        status: saga.status,
        nextAction: saga.nextAction,
        attempts: saga.attempts,
        correlationId: saga.rootCorrelationId,
        causationId,
      }),
    );
  }
}

function unwrapRpc<TData>(response: RpcResponse<TData>): TData {
  if (response.success) {
    return response.data;
  }
  throw toException(response.error);
}

function toProblem(error: unknown): ProblemSnapshot {
  if (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof BadGatewayException
  ) {
    return extractProblemFromException(error);
  }

  if (isProblemResponse(error)) {
    return error.error;
  }

  if (error instanceof Error) {
    return downStreamProblem(
      'A dependent service is temporarily unavailable.',
      'DOWNSTREAM_UNAVAILABLE',
    );
  }

  return {
    status: 500,
    title: 'Internal Server Error',
    detail: 'The onboarding request could not be completed.',
  };
}

function extractProblemFromException(
  error: BadRequestException | ConflictException | BadGatewayException,
): ProblemSnapshot {
  const response = error.getResponse();
  if (typeof response === 'object' && response !== null) {
    const body = response as Record<string, unknown>;
    return {
      status: error.getStatus(),
      title:
        typeof body.title === 'string'
          ? body.title
          : defaultTitle(error.getStatus()),
      detail: typeof body.detail === 'string' ? body.detail : error.message,
      ...(typeof body.code === 'string' ? { code: body.code } : {}),
    };
  }

  return {
    status: error.getStatus(),
    title: defaultTitle(error.getStatus()),
    detail: error.message,
  };
}

function toException(problem: ProblemSnapshot): Error {
  switch (problem.status) {
    case 400:
      return new BadRequestException(problem);
    case 409:
      return new ConflictException(problem);
    default:
      return new BadGatewayException(problem);
  }
}

function toPublicPayment(
  payment: PaymentIntentPayload,
): PublicPaymentIntentPayload {
  return {
    id: payment.id,
    paymentReference: payment.paymentReference,
    amount: payment.amount,
    currency: payment.currency,
    paymentStatus: payment.paymentStatus,
    deliveryStatus: payment.deliveryStatus,
    expiresAt: payment.expiresAt,
    qrCode: payment.qrCode,
    ...(payment.qrCodeImageUrl
      ? { qrCodeImageUrl: payment.qrCodeImageUrl }
      : {}),
  };
}

function composeResponse(
  correlationId: string,
  idempotencyKey: string,
  user: UserPayload | null,
  payment: PublicPaymentIntentPayload | null,
  replayed: boolean,
): CreateAccountResponse {
  if (!user || !payment) {
    throw new Error('Saga snapshot is incomplete');
  }

  return {
    user,
    payment,
    meta: {
      correlationId,
      idempotencyKey,
      replayed,
    },
  };
}

function withReplayFlag(
  response: CreateAccountResponse,
  replayed: boolean,
): CreateAccountResponse {
  return {
    ...response,
    meta: {
      ...response.meta,
      replayed,
    },
  };
}

function isTerminalFailure(
  saga: AccountCreationSaga,
): saga is AccountCreationSaga & {
  error: ProblemSnapshot;
} {
  return (
    (saga.status === 'FAILED' || saga.status === 'COMPENSATED') &&
    !saga.retryable &&
    saga.error !== null
  );
}

function isRetryable(problem: ProblemSnapshot): boolean {
  return problem.status >= 500;
}

function defaultTitle(status: number): string {
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

function downStreamProblem(detail: string, code: string): ProblemSnapshot {
  return {
    status: 502,
    title: 'Bad Gateway',
    detail,
    code,
  };
}

function conflict(detail: string, code: string): ConflictException {
  return new ConflictException({
    title: 'Conflict',
    status: 409,
    detail,
    code,
  });
}

function userStepKey(idempotencyKey: string): string {
  return `user:${idempotencyKey}`;
}

function paymentStepKey(idempotencyKey: string): string {
  return `payment:${idempotencyKey}`;
}

function compensationStepKey(idempotencyKey: string): string {
  return `compensate:user:${idempotencyKey}`;
}

function nextRetryAt(attempt: number): Date {
  const seconds = Math.min(30, 2 ** Math.min(attempt, 5));
  return new Date(Date.now() + seconds * 1000);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isProblemResponse(value: unknown): value is RpcErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    (value as { success?: unknown }).success === false &&
    'error' in value
  );
}
