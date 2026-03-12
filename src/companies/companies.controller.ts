import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from "@nestjs/common";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";
import { Roles } from "src/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { FilterCompaniesDto } from "./dto/filter-companies.dto";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { UpdateStatusCompanyInvoiceDto } from "./dto/update-status-company-invoice.dto";
import { CreatePaymentMethodDto } from "../payments/dto/create-payment-method.dto";
import { UpdatePaymentMethodDto } from "../payments/dto/update-payment-method.dto";

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll(@Query() filters: FilterCompaniesDto, @CurrentUser() user: any) {
    let companyIds = [];
    if (user.role === UserRole.ADMIN)
      companyIds =
        user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) ||
        [];

    return this.companiesService.getAll(filters, companyIds);
  }

  @Get(":id")
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param("id") id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(":id")
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param("id") id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param("id") id: string) {
    return this.companiesService.remove(id);
  }

  @Post(":id/plans")
  @Roles(UserRole.SUPER_ADMIN)
  createPlan(@Param("id") id: string, @Body() dto: CreatePlanDto) {
    return this.companiesService.createPlan(id, dto);
  }

  @Patch(":companyId/plans/:planId")
  @Roles(UserRole.SUPER_ADMIN)
  updatePlan(
    @Param("companyId") companyId: string,
    @Param("planId") planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.companiesService.updatePlan(companyId, planId, dto);
  }

  @Patch(":companyId/plans/:planId/invoices/:invoiceId")
  @Roles(UserRole.SUPER_ADMIN)
  updateInvoice(
    @Param("planId") planId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: UpdateStatusCompanyInvoiceDto,
  ) {
    return this.companiesService.updateStatusInvoice(planId, invoiceId, dto);
  }

  @Get(":companyId/payment-methods")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CLIENT)
  getPaymentMethods(@Param("companyId") companyId: string) {
    return this.companiesService.getPaymentMethods(companyId);
  }

  @Post(":companyId/payment-methods")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createPaymentMethod(
    @Param("companyId") companyId: string,
    @Body() dto: CreatePaymentMethodDto,
  ) {
    return this.companiesService.createPaymentMethod(companyId, dto);
  }

  @Patch(":companyId/payment-methods/:methodId")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updatePaymentMethod(
    @Param("companyId") companyId: string,
    @Param("methodId") methodId: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.companiesService.updatePaymentMethod(companyId, methodId, dto);
  }
}
