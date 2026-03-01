import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { diskStorage } from "multer";
import { join } from "path";
import { promises as fs } from "fs";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZipGalleryService } from "./zip-gallery.service";

const HEARTBEAT_INTERVAL_MS = 25000;
const FIVE_GB = 5 * 1024 * 1024 * 1024;
const CHUNK_MAX_MB = 100;
const CHUNK_MAX_BYTES = CHUNK_MAX_MB * 1024 * 1024;

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

@ApiTags("Zip Gallery")
@Controller("v1/zip-gallery")
export class ZipGalleryController {
  private readonly logger = new Logger(ZipGalleryController.name);

  constructor(private readonly service: ZipGalleryService) {}

  @Post("upload")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Upload a ZIP file; extract images to zip-gallery (max 5 GB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiResponse({ status: 201, description: "Images extracted and saved", schema: {
    type: "object",
    properties: {
      uploaded: {
        type: "array",
        items: { type: "object", properties: { fileName: { type: "string" }, url: { type: "string" } } },
      },
    },
  } })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: join(process.cwd(), process.env.STORAGE_ROOT || "storage", "temp-zip"),
        filename: (_, file, cb) => {
          const name = `${Date.now()}-${(file.originalname || "upload").replace(/[^A-Za-z0-9._-]/g, "_")}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: FIVE_GB },
      fileFilter: (_, file, cb) => {
        const n = (file.originalname || "").toLowerCase();
        if (!n.endsWith(".zip")) {
          return cb(new BadRequestException("Only .zip files are allowed") as any, false);
        }
        cb(null, true);
      },
    })
  )
  async uploadZip(@Req() req: any, @Res({ passthrough: false }) res: Response) {
    const handlerStartAt = Date.now();

    const file = req?.file;
    if (!file?.path) {
      throw new BadRequestException("ZIP file is required");
    }

    const sizeBytes = (file as any).size ?? 0;
    this.logger.log(
      `[ZipGallery] ZIP file received: ${file.originalname || file.path}, size: ${formatSize(sizeBytes)}`
    );
    this.logger.log(`[ZipGallery] Starting extraction (chunked response with heartbeat)...`);

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.status(200);
    res.flushHeaders();

    const sendHeartbeat = () => {
      try {
        res.write("\n");
      } catch {
        // client may have disconnected
      }
    };

    const heartbeatId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    sendHeartbeat();

    try {
      const uploaded = await this.service.saveImagesFromZipFile(file.path, (count) => {
        this.logger.log(`[ZipGallery] Extracted ${count} images so far...`);
      });
      clearInterval(heartbeatId);
      const totalSec = ((Date.now() - handlerStartAt) / 1000).toFixed(1);
      this.logger.log(
        `[ZipGallery] Extraction complete: ${uploaded.length} images (handler total: ${totalSec}s)`
      );
      const payload = JSON.stringify({ uploaded }) + "\n";
      res.write(payload);
      res.end();
    } catch (err) {
      clearInterval(heartbeatId);
      try {
        res.write(JSON.stringify({ error: (err as Error).message, uploaded: [] }) + "\n");
      } catch {
        // ignore
      }
      res.end();
    } finally {
      try {
        await fs.unlink(file.path);
      } catch {
        // ignore cleanup
      }
    }
  }

  @Post("upload/init")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Start chunked upload (for large ZIPs). Returns uploadId; then POST chunks, then POST complete." })
  @ApiResponse({ status: 201, description: "Upload initialized", schema: { type: "object", properties: { uploadId: { type: "string" } } } })
  async initChunkedUpload() {
    return this.service.initChunkedUpload();
  }

  @Post("upload/chunk")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Upload one chunk (max 100 MB). Body: multipart with uploadId, part, and chunk (file)." })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("chunk", {
      storage: diskStorage({
        destination: join(process.cwd(), process.env.STORAGE_ROOT || "storage", "temp-zip"),
        filename: (_, file, cb) => cb(null, `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      }),
      limits: { fileSize: CHUNK_MAX_BYTES },
    }),
  )
  async uploadChunk(@Req() req: any) {
    const uploadId = (req.body?.uploadId ?? "").toString().trim();
    if (!uploadId) throw new BadRequestException("uploadId is required");
    const file = req?.file;
    if (!file?.path) throw new BadRequestException("chunk file is required");
    await this.service.appendChunk(uploadId, file.path);
    return { ok: true, part: req.body?.part ?? 0 };
  }

  @Post("upload/complete")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Finish chunked upload; extraction runs in background. Poll GET /jobs/:jobId for result." })
  @ApiBody({ schema: { type: "object", required: ["uploadId"], properties: { uploadId: { type: "string" } } } })
  @ApiResponse({ status: 202, description: "Accepted", schema: { type: "object", properties: { jobId: { type: "string" } } } })
  completeChunkedUpload(@Body("uploadId") uploadId: string) {
    const id = (uploadId ?? "").toString().trim();
    if (!id) throw new BadRequestException("uploadId is required");
    return this.service.completeChunkedUpload(id);
  }

  @Get("jobs/:jobId")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get status of a zip-gallery extraction job (processing | completed | failed)." })
  @ApiResponse({ status: 200, description: "Job status", schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["processing", "completed", "failed"] },
      uploaded: { type: "array", items: { type: "object", properties: { fileName: { type: "string" }, url: { type: "string" } } } },
      error: { type: "string" },
    },
  } })
  getJobStatus(@Param("jobId") jobId: string) {
    const job = this.service.getJobStatus(jobId);
    if (!job) throw new BadRequestException("Job not found");
    return job;
  }

  @Delete("wipe")
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "[Testing only] Delete all images in zip-gallery" })
  @ApiResponse({ status: 200, description: "Zip-gallery wiped", schema: {
    type: "object",
    properties: { deleted: { type: "number" }, fileNames: { type: "array", items: { type: "string" } } },
  } })
  async wipeZipGallery() {
    return this.service.wipeZipGallery();
  }
}
