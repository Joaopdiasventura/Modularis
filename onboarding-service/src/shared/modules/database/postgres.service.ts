import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface Queryable {
  query<TResult extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: ReadonlyArray<unknown>,
  ): Promise<QueryResult<TResult>>;
}

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private pool?: Pool;
  private ready = false;

  public constructor(private readonly configService: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.configService.getOrThrow<string>(
        'postgres.connectionString',
      ),
      connectionTimeoutMillis: this.configService.getOrThrow<number>(
        'postgres.connectionTimeoutMs',
      ),
    });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS account_creation_sagas (
        idempotency_key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        request_payload_json JSONB NOT NULL,
        root_correlation_id TEXT NOT NULL,
        status VARCHAR(32) NOT NULL,
        next_action VARCHAR(32) NOT NULL DEFAULT 'PROCESS_USER',
        user_payload_json JSONB,
        payment_payload_json JSONB,
        response_json JSONB,
        error_json JSONB,
        retryable BOOLEAN NOT NULL DEFAULT FALSE,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error_at TIMESTAMPTZ,
        next_retry_at TIMESTAMPTZ,
        locked_by TEXT,
        locked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      ALTER TABLE account_creation_sagas
      ADD COLUMN IF NOT EXISTS next_action VARCHAR(32) NOT NULL DEFAULT 'PROCESS_USER'
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS account_creation_sagas_retry_idx
      ON account_creation_sagas (status, next_action, next_retry_at)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS account_creation_sagas_lock_idx
      ON account_creation_sagas (locked_until)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS account_creation_saga_transitions (
        id BIGSERIAL PRIMARY KEY,
        idempotency_key TEXT NOT NULL,
        from_status VARCHAR(32),
        to_status VARCHAR(32) NOT NULL,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        detail_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    this.ready = true;
  }

  public async onModuleDestroy(): Promise<void> {
    this.ready = false;
    if (this.pool) await this.pool.end();
  }

  public isReady(): boolean {
    return this.ready;
  }

  public async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('Postgres pool is not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async query<TResult extends QueryResultRow = QueryResultRow>(
    text: string,
    values: ReadonlyArray<unknown> = [],
  ): Promise<QueryResult<TResult>> {
    if (!this.pool) {
      throw new Error('Postgres pool is not initialized');
    }
    return this.pool.query<TResult>(text, [...values]);
  }
}
