import amqplib from 'amqplib';
import { createHash, randomUUID } from 'node:crypto';

const rabbitUrl = process.env.MODULARIS_RABBITMQ_URL ?? 'amqp://user:user@rabbitmq:5672/';
const commandExchange = process.env.MODULARIS_COMMAND_EXCHANGE ?? 'modularis.commands';
const responseExchange = process.env.MODULARIS_RESPONSE_EXCHANGE ?? 'modularis.responses';
const queueName = 'api-gateway.mock.onboarding';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let connection;
  while (!connection) {
    try {
      connection = await amqplib.connect(rabbitUrl);
    } catch {
      await wait(1000);
    }
  }

  const channel = await connection.createChannel();
  await channel.assertExchange(commandExchange, 'topic', { durable: true });
  await channel.assertExchange(responseExchange, 'topic', { durable: true });
  await channel.assertQueue(queueName, { durable: true });
  await channel.bindQueue(queueName, commandExchange, 'onboarding.account.create');
  await channel.consume(queueName, async (message) => {
    if (!message) return;
    const request = JSON.parse(message.content.toString('utf8'));
    const responseRoutingKey = message.properties.headers?.['x-response-routing-key'];
    if (typeof responseRoutingKey !== 'string' || !responseRoutingKey) {
      channel.ack(message);
      return;
    }

    const seed = createHash('sha256')
      .update(request.payload.idempotencyKey)
      .digest('hex')
      .slice(0, 12);
    const response = {
      schemaVersion: '1.0.0',
      messageId: randomUUID(),
      correlationId: request.correlationId,
      causationId: request.messageId,
      occurredAt: new Date().toISOString(),
      type: 'onboarding.account.create.response',
      eventVersion: '1.0.0',
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: 'onboarding.account.create.response',
      source: 'onboarding-mock',
      payload: {
        success: true,
        data: {
          user: {
            id: `user-${seed}`,
            email: request.payload.email,
            name: request.payload.name,
            isPremium: false,
          },
          payment: {
            id: `payment-${seed}`,
            paymentReference: `ref-${seed}`,
            amount: request.payload.amount,
            currency: request.payload.currency,
            paymentStatus: 'PENDING',
            deliveryStatus: 'PENDING',
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            qrCode: `qr-${seed}`,
          },
          meta: {
            correlationId: request.correlationId,
            idempotencyKey: request.payload.idempotencyKey,
            replayed: false,
          },
        },
      },
    };

    await channel.publish(
      responseExchange,
      responseRoutingKey,
      Buffer.from(JSON.stringify(response)),
      {
        contentType: 'application/json',
        persistent: true,
        correlationId: message.properties.correlationId,
      },
    );
    channel.ack(message);
  });
}

void main();
