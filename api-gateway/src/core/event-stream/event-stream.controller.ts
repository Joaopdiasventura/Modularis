import { Controller, MessageEvent, Req, Sse, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../shared/http/types/authenticated-request.type';
import { AuthGuard } from '../../shared/modules/auth/auth.guard';
import { EventStreamService } from './event-stream.service';

@Controller()
export class EventStreamController {
  public constructor(private readonly eventStreamService: EventStreamService) {}

  @Sse('events')
  @UseGuards(ThrottlerGuard, AuthGuard)
  public events(
    @Req() request: AuthenticatedRequest,
  ): Observable<MessageEvent> {
    return this.eventStreamService.stream(request.userId!);
  }
}
