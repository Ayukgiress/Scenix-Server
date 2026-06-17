import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { MediaModule } from './media/media.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [AuthModule, ProjectsModule, MediaModule, ExportModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
