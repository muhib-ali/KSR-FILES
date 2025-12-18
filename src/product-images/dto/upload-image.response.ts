import { ApiProperty } from "@nestjs/swagger";

export class UploadProductImageResponse {
  @ApiProperty({
    description: "Public URL for the uploaded image",
    example: "http://localhost:3003/public/products/uuid-1700000000-abcd1234.jpg",
  })
  url: string;

  @ApiProperty({
    description: "Stored file name",
    example: "uuid-1700000000-abcd1234.jpg",
  })
  fileName: string;
}
