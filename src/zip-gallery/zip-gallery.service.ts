import { Injectable, Logger } from "@nestjs/common";
import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import * as yauzl from "yauzl";
import { AppConfigService } from "../config/config.service";

const CHUNK_UPLOAD_MAX_BYTES = 100 * 1024 * 1024; // 100 MB per chunk (stay under 5 min on slow links)

export type ZipGalleryJobStatus = "processing" | "completed" | "failed";

export type ZipGalleryJob = {
  status: ZipGalleryJobStatus;
  uploaded?: Array<{ fileName: string; url: string }>;
  error?: string;
};

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
  private readonly chunkedUploads = new Map<string, { tempPath: string }>();
  private readonly jobs = new Map<string, ZipGalleryJob>();

  constructor(private config: AppConfigService) {}

  async ensureZipGalleryDir(): Promise<string> {
    const dir = join(this.config.storageRoot, "zip-gallery");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  buildPublicUrl(fileName: string): string {
    return `${this.config.publicBaseUrl}/public/zip-gallery/${fileName}`;
  }

  /** Init a chunked upload; returns uploadId. Each chunk must be uploaded within 5 min (e.g. 100 MB). */
  async initChunkedUpload(): Promise<{ uploadId: string }> {
    const uploadId = randomUUID();
    const tempDir = join(this.config.storageRoot, "temp-zip");
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `${uploadId}.zip`);
    this.chunkedUploads.set(uploadId, { tempPath });
    this.logger.log(`[ZipGallery] Chunked upload init: ${uploadId}`);
    return { uploadId };
  }

  /** Append a chunk to the upload file. */
  async appendChunk(uploadId: string, chunkFilePath: string): Promise<void> {
    const meta = this.chunkedUploads.get(uploadId);
    if (!meta) throw new Error("Invalid or expired uploadId");
    const data = await fs.readFile(chunkFilePath);
    if (data.length > CHUNK_UPLOAD_MAX_BYTES)
      throw new Error(`Chunk too large (max ${CHUNK_UPLOAD_MAX_BYTES / 1024 / 1024} MB)`);
    await fs.appendFile(meta.tempPath, data);
    await fs.unlink(chunkFilePath).catch(() => {});
  }

  /** Complete chunked upload: start extraction in background, return jobId. Call GET /jobs/:jobId to poll. */
  completeChunkedUpload(uploadId: string): { jobId: string } {
    const meta = this.chunkedUploads.get(uploadId);
    if (!meta) throw new Error("Invalid or expired uploadId");
    this.chunkedUploads.delete(uploadId);
    const jobId = randomUUID();
    this.jobs.set(jobId, { status: "processing" });
    const tempPath = meta.tempPath;
    setImmediate(() => {
      this.saveImagesFromZipFile(tempPath)
        .then((uploaded) => {
          this.jobs.set(jobId, { status: "completed", uploaded });
          this.logger.log(`[ZipGallery] Job ${jobId} completed: ${uploaded.length} images`);
        })
        .catch((err) => {
          this.jobs.set(jobId, { status: "failed", error: (err as Error).message });
          this.logger.error(`[ZipGallery] Job ${jobId} failed: ${(err as Error).message}`);
        })
        .finally(() => {
          fs.unlink(tempPath).catch(() => {});
        });
    });
    this.logger.log(`[ZipGallery] Chunked upload complete: ${uploadId} -> job ${jobId}`);
    return { jobId };
  }

  getJobStatus(jobId: string): ZipGalleryJob | null {
    return this.jobs.get(jobId) ?? null;
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
