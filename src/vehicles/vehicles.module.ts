import { Module } from "@nestjs/common";
import { VehiclesController } from "./vehicles.controller";
import { VehiclesService } from "./vehicles.service";
import { EmailService } from "src/email/email.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { WorkdaysModule } from "../workdays/workdays.module";

@Module({
  imports: [NotificationsModule, WorkdaysModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, EmailService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
