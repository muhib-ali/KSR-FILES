import { Module } from "@nestjs/common";
import { ZipGalleryController } from "./zip-gallery.controller";
import { ZipGalleryService } from "./zip-gallery.service";

@Module({
  controllers: [ZipGalleryController],
  providers: [ZipGalleryService],
})
export class ZipGalleryModule {}
