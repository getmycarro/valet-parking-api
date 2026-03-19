import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
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
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  findAll(@Query() filters: FilterNotificationsDto, @CurrentUser() user: any) {
    return this.notificationsService.findAll(user.companyId, filters, user.id, user.role);
  }

  // ⚠️ Must be declared BEFORE :id routes to avoid route conflicts
  @Get('unread-count')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.companyId, user.id, user.role);
  }

  /**
   * Polling endpoint: returns all unread notifications across all companies the user belongs to.
   * Only for non-CLIENT roles. CLIENT users don't have companyUsers.
   */
  @Get('unread')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  getUnreadAcrossCompanies(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadAcrossCompanies(
      user.companyIds ?? [],
      user.id,
      user.role,
    );
  }

  @Patch('read-all')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user.companyId, user.id, user.role);
  }

  /**
   * Marks all unread notifications as read across ALL companies the user belongs to.
   * Only for non-CLIENT roles.
   */
  @Patch('read-all-companies')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  markAllAsReadAcrossCompanies(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsReadAcrossCompanies(
      user.companyIds ?? [],
      user.id,
      user.role,
    );
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markAsRead(id, user.companyId, user.id, user.role);
  }

  /**
   * Accepts a request-type notification (CHECKOUT_REQUEST or OBJECT_SEARCH_REQUEST).
   * Marks it as read, updates the VehicleRequest to IN_PROGRESS, and notifies the client.
   */
  @Patch(':id/accept')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  acceptRequest(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.acceptRequestNotification(
      id,
      user.id,
      user.companyIds ?? [],
    );
  }

  @Post('checkout-request')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  createCheckoutRequest(
    @Body() dto: CheckoutRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.notificationsService.createCheckoutRequest(dto, user.id);
  }

  @Post('object-search')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  createObjectSearchRequest(
    @Body() dto: ObjectSearchRequestDto,
    @CurrentUser() user: any,
  ) {
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
