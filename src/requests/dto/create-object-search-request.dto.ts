import { IsString, IsOptional } from 'class-validator';

export class CreateObjectSearchRequestDto {
  @IsString()
  parkingRecordId: string;

  @IsString()
  objectDescription: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
