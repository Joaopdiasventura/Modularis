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
import { MessageEnvelope, RpcEnvelope, RpcResponse } from './contracts';

type CommandHandler = (
  message: ConsumeMessage,
) => Promise<MessageEnvelope<RpcResponse<unknown>>>;
type PendingRpcResolver = (value: RpcResponse<unknown>) => void;

@Injectable()
export class RabbitBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitBusService.name);
  private connection?: AmqpConnectionManager;
  private rpcChannel?: ChannelWrapper;
  private commandChannel?: ChannelWrapper;
  private replyQueue?: string;
  private replyRoutingKey?: string;
  private connected = false;
  private commandHandler?: CommandHandler;
  private readonly pendingRpc = new Map<
    string,
    {
      resolve: PendingRpcResolver;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  public constructor(private readonly configService: ConfigService) {}

  public registerCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

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
      name: 'onboarding-rpc',
      setup: async (channel: Channel) => {
        await this.assertExchanges(channel);
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

    this.commandChannel = this.connection.createChannel({
      name: 'onboarding-commands',
      setup: async (channel: Channel) => {
        await this.assertExchanges(channel);
        const queueName = this.configService.getOrThrow<string>(
          'rabbitmq.commandQueue',
        );
        const deliveryLimit = this.configService.getOrThrow<number>(
          'rabbitmq.deliveryLimit',
        );

        await channel.assertQueue(queueName, {
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
            'x-delivery-limit': deliveryLimit,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': `${queueName}.dlq`,
          },
        });
        await channel.assertQueue(`${queueName}.dlq`, {
          durable: true,
          arguments: {
            'x-queue-type': 'quorum',
          },
        });
        await channel.bindQueue(
          queueName,
          this.configService.getOrThrow<string>('rabbitmq.commandExchange'),
          'onboarding.account.create',
        );
        await channel.consume(
          queueName,
          (message: ConsumeMessage | null): void => {
            if (!message) return;
            void this.onCommand(channel, message);
          },
          {
            noAck: false,
          },
        );
      },
    });

    await this.rpcChannel.waitForConnect();
    await this.commandChannel.waitForConnect();
  }

  public async onModuleDestroy(): Promise<void> {
    for (const pending of this.pendingRpc.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Rabbit bus is shutting down'));
    }
    this.pendingRpc.clear();
    if (this.commandChannel) await this.commandChannel.close();
    if (this.rpcChannel) await this.rpcChannel.close();
    if (this.connection) await this.connection.close();
  }

  public isReady(): boolean {
    return (
      this.connected &&
      Boolean(this.replyQueue) &&
      Boolean(this.replyRoutingKey) &&
      Boolean(this.commandHandler)
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

  private async assertExchanges(channel: Channel): Promise<void> {
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
  }

  private async onCommand(
    channel: Channel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      const response = this.commandHandler
        ? await this.commandHandler(message)
        : this.internalErrorResponse(message);
      await this.publishResponse(message, response);
      channel.ack(message);
    } catch (error) {
      this.logger.error(`Failed to process command: ${String(error)}`);
      await this.publishResponse(message, this.internalErrorResponse(message));
      channel.ack(message);
    }
  }

  private async publishResponse(
    request: ConsumeMessage,
    envelope: MessageEnvelope<RpcResponse<unknown>>,
  ): Promise<void> {
    if (!this.commandChannel) return;

    const responseExchange =
      headerString(request, 'x-response-exchange') ??
      this.configService.getOrThrow<string>('rabbitmq.responseExchange');
    const responseRoutingKey = headerString(request, 'x-response-routing-key');
    if (!responseRoutingKey) return;

    await this.commandChannel.publish(
      responseExchange,
      responseRoutingKey,
      Buffer.from(JSON.stringify(envelope)),
      {
        contentType: 'application/json',
        persistent: true,
        correlationId: messageCorrelationId(request),
      },
    );
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

  private internalErrorResponse(
    message: ConsumeMessage,
  ): MessageEnvelope<RpcResponse<unknown>> {
    return {
      schemaVersion: '1.0.0',
      messageId: randomUUID(),
      correlationId:
        headerString(message, 'x-correlation-id') ??
        messageCorrelationId(message) ??
        randomUUID(),
      causationId:
        headerString(message, 'x-causation-id') ?? 'onboarding.account.create',
      occurredAt: new Date().toISOString(),
      type: 'onboarding.account.create.response',
      eventVersion: '1.0.0',
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: 'onboarding.account.create.response',
      source: 'onboarding-service',
      payload: {
        success: false,
        error: {
          status: 500,
          title: 'Internal Server Error',
          detail: 'The onboarding request could not be processed.',
        },
      },
    };
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

  private parseJson(rawMessage: string): unknown {
    return JSON.parse(rawMessage) as unknown;
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
