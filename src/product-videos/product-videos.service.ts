import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { AppConfigService } from "../config/config.service";

@Injectable()
export class ProductVideosService {
  constructor(private config: AppConfigService) {}

  async ensureVideosDir(): Promise<string> {
    const videosDir = join(this.config.storageRoot, "videos");
    await fs.mkdir(videosDir, { recursive: true });
    return videosDir;
  }

  async deleteProductVideo(fileName: string): Promise<void> {
    const videosDir = await this.ensureVideosDir();
    const filePath = join(videosDir, fileName);
    try {
      await fs.unlink(filePath);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        return;
      }
      throw e;
    }
  }

  buildPublicUrl(fileName: string): string {
    return `${this.config.publicBaseUrl}/public/videos/${fileName}`;
  }

  generateFileName(productId: string, originalName: string, mimetype: string): string {
    const ext = this.guessExtension(originalName, mimetype);
    const rand = randomBytes(8).toString("hex");
    return `${productId}-${Date.now()}-${rand}${ext}`;
  }

  async saveProductVideo(params: {
    productId: string;
    buffer: Buffer;
    originalName: string;
    mimetype: string;
  }): Promise<{ fileName: string; url: string }> {
    const videosDir = await this.ensureVideosDir();
    const fileName = this.generateFileName(
      params.productId,
      params.originalName,
      params.mimetype
    );

    const filePath = join(videosDir, fileName);
    await fs.writeFile(filePath, params.buffer);

    return {
      fileName,
      url: this.buildPublicUrl(fileName),
    };
  }

  private guessExtension(originalName: string, mimetype: string): string {
    const lower = originalName.toLowerCase();
    if (lower.endsWith(".mp4")) return ".mp4";

    if (mimetype === "video/mp4") return ".mp4";

    return "";
  }
}
