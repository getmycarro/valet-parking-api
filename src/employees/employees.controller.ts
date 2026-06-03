import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { EmployeesService } from "./employees.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

@Controller("employees")
@UseGuards(RolesGuard)
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any) {
    const companyId = user.companyId;
    if (!companyId) throw new BadRequestException('No company associated with this account');
    return this.employeesService.create(dto, companyId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  getAll(@CurrentUser() user: any) {
    const companyIds = user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) || [];
    return this.employeesService.getAll(companyIds);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  delete(@Param("id") id: string, @Query("type") type: "VALET" | "ATTENDANT" | "MANAGER") {
    return this.employeesService.delete(id, type);
  }
}
