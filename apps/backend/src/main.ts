// IMPORTANT: Make sure to import `instrument.ts` at the top of your file.
// If you're using CommonJS (CJS) syntax, use `require("./instrument.ts");`
// import "@app/instrument.ts";

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { AppModule } from '@app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    '/billing/webhooks/stripe',
    express.raw({ type: 'application/json' }),
  );
  app.use(
    '/billing/webhooks/notchpay',
    express.raw({ type: 'application/json' }),
  );

  // Limite étendue pour les stories planifiées avec media inline (data URL)
  app.use(
    '/users/me/status-schedules',
    express.json({ limit: '30mb' }),
    express.urlencoded({ limit: '30mb', extended: true }),
  );

  // Limite standard
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Cookie parser for JWT cookie authentication
  app.use(cookieParser());
  // Limite étendue uniquement pour l'upload media
  app.use(
    '/message-metadata/upload-media',
    express.json({ limit: '30mb' }),
    express.urlencoded({ limit: '30mb', extended: true }),
  );

  // Enable CORS
  app.enableCors({
    origin: (
      process.env.CORS_ORIGIN ||
      process.env.CORS_ORIGINS ||
      'http://localhost:5173'
    ).split(','),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Monorepo API')
    .setDescription('Interractive documentation for the Monorepo API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Generate swagger.json file
  const outputDir = join(__dirname, '..', 'swagger-output');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'swagger.json'),
    JSON.stringify(document, null, 2),
  );

  console.log('✅ Swagger JSON generated at swagger-output/swagger.json');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api`);
}
bootstrap();
