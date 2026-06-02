import { IsOptional, IsString } from 'class-validator';

export class ReportWorkdaysDto {
  @IsOptional()
  @IsString()
  workdayId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
