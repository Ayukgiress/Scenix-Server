import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { MediaModule } from './media/media.module';
import { ExportModule } from './export/export.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get('NODE_ENV') === 'production';

        if (isProd) {
          return {
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
          };
        }

        return {
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
        };
      },
    }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    MediaModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
