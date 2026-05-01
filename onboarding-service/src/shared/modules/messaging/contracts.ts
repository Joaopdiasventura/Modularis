export interface MessageEnvelope<TPayload> {
  schemaVersion: string;
  messageId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  type: string;
  eventVersion?: string;
  id?: string;
  timestamp?: string;
  eventType?: string;
  source?: string;
  payload: TPayload;
}

export function createMessageEnvelope<TPayload>(input: {
  schemaVersion: string;
  messageId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  type: string;
  source: string;
  payload: TPayload;
}): MessageEnvelope<TPayload> {
  return {
    schemaVersion: input.schemaVersion,
    messageId: input.messageId,
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    occurredAt: input.occurredAt,
    type: input.type,
    eventVersion: input.schemaVersion,
    id: input.messageId,
    timestamp: input.occurredAt,
    eventType: input.type,
    source: input.source,
    payload: input.payload,
  };
}

export interface RpcSuccessResponse<TData> {
  success: true;
  data: TData;
}

export interface RpcErrorResponse {
  success: false;
  error: {
    status: number;
    title: string;
    detail: string;
    code?: string;
  };
}

export type RpcResponse<TData> = RpcSuccessResponse<TData> | RpcErrorResponse;

export type RpcEnvelope<TData> = MessageEnvelope<RpcResponse<TData>>;

export interface UserCreateCommandPayload {
  idempotencyKey: string;
  requestHash: string;
  email: string;
  name: string;
  cellphone: string;
  taxId: string;
}

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  isPremium: boolean;
}

export interface UserCreateResponsePayload {
  user: UserPayload;
  replayed: boolean;
}

export interface OnboardingAccountCreateCommandPayload {
  idempotencyKey: string;
  requestHash: string;
  email: string;
  name: string;
  cellphone: string;
  taxId: string;
  amount: number;
  currency: string;
}

export interface PaymentCreateCommandPayload {
  idempotencyKey: string;
  requestHash: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerCellphone: string;
  customerTaxId: string;
  amount: number;
  currency: string;
}

export interface CompensationResultPayload {
  compensated: boolean;
  replayed: boolean;
}

export interface UserCompensationCommandPayload {
  idempotencyKey: string;
  userId: string;
  reason: string;
}

export interface PaymentCompensationCommandPayload {
  idempotencyKey: string;
  paymentId?: string;
  reason: string;
}

export interface PaymentIntentPayload {
  id: string;
  paymentReference: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  deliveryStatus: string;
  expiresAt: string;
  qrCode: string;
  qrCodeImageUrl?: string;
  replayed: boolean;
}

export type PublicPaymentIntentPayload = Omit<PaymentIntentPayload, 'replayed'>;

export interface OnboardingAccountCreateResponsePayload {
  user: UserPayload;
  payment: PublicPaymentIntentPayload;
  meta: {
    correlationId: string;
    idempotencyKey: string;
    replayed: boolean;
  };
}
