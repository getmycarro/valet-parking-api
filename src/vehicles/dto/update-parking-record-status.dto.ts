import { IsEnum, IsOptional, IsString } from "class-validator";
import { ParkingRecordStatus } from "@prisma/client";

export class UpdateParkingRecordStatusDto {
  @IsEnum(ParkingRecordStatus)
  status: ParkingRecordStatus;

  @IsOptional()
  @IsString()
  checkOutValetId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
