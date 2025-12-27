import { Module as NestModule } from "@nestjs/common";
import { ProductVideosController } from "./product-videos.controller";
import { ProductVideosService } from "./product-videos.service";

@NestModule({
  controllers: [ProductVideosController],
  providers: [ProductVideosService],
})
export class ProductVideosModule {}
