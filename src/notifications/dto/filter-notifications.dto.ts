import { IsOptional, IsEnum, IsBoolean, IsInt, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

export class FilterNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  /** Solo para ADMIN/MANAGER: filtrar notificaciones de un usuario específico */
  @IsOptional()
  @IsString()
  recipientId?: string;
}
