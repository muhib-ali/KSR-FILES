import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
import { promises as fs } from "fs";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZipGalleryService } from "./zip-gallery.service";

const FIVE_GB = 5 * 1024 * 1024 * 1024;

@ApiTags("Zip Gallery")
@Controller("v1/zip-gallery")
export class ZipGalleryController {
  constructor(private readonly service: ZipGalleryService) {}

  @Post("upload")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Upload a ZIP file; extract images to zip-gallery (max 5 GB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiResponse({ status: 201, description: "Images extracted and saved", schema: {
    type: "object",
    properties: {
      uploaded: {
        type: "array",
        items: { type: "object", properties: { fileName: { type: "string" }, url: { type: "string" } } },
      },
    },
  } })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: join(process.cwd(), process.env.STORAGE_ROOT || "storage", "temp-zip"),
        filename: (_, file, cb) => {
          const name = `${Date.now()}-${(file.originalname || "upload").replace(/[^A-Za-z0-9._-]/g, "_")}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: FIVE_GB },
      fileFilter: (_, file, cb) => {
        const n = (file.originalname || "").toLowerCase();
        if (!n.endsWith(".zip")) {
          return cb(new BadRequestException("Only .zip files are allowed") as any, false);
        }
        cb(null, true);
      },
    })
  )
  async uploadZip(@Req() req: any) {
    const file = req?.file;
    if (!file?.path) {
      throw new BadRequestException("ZIP file is required");
    }
    try {
      const uploaded = await this.service.saveImagesFromZipFile(file.path);
      return { uploaded };
    } finally {
      try {
        await fs.unlink(file.path);
      } catch {
        // ignore cleanup
      }
    }
  }

  @Delete("wipe")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "[Testing only] Delete all images in zip-gallery" })
  @ApiResponse({ status: 200, description: "Zip-gallery wiped", schema: {
    type: "object",
    properties: { deleted: { type: "number" }, fileNames: { type: "array", items: { type: "string" } } },
  } })
  async wipeZipGallery() {
    return this.service.wipeZipGallery();
  }
}
