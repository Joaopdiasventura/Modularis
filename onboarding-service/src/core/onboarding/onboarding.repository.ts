import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import {
  PostgresService,
  Queryable,
} from '../../shared/modules/database/postgres.service';
import {
  OnboardingAccountCreateResponsePayload,
  OnboardingAccountCreateCommandPayload,
  PublicPaymentIntentPayload,
  UserPayload,
} from '../../shared/modules/messaging/contracts';
import type { CreateAccountResponse } from './types/create-account-response.type';

export type SagaStatus =
  | 'STARTED'
  | 'USER_CREATED'
  | 'PAYMENT_CREATED'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATED';

export type SagaNextAction =
  | 'PROCESS_USER'
  | 'PROCESS_PAYMENT'
  | 'COMPENSATE_USER'
  | 'COMPLETE'
  | 'NOOP';

export interface ProblemSnapshot {
  status: number;
  title: string;
  detail: string;
  code?: string;
}

export interface AccountCreationSaga {
  idempotencyKey: string;
  requestHash: string;
  requestPayload: OnboardingAccountCreateCommandPayload;
  rootCorrelationId: string;
  status: SagaStatus;
  nextAction: SagaNextAction;
  userPayload: UserPayload | null;
  paymentPayload: PublicPaymentIntentPayload | null;
  response: OnboardingAccountCreateResponsePayload | null;
  error: ProblemSnapshot | null;
  retryable: boolean;
  attempts: number;
  lastErrorAt: string | null;
  nextRetryAt: string | null;
  lockedBy: string | null;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SagaRow extends QueryResultRow {
  idempotency_key: string;
  request_hash: string;
  request_payload_json: OnboardingAccountCreateCommandPayload;
  root_correlation_id: string;
  status: SagaStatus;
  next_action: SagaNextAction;
  user_payload_json: UserPayload | null;
  payment_payload_json: PublicPaymentIntentPayload | null;
  response_json: OnboardingAccountCreateResponsePayload | null;
  error_json: ProblemSnapshot | null;
  retryable: boolean;
  attempts: number;
  last_error_at: Date | null;
  next_retry_at: Date | null;
  locked_by: string | null;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class SagaHashConflictError extends Error {
  public constructor() {
    super('Idempotency-Key was already used with a different payload');
  }
}

@Injectable()
export class OnboardingRepository {
  public constructor(private readonly postgresService: PostgresService) {}

  public async tryAcquire(input: {
    idempotencyKey: string;
    requestHash: string;
    correlationId: string;
    workerId: string;
    lockedUntil: Date;
    requestPayload: OnboardingAccountCreateCommandPayload;
  }): Promise<AccountCreationSaga | null> {
    return this.postgresService.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO account_creation_sagas (
            idempotency_key,
            request_hash,
            request_payload_json,
            root_correlation_id,
            status,
            next_action,
            next_retry_at
          )
          VALUES ($1, $2, $3::jsonb, $4, 'STARTED', 'PROCESS_USER', NOW())
          ON CONFLICT (idempotency_key) DO NOTHING
        `,
        [
          input.idempotencyKey,
          input.requestHash,
          JSON.stringify(input.requestPayload),
          input.correlationId,
        ],
      );

      const result = await client.query<SagaRow>(
        `
          SELECT *
          FROM account_creation_sagas
          WHERE idempotency_key = $1
          FOR UPDATE
        `,
        [input.idempotencyKey],
      );
      if (result.rowCount === 0) return null;

      const existing = result.rows[0];
      if (existing.request_hash !== input.requestHash) {
        throw new SagaHashConflictError();
      }

      if (
        existing.locked_until &&
        existing.locked_until.getTime() > Date.now() &&
        existing.locked_by &&
        existing.locked_by !== input.workerId
      ) {
        return null;
      }

      const claimed = await client.query<SagaRow>(
        `
          UPDATE account_creation_sagas
          SET
            locked_by = $2,
            locked_until = $3,
            updated_at = NOW()
          WHERE idempotency_key = $1
          RETURNING *
        `,
        [input.idempotencyKey, input.workerId, input.lockedUntil.toISOString()],
      );
      return toSaga(claimed.rows[0]);
    });
  }

  public async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<AccountCreationSaga | null> {
    const result = await this.postgresService.query<SagaRow>(
      `
        SELECT *
        FROM account_creation_sagas
        WHERE idempotency_key = $1
      `,
      [idempotencyKey],
    );
    if (result.rowCount === 0) return null;
    return toSaga(result.rows[0]);
  }

  public async claimRecoverable(
    workerId: string,
    lockedUntil: Date,
    limit: number,
  ): Promise<AccountCreationSaga[]> {
    return this.postgresService.withTransaction(async (client) => {
      const recoverable = await client.query<SagaRow>(
        `
          SELECT *
          FROM account_creation_sagas
          WHERE status IN ('STARTED', 'USER_CREATED', 'PAYMENT_CREATED', 'FAILED')
            AND (status <> 'FAILED' OR retryable = TRUE)
            AND COALESCE(next_retry_at, NOW()) <= NOW()
            AND (locked_until IS NULL OR locked_until < NOW())
          ORDER BY updated_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        `,
        [limit],
      );
      if (recoverable.rowCount === 0) {
        return [];
      }

      const claimed: AccountCreationSaga[] = [];
      for (const row of recoverable.rows) {
        const result = await client.query<SagaRow>(
          `
            UPDATE account_creation_sagas
            SET
              locked_by = $2,
              locked_until = $3,
              updated_at = NOW()
            WHERE idempotency_key = $1
            RETURNING *
          `,
          [row.idempotency_key, workerId, lockedUntil.toISOString()],
        );
        claimed.push(toSaga(result.rows[0]));
      }

      return claimed;
    });
  }

  public async markUserCreated(input: {
    idempotencyKey: string;
    workerId: string;
    correlationId: string;
    causationId: string;
    userPayload: UserPayload;
  }): Promise<AccountCreationSaga> {
    return this.transition(input, 'USER_CREATED', {
      next_action: 'PROCESS_PAYMENT',
      user_payload_json: JSON.stringify(input.userPayload),
      error_json: null,
      retryable: false,
      next_retry_at: null,
      response_json: null,
    });
  }

  public async markPaymentCreated(input: {
    idempotencyKey: string;
    workerId: string;
    correlationId: string;
    causationId: string;
    paymentPayload: PublicPaymentIntentPayload;
  }): Promise<AccountCreationSaga> {
    return this.transition(input, 'PAYMENT_CREATED', {
      next_action: 'COMPLETE',
      payment_payload_json: JSON.stringify(input.paymentPayload),
      error_json: null,
      retryable: false,
      next_retry_at: null,
      response_json: null,
    });
  }

  public async markCompleted(input: {
    idempotencyKey: string;
    workerId: string;
    correlationId: string;
    causationId: string;
    response: CreateAccountResponse;
  }): Promise<AccountCreationSaga> {
    return this.transition(
      input,
      'COMPLETED',
      {
        next_action: 'NOOP',
        response_json: JSON.stringify(input.response),
        error_json: null,
        retryable: false,
        next_retry_at: null,
        locked_by: null,
        locked_until: null,
      },
      { response: input.response },
    );
  }

  public async markFailed(input: {
    idempotencyKey: string;
    workerId: string;
    correlationId: string;
    causationId: string;
    error: ProblemSnapshot;
    retryable: boolean;
    nextAction: SagaNextAction;
    nextRetryAt: Date | null;
  }): Promise<AccountCreationSaga> {
    return this.transition(
      input,
      'FAILED',
      {
        next_action: input.nextAction,
        error_json: JSON.stringify(input.error),
        retryable: input.retryable,
        attempts: 'attempts + 1',
        last_error_at: 'NOW()',
        next_retry_at: input.nextRetryAt?.toISOString() ?? null,
        locked_by: null,
        locked_until: null,
      },
      { error: input.error, retryable: input.retryable },
    );
  }

  public async markCompensated(input: {
    idempotencyKey: string;
    workerId: string;
    correlationId: string;
    causationId: string;
    error: ProblemSnapshot;
  }): Promise<AccountCreationSaga> {
    return this.transition(
      input,
      'COMPENSATED',
      {
        next_action: 'NOOP',
        error_json: JSON.stringify(input.error),
        retryable: false,
        attempts: 'attempts + 1',
        last_error_at: 'NOW()',
        next_retry_at: null,
        locked_by: null,
        locked_until: null,
      },
      { error: input.error },
    );
  }

  public async release(
    idempotencyKey: string,
    workerId: string,
  ): Promise<void> {
    await this.postgresService.query(
      `
        UPDATE account_creation_sagas
        SET
          locked_by = NULL,
          locked_until = NULL,
          updated_at = NOW()
        WHERE idempotency_key = $1
          AND locked_by = $2
      `,
      [idempotencyKey, workerId],
    );
  }

  private async transition(
    input: {
      idempotencyKey: string;
      workerId: string;
      correlationId: string;
      causationId: string;
    },
    nextStatus: SagaStatus,
    updates: Record<string, string | null | boolean>,
    detail: Record<string, unknown> = {},
  ): Promise<AccountCreationSaga> {
    return this.postgresService.withTransaction(async (client) => {
      const current = await client.query<SagaRow>(
        `
          SELECT *
          FROM account_creation_sagas
          WHERE idempotency_key = $1
            AND locked_by = $2
          FOR UPDATE
        `,
        [input.idempotencyKey, input.workerId],
      );
      if (current.rowCount === 0) {
        throw new Error('Saga is not locked by the current worker');
      }

      const statements: string[] = ['status = $3', 'updated_at = NOW()'];
      const values: unknown[] = [
        input.idempotencyKey,
        input.workerId,
        nextStatus,
      ];
      let parameterIndex = 4;

      for (const [field, value] of Object.entries(updates)) {
        if (value === null) {
          statements.push(`${field} = NULL`);
          continue;
        }
        if (typeof value === 'string' && isTrustedSql(value)) {
          statements.push(`${field} = ${value}`);
          continue;
        }
        statements.push(`${field} = $${parameterIndex}`);
        values.push(value);
        parameterIndex += 1;
      }

      const updated = await client.query<SagaRow>(
        `
          UPDATE account_creation_sagas
          SET ${statements.join(', ')}
          WHERE idempotency_key = $1
            AND locked_by = $2
          RETURNING *
        `,
        values,
      );

      await recordTransition(
        client,
        input.idempotencyKey,
        current.rows[0].status,
        nextStatus,
        input.correlationId,
        input.causationId,
        detail,
      );

      return toSaga(updated.rows[0]);
    });
  }
}

async function recordTransition(
  client: Queryable,
  idempotencyKey: string,
  fromStatus: SagaStatus,
  toStatus: SagaStatus,
  correlationId: string,
  causationId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `
      INSERT INTO account_creation_saga_transitions (
        idempotency_key,
        from_status,
        to_status,
        correlation_id,
        causation_id,
        detail_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      idempotencyKey,
      fromStatus,
      toStatus,
      correlationId,
      causationId,
      JSON.stringify(detail),
    ],
  );
}

function isTrustedSql(value: string): boolean {
  return value === 'attempts + 1' || value === 'NOW()';
}

function toSaga(row: SagaRow): AccountCreationSaga {
  return {
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    requestPayload: row.request_payload_json,
    rootCorrelationId: row.root_correlation_id,
    status: row.status,
    nextAction: row.next_action,
    userPayload: row.user_payload_json,
    paymentPayload: row.payment_payload_json,
    response: row.response_json,
    error: row.error_json,
    retryable: row.retryable,
    attempts: row.attempts,
    lastErrorAt: row.last_error_at?.toISOString() ?? null,
    nextRetryAt: row.next_retry_at?.toISOString() ?? null,
    lockedBy: row.locked_by,
    lockedUntil: row.locked_until?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
