import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BigIntInterceptor } from './common/bigint.interceptor';
import { LoggingInterceptor } from './common/logging.interceptor';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { MediaModule } from './media/media.module';
import { ExportModule } from './export/export.module';
import { StorageModule } from './storage/storage.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';

import { SubtitlesModule } from './subtitles/subtitles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
        },
      }),
    }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST'),
          port: config.get<number>('MAIL_PORT', 587),
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: config.get('MAIL_FROM', '"Scenix" <no-reply@scenix.app>'),
        },
      }),
    }),
    EventsModule,
    StorageModule,
    PrismaModule,
    AuthModule,
    ProjectsModule,
    MediaModule,
    ExportModule,
    SubtitlesModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    BigIntInterceptor,
    LoggingInterceptor,
    PrismaExceptionFilter,
  ],
})
export class AppModule {}
