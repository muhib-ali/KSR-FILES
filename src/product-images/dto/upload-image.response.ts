import { ApiProperty } from "@nestjs/swagger";

export class UploadProductImageItem {
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

  @ApiProperty({
    description: "Order of image in the uploaded batch (1..5)",
    example: 1,
    required: false,
  })
  sortOrder?: number;
}

export class UploadProductImageResponse {
  @ApiProperty({
    description: "Public URL for the first uploaded image (backward compatible)",
    example: "http://localhost:3003/public/products/uuid-1700000000-abcd1234.jpg",
    required: false,
  })
  url?: string;

  @ApiProperty({
    description: "Stored file name for the first uploaded image (backward compatible)",
    example: "uuid-1700000000-abcd1234.jpg",
    required: false,
  })
  fileName?: string;

  @ApiProperty({
    description: "Uploaded images",
    type: [UploadProductImageItem],
  })
  images: UploadProductImageItem[];
}
