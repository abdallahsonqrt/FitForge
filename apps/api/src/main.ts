import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClassSerializerInterceptor } from '@nestjs/common';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  const expressApp = app.getHttpAdapter().getInstance();

  /**
   * Whether `X-Forwarded-For` is believed, and therefore what `@Ip()` and the
   * login throttler treat as "the client". Both directions of getting this wrong
   * are harmful — see `TRUST_PROXY` in `config/env.ts` — so it is configured per
   * deployment rather than assumed here.
   */
  expressApp.set('trust proxy', configService.get('TRUST_PROXY') ?? false);

  // Says "Express" to anyone asking which framework to look up exploits for.
  expressApp.disable('x-powered-by');

  app.use(
    helmet({
      /**
       * Swagger UI runs on inline script and style, which helmet's default CSP
       * blocks. The docs are only mounted outside production (below), so the
       * relaxation is scoped to the environments that actually serve them; a
       * production deployment keeps the full default policy.
       */
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  /**
   * An explicit allowlist rather than the previous bare `enableCors()`, which
   * answered every preflight with `Access-Control-Allow-Origin: *` and let any
   * site on the internet call this API from a visitor's browser.
   *
   * Requests with no `Origin` at all are allowed: that is every native mobile
   * client and every server-to-server caller. The header is set by browsers, so
   * its absence is not something a page can fake to get around this.
   */
  const allowedOrigins = configService.get<string[]>('CORS_ORIGINS') ?? [];
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.includes(origin.replace(/\/+$/, '')));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Publishing every route, parameter and schema to anonymous callers is a
  // reconnaissance map in production, and harmless while developing.
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('FitForge API')
      .setDescription('The FitForge backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
