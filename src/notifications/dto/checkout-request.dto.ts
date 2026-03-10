import { IsString, IsOptional } from 'class-validator';

export class CheckoutRequestDto {
  @IsString()
  parkingRecordId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
