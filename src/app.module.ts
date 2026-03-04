import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { TerminusModule } from "@nestjs/terminus";
import { APP_GUARD } from "@nestjs/core";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";

import { appDataSourceOptions } from "./config/database.config";
import { SharedModule } from "./shared/shared.module";
import { AuthModule } from "./auth/auth.module";
import { ProductImagesModule } from "./product-images/product-images.module";
import { ProductVideosModule } from "./product-videos/product-videos.module";
import { BlogImagesModule } from "./blog-images/blog-images.module";
import { CmsImagesModule } from "./cms-images/cms-images.module";
import { HealthModule } from "./health/health.module";
import { ZipGalleryModule } from "./zip-gallery/zip-gallery.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: parseInt(process.env.RATE_LIMIT_TTL || "60", 10),
        limit: parseInt(process.env.RATE_LIMIT_LIMIT || "60", 10),
      },
    ]),

    TerminusModule,

    SharedModule,

    TypeOrmModule.forRootAsync({
      useFactory: async () => ({
        ...appDataSourceOptions,
        autoLoadEntities: true,
      }),
    }),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), process.env.STORAGE_ROOT || "storage"),
      serveRoot: "/public",
      serveStaticOptions: {
        index: false,
        fallthrough: true,
      },
    }),

    AuthModule,
    ProductImagesModule,
    ProductVideosModule,
    BlogImagesModule,
    CmsImagesModule,
    HealthModule,
    ZipGalleryModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
