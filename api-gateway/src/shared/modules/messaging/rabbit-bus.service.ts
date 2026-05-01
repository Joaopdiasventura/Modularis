import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { UserEventStreamService } from '../../../core/event-stream/user-event-stream.service';
import { MessageEnvelope, RpcEnvelope, RpcResponse } from './contracts';

type PendingRpcResolver = (value: RpcResponse<unknown>) => void;

@Injectable()
export class RabbitBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitBusService.name);
  private connection?: AmqpConnectionManager;
  private rpcChannel?: ChannelWrapper;
  private eventsChannel?: ChannelWrapper;
  private replyQueue?: string;
  private replyRoutingKey?: string;
  private connected = false;
  private readonly pendingRpc = new Map<
    string,
    {
      resolve: PendingRpcResolver;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  public constructor(
    private readonly configService: ConfigService,
    private readonly streamService: UserEventStreamService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const rabbitUrl = this.configService.getOrThrow<string>('rabbitmq.url');
    this.connection = amqp.connect([rabbitUrl]);
    this.connection.on('connect', () => {
      this.connected = true;
      this.logger.log('Connected to RabbitMQ');
    });
    this.connection.on('disconnect', ({ err }: { err: Error }) => {
      this.connected = false;
      this.logger.error(
        `Disconnected from RabbitMQ: ${err?.message ?? 'unknown error'}`,
      );
    });

    this.rpcChannel = this.connection.createChannel({
      name: 'gateway-rpc',
      setup: async (channel: Channel) => {
        await channel.assertExchange(
          this.configService.getOrThrow<string>('rabbitmq.commandExchange'),
          'topic',
          { durable: true },
        );
        await channel.assertExchange(
          this.configService.getOrThrow<string>('rabbitmq.eventExchange'),
          'topic',
          { durable: true },
        );
        await channel.assertExchange(
          this.configService.getOrThrow<string>('rabbitmq.responseExchange'),
          'topic',
          { durable: true },
        );
        const reply = await channel.assertQueue('', {
          durable: false,
          exclusive: true,
          autoDelete: true,
        });
        this.replyQueue = reply.queue;
        this.replyRoutingKey = `${this.configService.getOrThrow<string>(
          'serviceName',
        )}.responses.${this.configService.getOrThrow<string>(
          'runtimeInstanceId',
        )}`;
        await channel.bindQueue(
          reply.queue,
          this.configService.getOrThrow<string>('rabbitmq.responseExchange'),
          this.replyRoutingKey,
        );
        await channel.consume(
          reply.queue,
          (message: ConsumeMessage | null): void => {
            if (!message) return;
            this.onRpcReply(message);
          },
          { noAck: true },
        );
      },
    });

    this.eventsChannel = this.connection.createChannel({
      name: 'gateway-events',
      setup: async (channel: Channel) => {
        const exchange = this.configService.getOrThrow<string>(
          'rabbitmq.eventExchange',
        );
        await channel.assertExchange(exchange, 'topic', { durable: true });
        const serviceName =
          this.configService.getOrThrow<string>('serviceName');
        const runtimeInstanceId =
          this.configService.getOrThrow<string>('runtimeInstanceId');
        const queueName = `${serviceName}.events.${runtimeInstanceId}`;
        await channel.assertQueue(queueName, {
          durable: false,
          autoDelete: true,
          exclusive: true,
        });
        await channel.bindQueue(queueName, exchange, 'payment.status-updated');
        await channel.bindQueue(queueName, exchange, 'user.premium-updated');
        await channel.consume(
          queueName,
          (message: ConsumeMessage | null): void =>
            this.onEvent(channel, message),
          {
            noAck: false,
          },
        );
      },
    });

    await this.rpcChannel.waitForConnect();
    await this.eventsChannel.waitForConnect();
  }

  public async onModuleDestroy(): Promise<void> {
    for (const pending of this.pendingRpc.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Rabbit bus is shutting down'));
    }
    this.pendingRpc.clear();
    if (this.eventsChannel) await this.eventsChannel.close();
    if (this.rpcChannel) await this.rpcChannel.close();
    if (this.connection) await this.connection.close();
  }

  public isReady(): boolean {
    return (
      this.connected &&
      Boolean(this.replyQueue) &&
      Boolean(this.replyRoutingKey)
    );
  }

  public async sendRpc<TPayload, TResponse>(
    routingKey: string,
    envelope: MessageEnvelope<TPayload>,
  ): Promise<RpcResponse<TResponse>> {
    const rpcChannel = this.rpcChannel;
    if (!rpcChannel || !this.replyQueue || !this.replyRoutingKey) {
      throw new Error('RabbitMQ RPC channel is not ready');
    }

    const rpcId = randomUUID();
    const timeoutMs = this.configService.getOrThrow<number>(
      'rabbitmq.rpcTimeoutMs',
    );
    const exchange = this.configService.getOrThrow<string>(
      'rabbitmq.commandExchange',
    );
    const responseExchange = this.configService.getOrThrow<string>(
      'rabbitmq.responseExchange',
    );

    return new Promise<RpcResponse<TResponse>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRpc.delete(rpcId);
        reject(new Error(`RPC timeout for ${routingKey}`));
      }, timeoutMs);

      this.pendingRpc.set(rpcId, {
        resolve: (value: RpcResponse<unknown>): void => {
          resolve(this.coerceRpcResponse<TResponse>(value));
        },
        reject,
        timeout,
      });
      this.logger.debug(
        `Publishing async command ${routingKey} with rpcId=${rpcId} correlationId=${envelope.correlationId}`,
      );
      void rpcChannel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(envelope)),
        {
          contentType: 'application/json',
          persistent: true,
          correlationId: rpcId,
          type: envelope.type,
          headers: {
            'x-correlation-id': envelope.correlationId,
            'x-causation-id': envelope.messageId,
            'x-event-type': envelope.eventType ?? envelope.type,
            'x-event-version': envelope.eventVersion ?? envelope.schemaVersion,
            'x-response-exchange': responseExchange,
            'x-response-routing-key': this.replyRoutingKey,
          },
        },
      );
    });
  }

  private onRpcReply(message: ConsumeMessage): void {
    const correlationId = messageCorrelationId(message);
    if (!correlationId) return;
    const pending = this.pendingRpc.get(correlationId);
    if (!pending) return;

    this.pendingRpc.delete(correlationId);
    clearTimeout(pending.timeout);

    try {
      const parsed = this.parseJson(message.content.toString('utf8'));
      pending.resolve(this.normalizeRpcResponse(parsed));
    } catch (error) {
      pending.reject(error);
    }
  }

  private onEvent(channel: Channel, message: ConsumeMessage | null): void {
    if (!message) return;

    try {
      const envelope = this.parseEventEnvelope(
        message.content.toString('utf8'),
      );
      this.logger.debug(
        `Consumed async event ${envelope.eventType ?? envelope.type} correlationId=${envelope.correlationId}`,
      );
      const userId = this.extractUserId(envelope);
      if (userId) {
        this.streamService.publish(userId, {
          id: envelope.messageId,
          type: envelope.type,
          occurredAt: envelope.occurredAt,
          payload: envelope.payload,
        });
      }
      channel.ack(message);
    } catch (error) {
      this.logger.error(`Failed to process user event: ${String(error)}`);
      channel.nack(message, false, false);
    }
  }

  private extractUserId(
    envelope: MessageEnvelope<Record<string, unknown>>,
  ): string | undefined {
    if (
      envelope.type === 'payment.status-updated' &&
      typeof envelope.payload.userId === 'string'
    ) {
      return envelope.payload.userId;
    }

    if (
      envelope.type === 'user.premium-updated' &&
      typeof envelope.payload.id === 'string'
    ) {
      return envelope.payload.id;
    }

    return undefined;
  }

  private normalizeRpcResponse<TResponse>(
    response: unknown,
  ): RpcResponse<TResponse> {
    if (this.isRpcEnvelope(response)) {
      return this.coerceRpcResponse<TResponse>(response.payload);
    }

    if (this.isRpcResponse(response)) {
      return this.coerceRpcResponse<TResponse>(response);
    }

    throw new Error('Invalid RPC response payload');
  }

  private coerceRpcResponse<TResponse>(
    response: RpcResponse<unknown>,
  ): RpcResponse<TResponse> {
    return response as RpcResponse<TResponse>;
  }

  private parseEventEnvelope(
    rawMessage: string,
  ): MessageEnvelope<Record<string, unknown>> {
    const parsed = this.parseJson(rawMessage);
    if (!this.isMessageEnvelopeRecord(parsed)) {
      throw new Error('Invalid event envelope payload');
    }
    return parsed;
  }

  private parseJson(rawMessage: string): unknown {
    return JSON.parse(rawMessage) as unknown;
  }

  private isMessageEnvelopeRecord(
    value: unknown,
  ): value is MessageEnvelope<Record<string, unknown>> {
    return (
      this.isRecord(value) &&
      typeof value.messageId === 'string' &&
      typeof value.correlationId === 'string' &&
      typeof value.occurredAt === 'string' &&
      typeof value.type === 'string' &&
      this.isRecord(value.payload)
    );
  }

  private isRpcEnvelope(value: unknown): value is RpcEnvelope<unknown> {
    return this.isRecord(value) && this.isRpcResponse(value.payload);
  }

  private isRpcResponse(value: unknown): value is RpcResponse<unknown> {
    if (!this.isRecord(value) || typeof value.success !== 'boolean') {
      return false;
    }

    if (value.success) {
      return 'data' in value;
    }

    return (
      this.isRecord(value.error) &&
      typeof value.error.status === 'number' &&
      typeof value.error.title === 'string' &&
      typeof value.error.detail === 'string'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

function messageCorrelationId(message: ConsumeMessage): string | undefined {
  const properties = message.properties as {
    correlationId?: unknown;
  };
  const { correlationId } = properties;
  return typeof correlationId === 'string' && correlationId.trim()
    ? correlationId
    : undefined;
}
