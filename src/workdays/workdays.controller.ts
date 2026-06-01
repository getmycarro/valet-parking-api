import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WorkdaysService } from './workdays.service';
import { OpenWorkdayDto } from './dto/open-workday.dto';
import { FilterWorkdaysDto } from './dto/filter-workdays.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('workdays')
@UseGuards(RolesGuard)
export class WorkdaysController {
  constructor(private readonly workdaysService: WorkdaysService) {}

  // POST /api/workdays/open
  @Post('open')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  openWorkday(@Body() body: OpenWorkdayDto, @CurrentUser() user: any) {
    const companyId = body.companyId || user.companyId;
    return this.workdaysService.openWorkday(user.id, companyId);
  }

  // GET /api/workdays/active — must be declared before /:id
  @Get('active')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  getActiveWorkday(
    @Query('companyId') queryCompanyId: string,
    @CurrentUser() user: any,
  ) {
    const companyId = queryCompanyId || user.companyId;
    return this.workdaysService.getActiveWorkday(companyId);
  }

  // GET /api/workdays
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findAll(@Query() filters: FilterWorkdaysDto, @CurrentUser() user: any) {
    const companyIds =
      user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) || [];
    return this.workdaysService.findAll(filters, companyIds);
  }

  // GET /api/workdays/:id/stats — must be declared before /:id
  @Get(':id/stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  getWorkdayStats(@Param('id') id: string) {
    return this.workdaysService.getWorkdayStats(id);
  }

  // GET /api/workdays/:id
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string) {
    return this.workdaysService.findOne(id);
  }

  // PATCH /api/workdays/:id/close
  @Patch(':id/close')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  closeWorkday(@Param('id') id: string, @CurrentUser() user: any) {
    const companyIds =
      user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) || [];
    return this.workdaysService.closeWorkday(id, user.id, companyIds);
  }
}
