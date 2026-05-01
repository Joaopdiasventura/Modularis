import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../http/types/authenticated-request.type';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  public use(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const correlationId =
      request.header('x-request-id')?.trim() || randomUUID();
    request.correlationId = correlationId;
    response.setHeader('X-Request-Id', correlationId);
    next();
  }
}
