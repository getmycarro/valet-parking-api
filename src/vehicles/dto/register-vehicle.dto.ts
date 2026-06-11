import { IsEmail, IsInt, IsOptional, IsString, Min } from "class-validator";

export class RegisterVehicleDto {
  @IsOptional()
  @IsString()
  idNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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
  valetId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ticketNumber?: number;
}
