import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';

type FacebookProfile = {
  displayName: string;
  emails?: Array<{ value: string }>;
  photos?: Array<{ value: string }>;
};

const FacebookBase = PassportStrategy(Strategy, 'facebook');

@Injectable()
export class FacebookStrategy extends FacebookBase {
  constructor(config: ConfigService) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      clientID: config.getOrThrow<string>('FACEBOOK_APP_ID'),
      clientSecret: config.getOrThrow<string>('FACEBOOK_APP_SECRET'),
      callbackURL: config.getOrThrow<string>('FACEBOOK_CALLBACK_URL'),
      profileFields: ['emails', 'displayName', 'photos'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: FacebookProfile,
    done: (error: null, user: unknown) => void,
  ): void {
    const email = profile.emails?.[0]?.value ?? '';
    const profileImageUrl = profile.photos?.[0]?.value;
    done(null, { email, name: profile.displayName, profileImageUrl });
  }
}
