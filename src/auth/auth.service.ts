import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mailer: MailerService,
    private config: ConfigService,
  ) {}

  private sign(userId: string, email: string) {
    return this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '7d'),
      },
    );
  }

  private async issueTokens(
    userId: string,
    email: string,
    emailVerified: boolean,
  ) {
    const accessToken = this.sign(userId, email);

    const rawToken = randomBytes(40).toString('hex');
    const refreshTokenHash = createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const refreshTokenExpiresAt = new Date(
      Date.now() +
        parseInt(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS', '30')) *
          86400000,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash, refreshTokenExpiresAt },
    });

    return { accessToken, refreshToken: rawToken, emailVerified };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    const emailToken = this.jwt.sign(
      { sub: user.id, purpose: 'email-verify' },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '24h',
      },
    );

    const verifyUrl = `${this.config.get('CLIENT_URL')}/verify-email?token=${emailToken}`;

    await this.mailer.sendMail({
      to: user.email,
      subject: 'Verify your Scenix account',
      html: `<p>Click <a href="${verifyUrl}">here</a> to verify your email. Link expires in 24h.</p>`,
    });
    if (this.config.get('NODE_ENV') !== 'production') {
      this.logger.debug(`[DEV] Verify email URL for ${user.email}: ${verifyUrl}`);
    }

    return {
      message: 'Registration successful. Please verify your email.',
      emailVerified: false,
    };
  }

  async login(user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
  }) {
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please verify your email before logging in',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.email, true);
  }

  async refresh(rawToken: string) {
    const refreshTokenHash = createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const user = await this.prisma.user.findFirst({
      where: { refreshTokenHash },
    });

    if (
      !user ||
      !user.refreshTokenExpiresAt ||
      user.refreshTokenExpiresAt < new Date()
    ) {
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
        });
      }
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    return this.issueTokens(user.id, user.email, !!user.emailVerifiedAt);
  }

  async logout(rawToken: string) {
    const refreshTokenHash = createHash('sha256')
      .update(rawToken)
      .digest('hex');
    await this.prisma.user
      .updateMany({
        where: { refreshTokenHash },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      })
      .catch(() => null);
    return { message: 'Logged out successfully' };
  }

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Token is required');

    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify<{ sub: string; purpose: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }

    if (payload.purpose !== 'email-verify') {
      throw new BadRequestException('Invalid token purpose');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new BadRequestException('Invalid or expired token');

    if (user.emailVerifiedAt) {
      return { message: 'Email already verified' };
    }

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerifiedAt: new Date() },
    });

    return { message: 'Email verified successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        profileImageUrl: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return { ...user, emailVerified: !!user.emailVerifiedAt };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user)
      return { message: 'If that email exists, a reset link was sent.' };

    const resetToken = this.jwt.sign(
      { sub: user.id, purpose: 'password-reset' },
      { secret: this.config.getOrThrow<string>('JWT_SECRET'), expiresIn: '1h' },
    );

    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: new Date(Date.now() + 3600000),
      },
    });

    const resetUrl = `${this.config.get('CLIENT_URL')}/reset-password?token=${resetToken}`;

    await this.mailer.sendMail({
      to: user.email,
      subject: 'Reset your Scenix password',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1h.</p>`,
    });
    if (this.config.get('NODE_ENV') !== 'production') {
      this.logger.debug(`[DEV] Password reset URL for ${user.email}: ${resetUrl}`);
    }

    return { message: 'If that email exists, a reset link was sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify<{ sub: string; purpose: string }>(dto.token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }

    if (payload.purpose !== 'password-reset') {
      throw new BadRequestException('Invalid token purpose');
    }

    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new BadRequestException('Invalid or expired token');
    if (user.passwordResetToken !== tokenHash) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash, passwordResetToken: null, passwordResetExpires: null },
    });

    return { message: 'Password reset successfully' };
  }

  async googleLogin(googleUser: {
    email: string;
    name: string;
    profileImageUrl?: string;
  }) {
    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          profileImageUrl: googleUser.profileImageUrl,
          passwordHash: '',
          authProvider: 'GOOGLE',
          emailVerifiedAt: new Date(),
        },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.email, !!user.emailVerifiedAt);
  }
}
