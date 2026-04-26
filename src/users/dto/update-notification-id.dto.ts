import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class UpdateUserNotificationIdDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'El ID de notificación no puede estar vacío' })
  @MaxLength(255, { message: 'El ID de notificación no puede exceder 255 caracteres' })
  notificationID!: string;
}
