import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsNotEmpty, validate as classValidate } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string;

  @IsNumber()
  PORT: number = 3001;

  @IsString()
  NODE_ENV: string = 'development';

  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsString()
  @IsNotEmpty()
  ONESIGNAL_APP_ID: string;

  @IsString()
  @IsNotEmpty()
  ONESIGNAL_API_KEY: string;
}

export async function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = await classValidate(validatedConfig);

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  return validatedConfig;
}
