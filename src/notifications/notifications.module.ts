import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SseService } from './sse.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SseService],
  exports: [NotificationsService, SseService],
})
export class NotificationsModule {}
