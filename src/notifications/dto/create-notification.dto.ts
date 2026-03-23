import { IsEnum, IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsString()
  companyId: string;

  @IsOptional()
  @IsString()
  triggeredById?: string;

  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
