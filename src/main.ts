import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);

  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('PORT', { infer: true });
  const isProduction = nodeEnv === 'production';

  // The app renders its own SPA and serves receipt images, so the default CSP would
  // block them; everything else helmet hardens stays on.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cookieParser());

  app.setGlobalPrefix('api');
  app.useGlobalPipes(buildValidationPipe() as ValidationPipe);
  app.useGlobalFilters(new AllExceptionsFilter());

  // Production is same-origin (Nest serves the SPA), so CORS is only opened for the
  // Vite dev server.
  if (!isProduction) {
    app.enableCors({ origin: 'http://localhost:5173', credentials: true });

    const swaggerConfig = new DocumentBuilder()
      .setTitle('datebud API')
      .setDescription('Date Budget Tracker - weekend budget earned from weekday discipline')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  app.enableShutdownHooks();

  await app.listen(port);
  new Logger('Bootstrap').log(`datebud listening on :${port} (${nodeEnv})`);
}

void bootstrap();
