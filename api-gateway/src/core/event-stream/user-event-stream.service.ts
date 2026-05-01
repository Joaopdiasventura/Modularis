import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { StreamEvent } from './types/stream-event.type';

@Injectable()
export class UserEventStreamService {
  private readonly streams = new Map<string, Subject<StreamEvent>>();

  public stream(userId: string): Observable<StreamEvent> {
    return this.ensureStream(userId).asObservable();
  }

  public publish(userId: string, event: StreamEvent): void {
    this.ensureStream(userId).next(event);
  }

  private ensureStream(userId: string): Subject<StreamEvent> {
    const existingStream = this.streams.get(userId);
    if (existingStream) {
      return existingStream;
    }

    const stream = new Subject<StreamEvent>();
    this.streams.set(userId, stream);
    return stream;
  }
}
