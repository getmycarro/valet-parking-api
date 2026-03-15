import { Injectable, BadRequestException } from '@nestjs/common';
import { Observable, Subject, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { MessageEvent } from '@nestjs/common';

@Injectable()
export class SseService {
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  private getOrCreate(companyId: string): Subject<MessageEvent> {
    if (!this.subjects.has(companyId)) {
      this.subjects.set(companyId, new Subject<MessageEvent>());
    }
    return this.subjects.get(companyId)!;
  }

  emit(companyId: string, data: Record<string, any>): void {
    if (!companyId) return;
    this.subjects.get(companyId)?.next({ data });
  }

  getStream(companyId: string): Observable<MessageEvent> {
    if (!companyId) {
      throw new BadRequestException('User is not associated with a company');
    }
    const notifications$ = this.getOrCreate(companyId).asObservable();
    // Heartbeat every 25s to keep the connection alive (browsers & Expo close idle SSE)
    const heartbeat$ = interval(25000).pipe(
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );
    return merge(notifications$, heartbeat$);
  }
}
