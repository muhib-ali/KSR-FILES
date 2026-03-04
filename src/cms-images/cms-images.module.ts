import { Module } from "@nestjs/common";
import { CmsImagesController } from "./cms-images.controller";
import { CmsImagesService } from "./cms-images.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [CmsImagesController],
  providers: [CmsImagesService],
  exports: [CmsImagesService],
})
export class CmsImagesModule {}
