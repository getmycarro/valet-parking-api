import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  UseGuards,
  Query,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { PaymentsService } from "./payments.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { CreatePaymentMethodDto } from "./dto/create-payment-method.dto";
import { UpdatePaymentStatusDto } from "./dto/update-payment-status.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { FilterPaymentDto } from "./dto/filter-payment.dto";
import { ExportPaymentsDto } from "./dto/export-payments.dto";

@Controller("payments")
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  createPayment(@Body() dto: CreatePaymentDto, @CurrentUser() user: any) {
    return this.paymentsService.createPayment(dto, user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  getAllPayments(@Query() option: FilterPaymentDto, @CurrentUser() user: any) {
    const companyIds =
      user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) || [];

    return this.paymentsService.getAllPayments(option, companyIds);
  }

  @Get("export")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async exportPayments(
    @Query() dto: ExportPaymentsDto,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const companyIds: string[] =
      user.companyIds?.length
        ? user.companyIds
        : user.companyId
          ? [user.companyId]
          : [];
    const buffer = await this.paymentsService.exportXlsx(dto, companyIds);
    const filename = `ganancias_${dto.dateFrom}_${dto.dateTo}.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN)
  updatePaymentStatus(
    @Param("id") id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updatePaymentStatus(id, dto);
  }

  @Post("methods")
  @Roles(UserRole.ADMIN)
  createPaymentMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentsService.createPaymentMethod(dto);
  }

  @Get("methods")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getPaymentMethods(@CurrentUser() user: any) {
    return this.paymentsService.getPaymentMethods(user.companyId);
  }

  // Endpoint público para cronjob - no requiere autenticación
  @Public()
  @Post("process-expired-plans")
  processExpiredPlans() {
    return this.paymentsService.processExpiredPlans();
  }
}
