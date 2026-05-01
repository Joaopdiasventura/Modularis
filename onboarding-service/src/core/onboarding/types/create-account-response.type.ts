import type {
  PaymentIntentPayload,
  UserPayload,
} from '../../../shared/modules/messaging/contracts';

export interface CreateAccountResponse {
  user: UserPayload;
  payment: Omit<PaymentIntentPayload, 'replayed'>;
  meta: {
    correlationId: string;
    idempotencyKey: string;
    replayed: boolean;
  };
}
