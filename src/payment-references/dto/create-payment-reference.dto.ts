import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePaymentReferenceDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsOptional()
  publicId?: string;
}
