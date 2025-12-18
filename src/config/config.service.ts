import { Injectable } from "@nestjs/common";
import { resolve } from "path";

@Injectable()
export class AppConfigService {
  get port(): number {
    return parseInt(process.env.APP_PORT || "3003", 10);
  }

  get jwtSecret(): string {
    return process.env.JWT_SECRET || "your-secret-key";
  }

  get storageRoot(): string {
    return resolve(process.env.STORAGE_ROOT || "storage");
  }

  get publicBaseUrl(): string {
    return process.env.FILES_PUBLIC_BASE_URL || `http://localhost:${this.port}`;
  }
}
