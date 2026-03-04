import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { promises as fs } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { ResponseHelper } from "../common/helpers/response.helper";
import { AuthService } from "../auth/auth.service";

type ImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

@Injectable()
export class CmsImagesService {
  private readonly logger = new Logger(CmsImagesService.name);
  private readonly storageRoot = join(
    process.cwd(),
    process.env.STORAGE_ROOT || "storage",
  );
  private readonly cmsDir = join(this.storageRoot, "cms");

  constructor(private readonly authService: AuthService) {}

  async uploadCmsImage(
    file: ImageFile,
    authorization: string,
  ): Promise<{ statusCode: number; status: boolean; message: string; heading: string; data: { url: string; fileName: string } }> {
    this.logger.log(
      `[uploadCmsImage] Starting upload for file: ${file.originalname}`,
    );

    const token = authorization?.replace("Bearer ", "");
    if (!token) {
      throw new UnauthorizedException("No authorization token provided");
    }

    const user = await this.authService.validateToken(token, "");
    if (!user) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    this.logger.log(`[uploadCmsImage] User authenticated: ${user.id}`);

    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = this.getExtensionFromMimeType(file.mimetype);
    const fileName = `${uuid}-${timestamp}${extension}`;

    await fs.mkdir(this.cmsDir, { recursive: true });

    const filePath = join(this.cmsDir, fileName);
    await fs.writeFile(filePath, file.buffer);

    const baseUrl =
      process.env.FILES_BACKEND_URL || "http://localhost:3003";
    const publicUrl = `${baseUrl}/public/cms/${fileName}`;

    this.logger.log(`[uploadCmsImage] File saved successfully: ${fileName}`);

    return ResponseHelper.success(
      { url: publicUrl, fileName },
      "CMS image uploaded successfully",
      "CmsImage",
      201,
    );
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      "image/jpeg": ".webp",
      "image/png": ".webp",
      "image/webp": ".webp",
    };
    return mimeToExt[mimeType] || ".webp";
  }

  async deleteCmsImage(
    fileName: string,
    authorization: string,
  ): Promise<{ statusCode: number; status: boolean; message: string; heading: string; data: { fileName: string } }> {
    this.logger.log(`[deleteCmsImage] Deleting file: ${fileName}`);

    const token = authorization?.replace("Bearer ", "");
    if (!token) {
      throw new UnauthorizedException("No authorization token provided");
    }

    const user = await this.authService.validateToken(token, "");
    if (!user) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!sanitized) {
      throw new BadRequestException("Invalid file name");
    }

    const filePath = join(this.cmsDir, sanitized);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      this.logger.log(`[deleteCmsImage] File deleted successfully: ${sanitized}`);
      return ResponseHelper.success(
        { fileName: sanitized },
        "CMS image deleted successfully",
        "CmsImage",
      );
    } catch (err: unknown) {
      this.logger.error(`[deleteCmsImage] Error deleting file: ${sanitized}`, err);
      throw new BadRequestException("File not found or cannot be deleted");
    }
  }
}
