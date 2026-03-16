import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { VehiclesService } from "./vehicles.service";
import { RegisterVehicleDto } from "./dto/register-vehicle.dto";
import { CheckoutVehicleDto } from "./dto/checkout-vehicle.dto";
import { UpdateParkingRecordStatusDto } from "./dto/update-parking-record-status.dto";
import { FilterVehiclesDto } from "./dto/filter-vehicles.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { EmailService } from "src/email/email.service";
import { emailTemplates } from "src/email/utils/utils";

@Controller("vehicles")
@UseGuards(RolesGuard)
export class VehiclesController {
  constructor(
    private vehiclesService: VehiclesService,
    private email: EmailService,
  ) {}

  // POST /api/vehicles/register - Registro manual
  @Post("register")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  async registerVehicle(
    @Body() dto: RegisterVehicleDto,
    @CurrentUser() user: any,
  ) {
    let companyId = dto.companyId;

    if (!companyId && (user.role === UserRole.MANAGER || user.role === UserRole.ATTENDANT)) {
      companyId = user.companyUsers?.[0]?.company?.id;
    }

    const result = await this.vehiclesService.registerVehicle(dto, user.id, companyId);
    if (result.isNewUser && dto.email) {
      await this.email.sendEmail({
        templateId: emailTemplates.welcomeEmail,
        to: dto.email,
      } as any);
    }
    return result.parkingRecord;
  }

  @Patch(":id/checkout")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  checkoutVehicle(@Param("id") id: string, @Body() dto: CheckoutVehicleDto) {
    return this.vehiclesService.checkoutVehicle(id, dto);
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.MANAGER)
  updateParkingRecordStatus(
    @Param("id") id: string,
    @Body() dto: UpdateParkingRecordStatusDto,
  ) {
    return this.vehiclesService.updateParkingRecordStatus(id, dto);
  }

  @Get("user-vehicles")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getUserVehicles(@Query("idNumber") idNumber: string) {
    return this.vehiclesService.getUserVehicles(idNumber);
  }

  @Get("valets")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getValets() {
    return this.vehiclesService.getValets();
  }

  @Get("my-car")
  @Roles(UserRole.CLIENT)
  getMyActiveParkingRecords(@CurrentUser() user: any) {
    return this.vehiclesService.getMyActiveParkingRecords(user.id);
  }

  @Get("history")
  @Roles(UserRole.CLIENT)
  getParkingHistory(@CurrentUser() user: any) {
    return this.vehiclesService.getParkingHistory(user.id);
  }

  // GET /api/vehicles - Listado completo con filtros
  @Get()
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.MANAGER)
  getAllVehicles(
    @CurrentUser() user: any,
    @Query() filters: FilterVehiclesDto,
  ) {
    const companyIds =
      user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) || [];

    return this.vehiclesService.getAllVehicles(filters, companyIds);
  }

  @Get(":id")
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getVehicleById(@Param("id") id: string) {
    return this.vehiclesService.getVehicleById(id);
  }
}
