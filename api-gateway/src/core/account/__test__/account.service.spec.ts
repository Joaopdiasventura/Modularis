import { ConflictException } from '@nestjs/common';
import { AccountService } from '../account.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import {
  MessageEnvelope,
  OnboardingAccountCreateCommandPayload,
  OnboardingAccountCreateResponsePayload,
  RpcResponse,
} from '../../../shared/modules/messaging/contracts';

type SendRpcStub = (
  routingKey: string,
  envelope: MessageEnvelope<OnboardingAccountCreateCommandPayload>,
) => Promise<RpcResponse<OnboardingAccountCreateResponsePayload>>;

describe('AccountService', () => {
  const dto: CreateAccountDto = {
    email: 'john@example.com',
    name: 'John Doe',
    cellphone: '5511999999999',
    taxId: '12345678900',
    amount: 49,
    currency: 'BRL',
  };

  it('delegates public account creation to the onboarding saga', async () => {
    const sendRpc: jest.MockedFunction<SendRpcStub> = jest.fn();
    sendRpc.mockResolvedValueOnce({
      success: true,
      data: {
        user: {
          id: 'user-1',
          email: dto.email,
          name: dto.name,
          isPremium: false,
        },
        payment: {
          id: 'payment-1',
          paymentReference: 'ref-1',
          amount: dto.amount,
          currency: dto.currency,
          paymentStatus: 'PENDING',
          deliveryStatus: 'PENDING',
          expiresAt: '2026-04-25T12:00:00Z',
          qrCode: 'qr-code',
        },
        meta: {
          correlationId: 'corr-1',
          idempotencyKey: 'idem-1',
          replayed: true,
        },
      },
    });
    const rabbitBus = {
      sendRpc,
    };

    const service = new AccountService(rabbitBus as never);
    const result = await service.create('corr-1', 'idem-1', dto);

    expect(sendRpc).toHaveBeenCalledTimes(1);
    const [routingKey, envelope] = sendRpc.mock.calls[0];
    expect(routingKey).toBe('onboarding.account.create');
    expect(envelope.correlationId).toBe('corr-1');
    expect(envelope.type).toBe('onboarding.account.create');
    expect(envelope.payload.idempotencyKey).toBe('idem-1');
    expect(envelope.payload.email).toBe(dto.email);
    expect(envelope.payload.amount).toBe(dto.amount);
    expect(result.meta.replayed).toBe(true);
    expect(result.payment.paymentReference).toBe('ref-1');
  });

  it('maps RPC conflicts to ConflictException', async () => {
    const sendRpc: jest.MockedFunction<SendRpcStub> = jest.fn();
    sendRpc.mockResolvedValueOnce({
      success: false,
      error: {
        status: 409,
        title: 'Conflict',
        detail:
          'account creation is already in progress for this Idempotency-Key',
        code: 'SAGA_IN_PROGRESS',
      },
    });
    const rabbitBus = {
      sendRpc,
    };

    const service = new AccountService(rabbitBus as never);

    await expect(
      service.create('corr-1', 'idem-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
