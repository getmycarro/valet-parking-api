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
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.findAll(companyId, filters, user.id, user.role);
  }

  // ⚠️ Must be declared BEFORE :id routes to avoid route conflicts
  @Get('unread-count')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  getUnreadCount(@CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.getUnreadCount(companyId, user.id, user.role);
  }

  @Patch('read-all')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  markAllAsRead(@CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.markAllAsRead(companyId, user.id, user.role);
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.CLIENT)
  markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.markAsRead(id, companyId, user.id, user.role);
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
