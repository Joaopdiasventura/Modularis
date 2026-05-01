import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../http/types/authenticated-request.type';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();
    const normalized = this.normalize(exception);

    response
      .status(normalized.status)
      .type('application/problem+json')
      .json({
        type: normalized.type,
        title: normalized.title,
        status: normalized.status,
        detail: normalized.detail,
        instance: request.originalUrl || request.url,
        traceId: request.correlationId,
        ...(normalized.code ? { code: normalized.code } : {}),
      });
  }

  private normalize(exception: unknown): {
    type: string;
    title: string;
    status: number;
    detail: string;
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return {
          type: 'about:blank',
          title: this.defaultTitle(status),
          status,
          detail: body,
        };
      }

      if (body && typeof body === 'object') {
        const data = body as Record<string, unknown>;
        const detail = Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.detail === 'string'
            ? data.detail
            : typeof data.message === 'string'
              ? data.message
              : exception.message;

        return {
          type: typeof data.type === 'string' ? data.type : 'about:blank',
          title:
            typeof data.title === 'string'
              ? data.title
              : typeof data.error === 'string'
                ? data.error
                : this.defaultTitle(status),
          status,
          detail,
          code: typeof data.code === 'string' ? data.code : undefined,
        };
      }
    }

    return {
      type: 'about:blank',
      title: this.defaultTitle(HttpStatus.INTERNAL_SERVER_ERROR),
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'The request could not be completed.',
    };
  }

  private defaultTitle(status: number): string {
    if (status === 400) return 'Bad Request';
    if (status === 401) return 'Unauthorized';
    if (status === 409) return 'Conflict';
    if (status === 502) return 'Bad Gateway';
    return 'Internal Server Error';
  }
}
