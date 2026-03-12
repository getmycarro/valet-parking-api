import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentMethodType } from '@prisma/client';

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(PaymentMethodType)
  type?: PaymentMethodType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
