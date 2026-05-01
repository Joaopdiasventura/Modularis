import { ConflictException } from '@nestjs/common';
import {
  MessageEnvelope,
  OnboardingAccountCreateCommandPayload,
  PaymentCreateCommandPayload,
  UserCompensationCommandPayload,
  UserCreateCommandPayload,
} from '../../../shared/modules/messaging/contracts';
import { OnboardingService } from '../onboarding.service';
import type { CreateAccountResponse } from '../types/create-account-response.type';

type SendRpcStub = <TPayload>(
  routingKey: string,
  envelope: MessageEnvelope<TPayload>,
) => Promise<unknown>;

describe('OnboardingService', () => {
  const command: MessageEnvelope<OnboardingAccountCreateCommandPayload> = {
    schemaVersion: '1.0.0',
    messageId: 'cmd-1',
    correlationId: 'corr-1',
    occurredAt: '2026-04-27T00:00:00Z',
    type: 'onboarding.account.create',
    source: 'api-gateway',
    payload: {
      idempotencyKey: 'idem-1',
      requestHash: 'hash-1',
      email: 'john@example.com',
      name: 'John Doe',
      cellphone: '5511999999999',
      taxId: '12345678900',
      amount: 49,
      currency: 'BRL',
    },
  };

  function configService() {
    return {
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case 'runtimeInstanceId':
            return 'instance-1';
          case 'rabbitmq':
            return { rpcTimeoutMs: 500 };
          default:
            throw new Error(`unexpected config key ${key}`);
        }
      }),
    };
  }

  it('persists and advances the onboarding saga through user and payment creation', async () => {
    const sendRpc: jest.MockedFunction<SendRpcStub> = jest.fn();
    sendRpc
      .mockResolvedValueOnce({
        success: true,
        data: {
          user: {
            id: 'user-1',
            email: command.payload.email,
            name: command.payload.name,
            isPremium: false,
          },
          replayed: false,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'payment-1',
          paymentReference: 'ref-1',
          amount: command.payload.amount,
          currency: command.payload.currency,
          paymentStatus: 'PENDING',
          deliveryStatus: 'PENDING',
          expiresAt: '2026-04-25T12:00:00Z',
          qrCode: 'qr-code',
          replayed: false,
        },
      });
    const rabbitBus = {
      sendRpc,
      isReady: jest.fn().mockReturnValue(true),
    };
    const onboardingRepository = {
      tryAcquire: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'STARTED',
        nextAction: 'PROCESS_USER',
        userPayload: null,
        paymentPayload: null,
        response: null,
        error: null,
        retryable: false,
        attempts: 0,
      }),
      markUserCreated: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'USER_CREATED',
        nextAction: 'PROCESS_PAYMENT',
        userPayload: {
          id: 'user-1',
          email: command.payload.email,
          name: command.payload.name,
          isPremium: false,
        },
        paymentPayload: null,
        response: null,
        error: null,
        retryable: false,
        attempts: 0,
      }),
      markPaymentCreated: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'PAYMENT_CREATED',
        nextAction: 'COMPLETE',
        userPayload: {
          id: 'user-1',
          email: command.payload.email,
          name: command.payload.name,
          isPremium: false,
        },
        paymentPayload: {
          id: 'payment-1',
          paymentReference: 'ref-1',
          amount: command.payload.amount,
          currency: command.payload.currency,
          paymentStatus: 'PENDING',
          deliveryStatus: 'PENDING',
          expiresAt: '2026-04-25T12:00:00Z',
          qrCode: 'qr-code',
        },
        response: null,
        error: null,
        retryable: false,
        attempts: 0,
      }),
      markCompleted: jest
        .fn()
        .mockImplementation(
          ({ response }: { response: CreateAccountResponse }) => ({
            status: 'COMPLETED',
            nextAction: 'NOOP',
            response,
          }),
        ),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const service = new OnboardingService(
      rabbitBus as never,
      onboardingRepository as never,
      configService() as never,
    );
    const result = await service.create(command);

    expect(sendRpc).toHaveBeenCalledTimes(2);
    const [userRoutingKey, userEnvelope] = sendRpc.mock.calls[0] as [
      string,
      MessageEnvelope<UserCreateCommandPayload>,
    ];
    expect(userRoutingKey).toBe('identity.user.create');
    expect(userEnvelope.correlationId).toBe('corr-1');
    expect(userEnvelope.type).toBe('identity.user.create');
    expect(userEnvelope.payload.idempotencyKey).toBe('user:idem-1');
    expect(userEnvelope.payload.email).toBe(command.payload.email);

    const [paymentRoutingKey, paymentEnvelope] = sendRpc.mock.calls[1] as [
      string,
      MessageEnvelope<PaymentCreateCommandPayload>,
    ];
    expect(paymentRoutingKey).toBe('payment.intent.create');
    expect(paymentEnvelope.correlationId).toBe('corr-1');
    expect(paymentEnvelope.type).toBe('payment.intent.create');
    expect(paymentEnvelope.payload.idempotencyKey).toBe('payment:idem-1');
    expect(paymentEnvelope.payload.userId).toBe('user-1');
    expect(onboardingRepository.markCompleted).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe('user-1');
    expect(result.payment.paymentReference).toBe('ref-1');
  });

  it('replays a completed saga without invoking downstream services', async () => {
    const sendRpc: jest.MockedFunction<SendRpcStub> = jest.fn();
    const rabbitBus = {
      sendRpc,
      isReady: jest.fn().mockReturnValue(true),
    };
    const onboardingRepository = {
      tryAcquire: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'COMPLETED',
        nextAction: 'NOOP',
        userPayload: null,
        paymentPayload: null,
        response: {
          user: {
            id: 'user-1',
            email: command.payload.email,
            name: command.payload.name,
            isPremium: false,
          },
          payment: {
            id: 'payment-1',
            paymentReference: 'ref-1',
            amount: command.payload.amount,
            currency: command.payload.currency,
            paymentStatus: 'PENDING',
            deliveryStatus: 'PENDING',
            expiresAt: '2026-04-25T12:00:00Z',
            qrCode: 'qr-code',
          },
          meta: {
            correlationId: 'corr-1',
            idempotencyKey: 'idem-1',
            replayed: false,
          },
        },
        error: null,
        retryable: false,
        attempts: 0,
      }),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const service = new OnboardingService(
      rabbitBus as never,
      onboardingRepository as never,
      configService() as never,
    );
    const result = await service.create(command);

    expect(rabbitBus.sendRpc).not.toHaveBeenCalled();
    expect(result.meta.replayed).toBe(true);
  });

  it('compensates the created user when payment creation fails permanently', async () => {
    const sendRpc: jest.MockedFunction<SendRpcStub> = jest.fn();
    sendRpc
      .mockResolvedValueOnce({
        success: true,
        data: {
          user: {
            id: 'user-1',
            email: command.payload.email,
            name: command.payload.name,
            isPremium: false,
          },
          replayed: false,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: {
          status: 409,
          title: 'Conflict',
          detail: 'customer cannot create a new payment intent',
          code: 'PAYMENT_CONFLICT',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          compensated: true,
          replayed: false,
        },
      });
    const rabbitBus = {
      sendRpc,
      isReady: jest.fn().mockReturnValue(true),
    };
    const onboardingRepository = {
      tryAcquire: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'STARTED',
        nextAction: 'PROCESS_USER',
        userPayload: null,
        paymentPayload: null,
        response: null,
        error: null,
        retryable: false,
        attempts: 0,
      }),
      markUserCreated: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'USER_CREATED',
        nextAction: 'PROCESS_PAYMENT',
        userPayload: {
          id: 'user-1',
          email: command.payload.email,
          name: command.payload.name,
          isPremium: false,
        },
        paymentPayload: null,
        response: null,
        error: null,
        retryable: false,
        attempts: 0,
      }),
      markFailed: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'FAILED',
        nextAction: 'COMPENSATE_USER',
        userPayload: {
          id: 'user-1',
          email: command.payload.email,
          name: command.payload.name,
          isPremium: false,
        },
        paymentPayload: null,
        response: null,
        error: {
          status: 409,
          title: 'Conflict',
          detail: 'customer cannot create a new payment intent',
          code: 'PAYMENT_CONFLICT',
        },
        retryable: false,
        attempts: 1,
      }),
      markCompensated: jest.fn().mockResolvedValue({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'COMPENSATED',
        nextAction: 'NOOP',
        userPayload: {
          id: 'user-1',
          email: command.payload.email,
          name: command.payload.name,
          isPremium: false,
        },
        paymentPayload: null,
        response: null,
        error: {
          status: 409,
          title: 'Conflict',
          detail: 'customer cannot create a new payment intent',
          code: 'PAYMENT_CONFLICT',
        },
        retryable: false,
        attempts: 1,
      }),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const service = new OnboardingService(
      rabbitBus as never,
      onboardingRepository as never,
      configService() as never,
    );

    await expect(service.create(command)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const [compensationRoutingKey, compensationEnvelope] = sendRpc.mock
      .calls[2] as [string, MessageEnvelope<UserCompensationCommandPayload>];
    expect(compensationRoutingKey).toBe('identity.user.compensate');
    expect(compensationEnvelope.payload.idempotencyKey).toBe(
      'compensate:user:idem-1',
    );
    expect(compensationEnvelope.payload.userId).toBe('user-1');
  });

  it('returns the already completed snapshot while another worker owns the saga lock', async () => {
    const sendRpc: jest.MockedFunction<SendRpcStub> = jest.fn();
    const rabbitBus = {
      sendRpc,
      isReady: jest.fn().mockReturnValue(true),
    };
    const onboardingRepository = {
      tryAcquire: jest.fn().mockResolvedValue(null),
      findByIdempotencyKey: jest.fn().mockResolvedValueOnce({
        idempotencyKey: 'idem-1',
        requestHash: 'hash-1',
        requestPayload: command.payload,
        rootCorrelationId: 'corr-1',
        status: 'COMPLETED',
        nextAction: 'NOOP',
        userPayload: null,
        paymentPayload: null,
        response: {
          user: {
            id: 'user-1',
            email: command.payload.email,
            name: command.payload.name,
            isPremium: false,
          },
          payment: {
            id: 'payment-1',
            paymentReference: 'ref-1',
            amount: command.payload.amount,
            currency: command.payload.currency,
            paymentStatus: 'PENDING',
            deliveryStatus: 'PENDING',
            expiresAt: '2026-04-25T12:00:00Z',
            qrCode: 'qr-code',
          },
          meta: {
            correlationId: 'corr-1',
            idempotencyKey: 'idem-1',
            replayed: false,
          },
        },
        error: null,
        retryable: false,
        attempts: 0,
      }),
    };

    const service = new OnboardingService(
      rabbitBus as never,
      onboardingRepository as never,
      configService() as never,
    );
    const result = await service.create(command);

    expect(result.meta.replayed).toBe(true);
    expect(rabbitBus.sendRpc).not.toHaveBeenCalled();
  });
});
