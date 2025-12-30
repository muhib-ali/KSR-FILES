import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProductVideosService } from "./product-videos.service";
import { UploadProductVideoResponse } from "./dto/upload-video.response";

type UploadedVideoFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags("Product Videos")
@Controller("v1/products")
export class ProductVideosController {
  constructor(private readonly service: ProductVideosService) {}

  private isSafeFileName(fileName: string): boolean {
    if (!fileName) return false;
    if (fileName.includes("..")) return false;
    if (fileName.includes("/") || fileName.includes("\\")) return false;
    return /^[A-Za-z0-9._-]+$/.test(fileName);
  }

  @Post(":productId/video")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Upload product video" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({ status: 201, type: UploadProductVideoResponse })
  @UseInterceptors(
    FileInterceptor("video", {
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        const allowed = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException("Only mp4, webm, ogg, quicktime videos are allowed") as any, false);
        }
        cb(null, true);
      },
    })
  )
  async uploadProductVideo(
    @Param("productId") productId: string,
    @Req() req: any
  ): Promise<UploadProductVideoResponse> {
    const file = req?.file as UploadedVideoFile | undefined;

    if (!file || !file.buffer || !file.mimetype) {
      throw new BadRequestException("Video file is required");
    }

    const saved = await this.service.saveProductVideo({
      productId,
      buffer: file.buffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
    });

    return {
      url: saved.url,
      fileName: saved.fileName,
    };
  }

  @Delete("video/:fileName")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Delete product video file (by fileName)" })
  @ApiParam({ name: "fileName", type: String, description: "Stored video file name" })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async deleteProductVideo(@Param("fileName") fileName: string) {
    if (!this.isSafeFileName(fileName)) {
      throw new BadRequestException("Invalid file name");
    }
    await this.service.deleteProductVideo(fileName);
    return { success: true };
  }
}
