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
import { RequestsService } from './requests.service';
import { CreateObjectSearchRequestDto } from './dto/create-object-search-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { FilterRequestsDto } from './dto/filter-requests.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('requests')
@UseGuards(RolesGuard)
export class RequestsController {
  constructor(private requestsService: RequestsService) {}

  @Post('object-search')
  @Roles(UserRole.CLIENT)
  createObjectSearchRequest(
    @Body() dto: CreateObjectSearchRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.requestsService.createObjectSearchRequest(dto, user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  findAll(@Query() filters: FilterRequestsDto, @CurrentUser() user: any) {
    const companyId = user.companyUsers?.[0]?.company?.id;
    return this.requestsService.findAll(companyId, filters);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.requestsService.updateStatus(id, dto, user.companyId, user.id);
  }
}
