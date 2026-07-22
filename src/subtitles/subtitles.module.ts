import { Module } from '@nestjs/common';
import { SubtitlesService } from './subtitles.service';
import { SubtitlesController } from './subtitles.controller';

@Module({
  providers: [SubtitlesService],
  controllers: [SubtitlesController],
  exports: [SubtitlesService],
})
export class SubtitlesModule {}
