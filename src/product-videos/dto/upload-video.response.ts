import { ApiProperty } from "@nestjs/swagger";

export class UploadProductVideoResponse {
  @ApiProperty({
    description: "Public URL of the uploaded video",
    example: "https://files.example.com/public/videos/abc-123-xyz.mp4",
  })
  url: string;

  @ApiProperty({
    description: "Stored file name",
    example: "abc-123-xyz.mp4",
  })
  fileName: string;
}
