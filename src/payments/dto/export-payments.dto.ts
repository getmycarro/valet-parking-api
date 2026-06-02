import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

export class ExportPaymentsDto {
  @IsDateString()
  dateFrom: string;

  @IsDateString()
  dateTo: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}
