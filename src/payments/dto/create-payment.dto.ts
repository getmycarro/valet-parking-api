import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
} from "class-validator";
import { ValidationType } from "@prisma/client";

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsString()
  parkingRecordId: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsNotEmpty()
  @IsNumber()
  amountUSD: number;

  @IsOptional()
  @IsNumber()
  tip?: number;

  @IsNotEmpty()
  @IsNumber()
  fee: number;

  @IsNotEmpty()
  @IsEnum(ValidationType)
  validation: ValidationType;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  image?: string;
}
