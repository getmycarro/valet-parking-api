import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // CORS configuration
  // Set CORS_ORIGIN as a comma-separated list of allowed origins in production.
  // Example: "https://my-web.com,https://my-other-app.com"
  // Leave unset or set to "*" to allow all origins (useful for native mobile apps).
  const corsOriginEnv = configService.get<string>('CORS_ORIGIN');
  let corsOrigin: string | string[] | boolean;

  if (!corsOriginEnv || corsOriginEnv === '*') {
    corsOrigin = true; // allow all origins
  } else {
    corsOrigin = corsOriginEnv.split(',').map((o) => o.trim());
  }

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get('PORT') || 3001;
  await app.listen(port);

  console.log(`🚀 Valet Parking API running on: http://localhost:${port}/api`);
}
bootstrap();
