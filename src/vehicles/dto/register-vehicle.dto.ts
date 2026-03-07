import { IsOptional, IsString } from "class-validator";

export class RegisterVehicleDto {
  @IsOptional()
  @IsString()
  idNumber: string;

  @IsOptional()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  vehicleId: string;

  @IsOptional()
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  plate: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  valedId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}
