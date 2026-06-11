import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateWorkdayPriceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  valetPrice?: number;
}
