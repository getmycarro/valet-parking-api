import { Injectable, BadRequestException } from '@nestjs/common';
import { Observable, Subject, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { MessageEvent } from '@nestjs/common';

@Injectable()
export class SseService {
  // Canal por compañía (staff)
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  // Canal por usuario (clientes)
  private readonly userSubjects = new Map<string, Subject<MessageEvent>>();

  private getOrCreate(companyId: string): Subject<MessageEvent> {
    if (!this.subjects.has(companyId)) {
      this.subjects.set(companyId, new Subject<MessageEvent>());
    }
    return this.subjects.get(companyId)!;
  }

  private getOrCreateUser(userId: string): Subject<MessageEvent> {
    if (!this.userSubjects.has(userId)) {
      this.userSubjects.set(userId, new Subject<MessageEvent>());
    }
    return this.userSubjects.get(userId)!;
  }

  emit(companyId: string, data: Record<string, any>): void {
    if (!companyId) return;
    this.subjects.get(companyId)?.next({ data });
  }

  emitToUser(userId: string, data: Record<string, any>): void {
    if (!userId) return;
    this.userSubjects.get(userId)?.next({ data });
  }

  getStream(companyIds: string[]): Observable<MessageEvent> {
    const valid = companyIds.filter(Boolean);
    if (!valid.length) {
      throw new BadRequestException('User is not associated with any company');
    }
    const notifications$ = merge(
      ...valid.map((id) => this.getOrCreate(id).asObservable()),
    );
    // Heartbeat every 25s to keep the connection alive (browsers & Expo close idle SSE)
    const heartbeat$ = interval(25000).pipe(
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );
    return merge(notifications$, heartbeat$);
  }

  getStreamForUser(userId: string): Observable<MessageEvent> {
    const notifications$ = this.getOrCreateUser(userId).asObservable();
    const heartbeat$ = interval(25000).pipe(
      map(() => ({ data: { type: 'heartbeat' } } as MessageEvent)),
    );
    return merge(notifications$, heartbeat$);
  }
}
