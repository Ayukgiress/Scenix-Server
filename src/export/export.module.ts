import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { ExportProcessor, EXPORT_QUEUE } from './export.processor';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [BullModule.registerQueue({ name: EXPORT_QUEUE }), EventsModule],
  providers: [ExportService, ExportProcessor],
  controllers: [ExportController],
})
export class ExportModule {}
