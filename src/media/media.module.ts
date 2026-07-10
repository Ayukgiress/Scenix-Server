import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { StorageModule } from '../storage/storage.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [StorageModule, EventsModule],
  providers: [MediaService],
  controllers: [MediaController],
})
export class MediaModule {}
