import { IsString, IsOptional } from 'class-validator';

export class ObjectSearchRequestDto {
  @IsString()
  parkingRecordId: string;

  @IsString()
  objectDescription: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
