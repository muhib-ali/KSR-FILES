import { Injectable, Logger } from "@nestjs/common";
import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import * as yauzl from "yauzl";
import { AppConfigService } from "../config/config.service";

const ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").trim();
  const out = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return out || "image";
}

function hasImageExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

function isEntryAllowed(entryFileName: string): boolean {
  const normalized = entryFileName.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("/")) return false;
  if (normalized.includes("__macosx") || normalized.includes(".ds_store")) return false;
  const underImages = normalized.startsWith("images/");
  const atRoot = !normalized.includes("/") || normalized.indexOf("/") === normalized.length - 1;
  if (!underImages && !atRoot) return false;
  return hasImageExtension(entryFileName);
}

const PROGRESS_LOG_EVERY = 100;

@Injectable()
export class ZipGalleryService {
  private readonly logger = new Logger(ZipGalleryService.name);

  constructor(private config: AppConfigService) {}

  async ensureZipGalleryDir(): Promise<string> {
    const dir = join(this.config.storageRoot, "zip-gallery");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  buildPublicUrl(fileName: string): string {
    return `${this.config.publicBaseUrl}/public/zip-gallery/${fileName}`;
  }

  /**
   * Testing only: delete all files in zip-gallery folder. Does not remove the folder itself.
   */
  async wipeZipGallery(): Promise<{ deleted: number; fileNames: string[] }> {
    const dir = await this.ensureZipGalleryDir();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const fileNames: string[] = [];
    for (const e of entries) {
      if (e.isFile()) {
        await fs.unlink(join(dir, e.name));
        fileNames.push(e.name);
      }
    }
    return { deleted: fileNames.length, fileNames };
  }

  async saveImagesFromZipFile(
    zipFilePath: string,
    onProgress?: (extractedCount: number) => void,
  ): Promise<Array<{ fileName: string; url: string }>> {
    const startMs = Date.now();
    this.logger.log(`[ZipGallery] Extraction started: ${zipFilePath}`);

    const zipGalleryDir = await this.ensureZipGalleryDir();
    const results: Array<{ fileName: string; url: string }> = [];

    await new Promise<void>((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          this.logger.error(`[ZipGallery] Failed to open ZIP: ${err.message}`);
          reject(err);
          return;
        }
        if (!zipfile) {
          resolve();
          return;
        }

        this.logger.log(`[ZipGallery] ZIP opened, reading and extracting entries...`);

        zipfile.readEntry();
        zipfile.on("entry", (entry: yauzl.Entry) => {
          if (entry.fileName.endsWith("/")) {
            zipfile.readEntry();
            return;
          }
          if (!isEntryAllowed(entry.fileName)) {
            zipfile.readEntry();
            return;
          }

          const rawBase = entry.fileName.replace(/^.*[/\\]/, "");
          let fileName = sanitizeFileName(rawBase);
          if (!fileName.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/)) {
            fileName = `${fileName}.jpg`;
          }
          const filePath = join(zipGalleryDir, fileName);

          zipfile.openReadStream(entry, (openErr, readStream) => {
            if (openErr) {
              zipfile.readEntry();
              return;
            }
            if (!readStream) {
              zipfile.readEntry();
              return;
            }
            const writeStream = createWriteStream(filePath);
            readStream.pipe(writeStream);
            writeStream.on("finish", () => {
              results.push({
                fileName,
                url: this.buildPublicUrl(fileName),
              });
              const n = results.length;
              if (onProgress && n % PROGRESS_LOG_EVERY === 0) {
                onProgress(n);
              }
              zipfile.readEntry();
            });
            writeStream.on("error", () => zipfile.readEntry());
            readStream.on("error", () => zipfile.readEntry());
          });
        });
        zipfile.on("end", () => {
          const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
          this.logger.log(`[ZipGallery] Extraction finished: ${results.length} images in ${elapsed}s`);
          resolve();
        });
        zipfile.on("error", (e) => {
          this.logger.error(`[ZipGallery] ZIP error: ${(e as Error).message}`);
          reject(e);
        });
      });
    });

    return results;
  }
}
