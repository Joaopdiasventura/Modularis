import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  correlationId?: string;
  userId?: string;
  auth?: {
    sub: string;
  };
}
