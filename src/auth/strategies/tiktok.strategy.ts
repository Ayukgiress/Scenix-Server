import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

import { Strategy as TikTokPassportStrategy } from 'passport-tiktok-auth';

interface TikTokProfile {
  email?: string;
  displayName: string;
  avatarUrl?: string;
  id: string;
}

const TikTokBase = PassportStrategy(TikTokPassportStrategy, 'tiktok');

@Injectable()
export class TikTokStrategy extends TikTokBase {
  constructor(config: ConfigService) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      clientID: config.getOrThrow<string>('TIKTOK_CLIENT_KEY'),
      clientSecret: config.getOrThrow<string>('TIKTOK_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('TIKTOK_CALLBACK_URL'),
      scope: ['user.info.basic'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: TikTokProfile,

    done: (error: any, user?: any) => void,
  ) {
    const { email, displayName, avatarUrl } = profile;
    const profileImageUrl = avatarUrl;
    done(null, { email: email || '', name: displayName, profileImageUrl });
  }
}
