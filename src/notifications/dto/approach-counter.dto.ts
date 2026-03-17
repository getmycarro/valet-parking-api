import { IsString, IsOptional } from 'class-validator';

export class ApproachCounterDto {
  @IsString()
  parkingRecordId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
