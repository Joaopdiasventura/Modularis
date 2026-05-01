import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { RabbitHealthIndicator } from './rabbit.health';

@Controller('health')
export class HealthController {
  public constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly rabbitHealthIndicator: RabbitHealthIndicator,
  ) {}

  @Get('live')
  public live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  public ready(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      (): HealthIndicatorResult =>
        this.rabbitHealthIndicator.isHealthy('rabbitmq'),
    ]);
  }
}
