import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenWorkdayDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valetPrice?: number;
}
