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
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProductImagesService } from "./product-images.service";
import { UploadProductImageResponse } from "./dto/upload-image.response";

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
  fieldname?: string;
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
  @ApiOperation({ summary: "Upload product image(s) (max 5)" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({ status: 201, type: UploadProductImageResponse })
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5,
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
    @Req() req: any
  ): Promise<UploadProductImageResponse> {
    const files = (req?.files as UploadedImageFile[] | undefined) || [];
    const usable = files
      .filter((f) => f && f.buffer && f.mimetype)
      .filter((f) => f.fieldname === "files" || f.fieldname === "file")
      .slice(0, 5);

    if (usable.length < 1) {
      throw new BadRequestException("Image file(s) are required");
    }

    const saved =
      usable.length === 1
        ? [
            {
              ...(await this.service.saveProductImage({
                productId,
                buffer: usable[0].buffer,
                originalName: usable[0].originalname,
                mimetype: usable[0].mimetype,
              })),
              sortOrder: 1,
            },
          ]
        : await this.service.saveProductImages({
            productId,
            files: usable.map((f) => ({
              buffer: f.buffer,
              originalName: f.originalname,
              mimetype: f.mimetype,
            })),
          });

    return {
      url: saved?.[0]?.url,
      fileName: saved?.[0]?.fileName,
      images: saved,
    };
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
