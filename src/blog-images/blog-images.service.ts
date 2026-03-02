import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ResponseHelper } from '../common/helpers/response.helper';
import { AuthService } from '../auth/auth.service';
import { AppConfigService } from '../config/config.service';

type ImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class BlogImagesService {
  private readonly logger = new Logger(BlogImagesService.name);
  private readonly storageRoot = join(process.cwd(), process.env.STORAGE_ROOT || 'storage');
  private readonly blogsDir = join(this.storageRoot, 'blogs');

  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  async uploadBlogImage(file: ImageFile, authorization: string): Promise<any> {
    this.logger.log(`[uploadBlogImage] Starting upload for file: ${file.originalname}`);

    // Validate JWT token
    // Extract token from "Bearer token" format
    const token = authorization?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    const user = await this.authService.validateToken(token, '');
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    this.logger.log(`[uploadBlogImage] User authenticated: ${user.id}`);

    // Generate unique filename
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = this.getExtensionFromMimeType(file.mimetype);
    const fileName = `${uuid}-${timestamp}${extension}`;

    // Ensure blogs directory exists
    await fs.mkdir(this.blogsDir, { recursive: true });

    // Save file to disk
    const filePath = join(this.blogsDir, fileName);
    await fs.writeFile(filePath, file.buffer);

    // Generate public URL (same base as product images / zip-gallery: FILES_PUBLIC_BASE_URL)
    const publicUrl = `${this.config.publicBaseUrl}/public/blogs/${fileName}`;

    this.logger.log(`[uploadBlogImage] File saved successfully: ${fileName}`);
    this.logger.log(`[uploadBlogImage] Public URL: ${publicUrl}`);

    return ResponseHelper.success(
      { url: publicUrl, fileName },
      'Blog image uploaded successfully',
      'BlogImage',
      201,
    );
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': '.webp', // Convert to webp for consistency
      'image/png': '.webp',  // Convert to webp for consistency
      'image/webp': '.webp',
    };

    return mimeToExt[mimeType] || '.webp';
  }

  async deleteBlogImage(fileName: string, authorization: string): Promise<any> {
    this.logger.log(`[deleteBlogImage] Deleting file: ${fileName}`);

    // Validate JWT token
    // Extract token from "Bearer token" format
    const token = authorization?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    const user = await this.authService.validateToken(token, '');
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const filePath = join(this.blogsDir, fileName);

    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Delete file
      await fs.unlink(filePath);
      
      this.logger.log(`[deleteBlogImage] File deleted successfully: ${fileName}`);
      
      return ResponseHelper.success(
        { fileName },
        'Blog image deleted successfully',
        'BlogImage',
      );
    } catch (error) {
      this.logger.error(`[deleteBlogImage] Error deleting file: ${fileName}`, error);
      throw new BadRequestException('File not found or cannot be deleted');
    }
  }
}
