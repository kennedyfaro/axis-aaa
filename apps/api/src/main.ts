import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  app.useLogger(new Logger("Áxis"));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  // Confia em exatamente um proxy (nginx), que sobrescreve X-Forwarded-For.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const origins = (config.get<string>("CORS_ORIGINS") ?? "http://localhost:3100,http://127.0.0.1:3100")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();

  // Documentação desabilitada em produção por padrão. Habilite apenas
  // conscientemente com ENABLE_API_DOCS=true (e proteja por rede/VPN).
  const docsEnabled =
    config.get<string>("ENABLE_API_DOCS") === "true" ||
    config.get<string>("NODE_ENV") !== "production";
  if (docsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Áxis API")
      .setDescription("Identidades, autorização RADIUS, accounting e auditoria.")
      .setVersion("1.0")
      .addCookieAuth("aaa_access")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = Number(config.get<string>("PORT") ?? 3000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`API em http://localhost:${port}/api/v1, OpenAPI em /api/docs`, "Bootstrap");
}

void bootstrap();
