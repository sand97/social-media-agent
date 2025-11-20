import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { AppModule } from '@app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Limite raisonnable pour les scripts et webhooks (pas d'upload d'images ici)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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
    .setTitle('WhatsApp Connector API')
    .setDescription(
      'REST wrapper for whatsapp-web.js - Execute WhatsApp methods and receive events via webhooks',
    )
    .setVersion('1.0')
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

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`📱 WhatsApp Connector is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api`);
}
bootstrap();
