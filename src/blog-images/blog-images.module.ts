import { Module } from '@nestjs/common';
import { BlogImagesController } from './blog-images.controller';
import { BlogImagesService } from './blog-images.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BlogImagesController],
  providers: [BlogImagesService],
  exports: [BlogImagesService],
})
export class BlogImagesModule {}
