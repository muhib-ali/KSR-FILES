import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
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
import { ProductImagesService } from "./product-images.service";
import { UploadProductImageResponse } from "./dto/upload-image.response";

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags("Product Images")
@Controller("v1/products")
export class ProductImagesController {
  constructor(private readonly service: ProductImagesService) {}

  private isSafeFileName(fileName: string): boolean {
    if (!fileName) return false;
    if (fileName.includes("..")) return false;
    if (fileName.includes("/") || fileName.includes("\\")) return false;
    return /^[A-Za-z0-9._-]+$/.test(fileName);
  }

  @Post(":productId/image")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Upload product image (single)" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({ status: 201, type: UploadProductImageResponse })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
      },
      fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException("Only jpeg, png, webp images are allowed") as any, false);
        }
        cb(null, true);
      },
    })
  )
  async uploadProductImage(
    @Param("productId") productId: string,
    @UploadedFile() file: UploadedImageFile
  ): Promise<UploadProductImageResponse> {
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    const saved = await this.service.saveProductImage({
      productId,
      buffer: file.buffer,
      originalName: file.originalname,
      mimetype: file.mimetype,
    });

    return saved;
  }

  @Delete("image/:fileName")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Delete product image file (by fileName)" })
  @ApiParam({ name: "fileName", type: String, description: "Stored image file name" })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async deleteProductImage(@Param("fileName") fileName: string) {
    if (!this.isSafeFileName(fileName)) {
      throw new BadRequestException("Invalid file name");
    }
    await this.service.deleteProductImage(fileName);
    return { success: true };
  }
}
