import { IsOptional, IsString } from 'class-validator';

export class OpenWorkdayDto {
  @IsOptional()
  @IsString()
  companyId?: string;
}
