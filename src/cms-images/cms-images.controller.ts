import {
  Controller,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  Req,
  Param,
  BadRequestException,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Request } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { CmsImagesService } from "./cms-images.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags("CMS Images")
@UseGuards(JwtAuthGuard)
@Controller("v1/cms")
export class CmsImagesController {
  private readonly logger = new Logger(CmsImagesController.name);

  constructor(private readonly cmsImagesService: CmsImagesService) {}

  @Post("image")
  @ApiOperation({ summary: "Upload CMS image" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "CMS image uploaded successfully",
    schema: {
      example: {
        statusCode: 201,
        status: true,
        message: "CMS image uploaded successfully",
        data: {
          url: "http://localhost:3003/public/cms/uuid-timestamp.webp",
          fileName: "uuid-timestamp.webp",
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Bad Request - Invalid file or no file provided" })
  @ApiResponse({ status: 401, description: "Unauthorized - JWT token required" })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new Error("Only jpeg, png, webp images are allowed"),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadCmsImage(
    @Req() req: Request,
    @UploadedFile() file: UploadedImageFile,
  ) {
    this.logger.log(
      `[uploadCmsImage] Uploading CMS image: ${file?.originalname}`,
    );

    if (!file) {
      throw new BadRequestException("No file provided");
    }

    const result = await this.cmsImagesService.uploadCmsImage(
      file,
      req.headers.authorization as string,
    );

    this.logger.log(
      `[uploadCmsImage] CMS image uploaded successfully: ${result.data.fileName}`,
    );
    return result;
  }

  @Delete("image/:fileName")
  @ApiOperation({ summary: "Delete CMS image by file name" })
  @ApiResponse({ status: 200, description: "CMS image deleted successfully" })
  @ApiResponse({ status: 400, description: "Bad Request - Invalid file name or file not found" })
  @ApiResponse({ status: 401, description: "Unauthorized - JWT token required" })
  async deleteCmsImage(
    @Param("fileName") fileName: string,
    @Req() req: Request,
  ) {
    this.logger.log(`[deleteCmsImage] Request to delete: ${fileName}`);
    const result = await this.cmsImagesService.deleteCmsImage(
      fileName,
      req.headers.authorization as string,
    );
    return result;
  }
}
