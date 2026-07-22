import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class TikTokAuthGuard extends AuthGuard('tiktok') {}
