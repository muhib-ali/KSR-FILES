import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { BlogImagesService } from './blog-images.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type UploadedImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags('Blog Images')
@UseGuards(JwtAuthGuard)
@Controller('v1/blogs')
export class BlogImagesController {
  private readonly logger = new Logger(BlogImagesController.name);

  constructor(private readonly blogImagesService: BlogImagesService) {}

  @Post('image')
  @ApiOperation({ summary: 'Upload blog image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Blog image uploaded successfully',
    schema: {
      example: {
        success: true,
        message: 'Blog image uploaded successfully',
        data: {
          url: 'http://localhost:3003/public/blogs/uuid-1700000000-abcd1234.webp',
          fileName: 'uuid-1700000000-abcd1234.webp',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid file or no file provided' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT token required' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new Error('Only jpeg, png, webp images are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadBlogImage(
    @Req() req: Request,
    @UploadedFile() file: UploadedImageFile,
  ) {
    this.logger.log(`[uploadBlogImage] Uploading blog image: ${file?.originalname}`);

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      const result = await this.blogImagesService.uploadBlogImage(
        file,
        req.headers.authorization,
      );

      this.logger.log(`[uploadBlogImage] Blog image uploaded successfully: ${result.fileName}`);
      return result;
    } catch (error) {
      this.logger.error(`[uploadBlogImage] Error uploading blog image:`, error);
      throw error;
    }
  }
}
