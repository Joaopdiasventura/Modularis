import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserEventStreamService } from './user-event-stream.service';

@Injectable()
export class EventStreamService {
  public constructor(private readonly streamService: UserEventStreamService) {}

  public stream(userId: string): Observable<MessageEvent> {
    return this.streamService.stream(userId).pipe(
      map((event) => ({
        id: event.id,
        type: event.type,
        data: {
          occurredAt: event.occurredAt,
          payload: event.payload,
        },
      })),
    );
  }
}
