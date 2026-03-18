import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { PaymentsModule } from "./payments/payments.module";
import { EmployeesModule } from "./employees/employees.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { EmailService } from "./email/email.service";
import { CompaniesModule } from "./companies/companies.module";
import { UsersModule } from "./users/users.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RequestsModule } from "./requests/requests.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PrismaModule,
    AuthModule,
    VehiclesModule,
    PaymentsModule,
    EmployeesModule,
    CompaniesModule,
    UsersModule,
    NotificationsModule,
    RequestsModule,
  ],
  controllers: [],
  providers: [
    // Global guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Aplicar JWT a todos los endpoints
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // Aplicar roles guard globalmente
    },
    // Global filters
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    EmailService,
  ],
})
export class AppModule {}
