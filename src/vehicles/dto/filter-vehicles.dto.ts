import { IsOptional, IsString, IsNumber, IsIn } from "class-validator";
import { Type } from "class-transformer";

export class FilterVehiclesDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  plate?: string;

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
  @IsIn(["active", "completed", "pending_delivery", "in_review", "in_lot", "pending_payment", "all"])
  status?: "active" | "completed" | "pending_delivery" | "in_review" | "in_lot" | "pending_payment" | "all";

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  workdayId?: string;
}
