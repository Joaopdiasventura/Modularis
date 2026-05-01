import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';

@Injectable()
export class JsonLogger extends ConsoleLogger {
  public constructor() {
    super('', {
      logLevels: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
  }

  protected override formatMessage(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      trace,
    });
  }
}
