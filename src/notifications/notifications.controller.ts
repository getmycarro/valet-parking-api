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
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.createCheckoutRequest(dto, companyId, user.id);
  }

  @Post('object-search')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  createObjectSearchRequest(
    @Body() dto: ObjectSearchRequestDto,
    @CurrentUser() user: any,
  ) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.notificationsService.createObjectSearchRequest(dto, companyId, user.id);
  }
}
