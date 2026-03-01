import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { promises as fs } from "fs";
import { join } from "path";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./filters/global-exception.filter";

async function bootstrap() {
  const storageRoot = join(process.cwd(), process.env.STORAGE_ROOT || "storage");
  await fs.mkdir(join(storageRoot, "products"), { recursive: true });
  await fs.mkdir(join(storageRoot, "videos"), { recursive: true });
  await fs.mkdir(join(storageRoot, "blogs"), { recursive: true });
  await fs.mkdir(join(storageRoot, "zip-gallery"), { recursive: true });
  await fs.mkdir(join(storageRoot, "temp-zip"), { recursive: true });

  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  app.enableCors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle("KSR Files Backend")
    .setDescription("NestJS files backend for product images (local disk storage)")
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description: "Enter JWT token",
        in: "header",
      },
      "JWT-auth"
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || process.env.APP_PORT || 3003;

  // Long-running ZIP upload + extraction: avoid ERR_HTTP2_PING_FAILED / connection drop (e.g. Railway)
  const httpServer = app.getHttpServer();
  httpServer.setTimeout(15 * 60 * 1000); // 15 min (match Railway max)
  httpServer.keepAliveTimeout = 65000;   // 65s
  httpServer.headersTimeout = 66000;     // > keepAliveTimeout

  await app.listen(port, "0.0.0.0");

  logger.log(`\uD83D\uDE80 Files backend running on: http://localhost:${port}`);
  logger.log(`\uD83D\uDCD6 Swagger: http://localhost:${port}/api`);
  logger.log(`\uD83C\uDFE5 Health: http://localhost:${port}/health`);
}

bootstrap();
