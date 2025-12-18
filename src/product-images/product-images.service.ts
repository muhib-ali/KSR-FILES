import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { AppConfigService } from "../config/config.service";

@Injectable()
export class ProductImagesService {
  constructor(private config: AppConfigService) {}

  async ensureProductsDir(): Promise<string> {
    const productsDir = join(this.config.storageRoot, "products");
    await fs.mkdir(productsDir, { recursive: true });
    return productsDir;
  }

  async deleteProductImage(fileName: string): Promise<void> {
    const productsDir = await this.ensureProductsDir();
    const filePath = join(productsDir, fileName);
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
    return `${this.config.publicBaseUrl}/public/products/${fileName}`;
  }

  generateFileName(productId: string, originalName: string, mimetype: string): string {
    const ext = this.guessExtension(originalName, mimetype);
    const rand = randomBytes(8).toString("hex");
    return `${productId}-${Date.now()}-${rand}${ext}`;
  }

  async saveProductImage(params: {
    productId: string;
    buffer: Buffer;
    originalName: string;
    mimetype: string;
  }): Promise<{ fileName: string; url: string }> {
    const productsDir = await this.ensureProductsDir();
    const fileName = this.generateFileName(
      params.productId,
      params.originalName,
      params.mimetype
    );

    const filePath = join(productsDir, fileName);
    await fs.writeFile(filePath, params.buffer);

    return {
      fileName,
      url: this.buildPublicUrl(fileName),
    };
  }

  private guessExtension(originalName: string, mimetype: string): string {
    const lower = originalName.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return ".jpg";
    if (lower.endsWith(".png")) return ".png";
    if (lower.endsWith(".webp")) return ".webp";

    if (mimetype === "image/jpeg") return ".jpg";
    if (mimetype === "image/png") return ".png";
    if (mimetype === "image/webp") return ".webp";

    return "";
  }
}
