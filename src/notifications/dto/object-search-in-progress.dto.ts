import { IsString, IsOptional } from 'class-validator';

export class ObjectSearchInProgressDto {
  @IsString()
  parkingRecordId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
