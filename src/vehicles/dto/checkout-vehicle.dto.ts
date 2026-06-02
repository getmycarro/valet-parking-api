import { IsOptional, IsString } from "class-validator";

export class CheckoutVehicleDto {
  @IsOptional()
  checkOutAt?: Date;

  @IsOptional()
  @IsString()
  checkOutValet?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
