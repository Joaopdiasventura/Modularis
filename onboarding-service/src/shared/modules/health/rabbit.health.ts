import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { RabbitBusService } from '../messaging/rabbit-bus.service';

@Injectable()
export class RabbitHealthIndicator extends HealthIndicator {
  public constructor(private readonly rabbitBus: RabbitBusService) {
    super();
  }

  public isHealthy(key: string): HealthIndicatorResult {
    const ready = this.rabbitBus.isReady();
    const result: HealthIndicatorResult = {
      [key]: {
        status: ready ? 'up' : 'down',
      },
    };
    if (!ready) {
      throw new HealthCheckError('RabbitMQ not ready', result);
    }
    return result;
  }
}
