import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class AddMyVehicleDto {
  @IsNotEmpty()
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
}
