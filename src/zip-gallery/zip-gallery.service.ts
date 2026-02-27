import { Injectable } from "@nestjs/common";
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

@Injectable()
export class ZipGalleryService {
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

  async saveImagesFromZipFile(zipFilePath: string): Promise<Array<{ fileName: string; url: string }>> {
    const zipGalleryDir = await this.ensureZipGalleryDir();
    const results: Array<{ fileName: string; url: string }> = [];

    await new Promise<void>((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }
        if (!zipfile) {
          resolve();
          return;
        }

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
              zipfile.readEntry();
            });
            writeStream.on("error", () => zipfile.readEntry());
            readStream.on("error", () => zipfile.readEntry());
          });
        });
        zipfile.on("end", () => resolve());
        zipfile.on("error", reject);
      });
    });

    return results;
  }
}
