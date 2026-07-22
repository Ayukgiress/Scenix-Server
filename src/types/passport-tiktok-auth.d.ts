declare module 'passport-tiktok-auth' {
  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }

  export class Strategy {
    constructor(
      options: StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: unknown,
        done: (error: unknown, user?: unknown) => void,
      ) => void,
    );
  }
}
