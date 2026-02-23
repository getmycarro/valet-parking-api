import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  UseGuards,
  Query,
} from "@nestjs/common";
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

@Controller("payments")
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
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
  getPaymentMethods() {
    return this.paymentsService.getPaymentMethods();
  }

  // Endpoint público para cronjob - no requiere autenticación
  @Public()
  @Post("process-expired-plans")
  processExpiredPlans() {
    return this.paymentsService.processExpiredPlans();
  }
}
