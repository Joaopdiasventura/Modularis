import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { RabbitBusService } from '../messaging/rabbit-bus.service';

type DependencyStatus = 'up' | 'down';

interface ReadinessStatus {
  status: 'ok' | 'not_ready';
  rabbitmq: DependencyStatus;
  postgres: DependencyStatus;
}

@Controller('health')
export class HealthController {
  public constructor(
    private readonly rabbitBus: RabbitBusService,
    private readonly postgresService: PostgresService,
  ) {}

  @Get('live')
  public live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  public ready(): ReadinessStatus {
    const rabbitmq = this.rabbitBus.isReady();
    const postgres = this.postgresService.isReady();
    if (!rabbitmq || !postgres) {
      const status: ReadinessStatus = {
        status: 'not_ready',
        rabbitmq: rabbitmq ? 'up' : 'down',
        postgres: postgres ? 'up' : 'down',
      };
      throw new ServiceUnavailableException(status);
    }
    return {
      status: 'ok',
      rabbitmq: 'up',
      postgres: 'up',
    };
  }
}
