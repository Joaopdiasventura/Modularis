import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/shared/modules/health/health.controller';
import { PostgresService } from '../src/shared/modules/database/postgres.service';
import { RabbitBusService } from '../src/shared/modules/messaging/rabbit-bus.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: RabbitBusService,
          useValue: {
            isReady: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: PostgresService,
          useValue: {
            isReady: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health/live (GET)', () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    return request(server)
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/health/ready (GET)', () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    return request(server).get('/health/ready').expect(200).expect({
      status: 'ok',
      rabbitmq: 'up',
      postgres: 'up',
    });
  });
});
