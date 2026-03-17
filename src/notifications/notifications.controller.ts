import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { SseService } from './sse.service';
import { CheckoutRequestDto } from './dto/checkout-request.dto';
import { ObjectSearchRequestDto } from './dto/object-search-request.dto';
import { ObjectSearchInProgressDto } from './dto/object-search-in-progress.dto';
import { ApproachCounterDto } from './dto/approach-counter.dto';
import { FilterNotificationsDto } from './dto/filter-notifications.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private sseService: SseService,
  ) {}

  /**
   * SSE stream para staff — connect with:
   *   Next.js  : new EventSource(`/api/notifications/stream?token=${jwt}`)
   *   Expo RN  : new EventSource(`/api/notifications/stream?token=${jwt}`)
   *              (requires react-native-sse: yarn add react-native-sse)
   */
  @Sse('stream')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  stream(@CurrentUser() user: any): Observable<MessageEvent> {
    const companyIds: string[] = (user.companyUsers ?? []).map(
      (cu: any) => cu.company?.id,
    );
    return this.sseService.getStream(companyIds);
  }

  /**
   * SSE stream para clientes — reciben notificaciones dirigidas a su userId.
   *   Expo RN: new EventSource(`/api/notifications/client-stream?token=${jwt}`)
   */
  @Sse('client-stream')
  @Roles(UserRole.CLIENT)
  clientStream(@CurrentUser() user: any): Observable<MessageEvent> {
    return this.sseService.getStreamForUser(user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  findAll(@Query() filters: FilterNotificationsDto, @CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.findAll(companyId, filters);
  }

  // ⚠️ Must be declared BEFORE :id/read to avoid route conflict
  @Patch('read-all')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  markAllAsRead(@CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.markAllAsRead(companyId);
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.markAsRead(id, companyId);
  }

  @Post('checkout-request')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  createCheckoutRequest(
    @Body() dto: CheckoutRequestDto,
    @CurrentUser() user: any,
  ) {
    // companyId is derived from the parkingRecord, not the user token
    // This allows CLIENT users (who have no company in their token) to trigger notifications
    return this.notificationsService.createCheckoutRequest(dto, user.id);
  }

  @Post('object-search')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  createObjectSearchRequest(
    @Body() dto: ObjectSearchRequestDto,
    @CurrentUser() user: any,
  ) {
    // companyId is derived from the parkingRecord, not the user token
    return this.notificationsService.createObjectSearchRequest(dto, user.id);
  }

  @Post('approach-counter')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  notifyApproachCounter(
    @Body() dto: ApproachCounterDto,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.notifyApproachCounter(dto, user.id);
  }

  @Post('object-search-in-progress')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  notifySearchInProgress(
    @Body() dto: ObjectSearchInProgressDto,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.notifySearchInProgress(dto, user.id);
  }
}
