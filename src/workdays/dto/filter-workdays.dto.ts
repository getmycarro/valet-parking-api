import { IsOptional, IsEnum, IsString } from 'class-validator';
import { WorkdayStatus } from '@prisma/client';
import { Transform } from 'class-transformer';

export class FilterWorkdaysDto {
  @IsOptional()
  @IsEnum(WorkdayStatus)
  status?: WorkdayStatus;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number = 20;
}
