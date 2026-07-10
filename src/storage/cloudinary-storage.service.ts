import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { MediaType } from '@prisma/client';

export interface CreateCloudinaryUploadInput {
  userId: string;
  type: MediaType;
  filename: string;
  projectId?: string;
  fileSizeBytes?: number;
}

export interface CloudinaryUploadParams {
  uploadUrl: string;
  method: 'POST';
  fileFieldName: 'file';
  fields: Record<string, string>;
  publicId: string;
  folder: string;
  resourceType: string;
  provider: 'cloudinary';
  sourceUrl: string;
  thumbnailUrl?: string;
  metadata: Record<string, unknown>;
}

export interface CloudinaryUploadedFile {
  publicId: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
}

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

@Injectable()
export class CloudinaryStorageService {
  private readonly config?: CloudinaryConfig;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    const isMissing =
      !cloudName ||
      !apiKey ||
      !apiSecret ||
      cloudName === 'undefined' ||
      apiKey === 'undefined' ||
      apiSecret === 'undefined';

    if (isMissing) {
      throw new BadRequestException(
        'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET as environment variables.',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    this.config = { cloudName, apiKey, apiSecret };
  }

  createUpload(input: CreateCloudinaryUploadInput): CloudinaryUploadParams {
    const config = this.requireConfig();
    const resourceType = this.toResourceType(input.type);
    const folder = this.buildFolder(input.userId, input.projectId, input.type);
    const publicId = this.buildPublicId(input.filename);
    const timestamp = Math.floor(Date.now() / 1000);

    // Only params that are part of the signature (exclude api_key and file)
    const signParams: Record<string, string> = {
      folder,
      overwrite: 'false',
      public_id: publicId,
      tags: `scenix,user_${this.safeTagValue(input.userId)}`,
      timestamp: String(timestamp),
      unique_filename: 'false',
    };
    const signature = cloudinary.utils.api_sign_request(
      signParams,
      config.apiSecret,
    );
    const sourceUrl = cloudinary.url(publicId, {
      cloud_name: config.cloudName,
      resource_type: resourceType,
      secure: true,
    });

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
      method: 'POST',
      fileFieldName: 'file',
      fields: {
        ...signParams,
        api_key: config.apiKey,
        signature,
      },
      publicId,
      folder,
      resourceType,
      provider: 'cloudinary',
      sourceUrl,
      thumbnailUrl:
        input.type === MediaType.VIDEO
          ? cloudinary.url(publicId, {
              cloud_name: config.cloudName,
              resource_type: 'video',
              secure: true,
              transformation: [
                { start_offset: 'auto' },
                { width: 480, crop: 'scale' },
              ],
            })
          : undefined,
      metadata: {
        cloudinary: {
          cloudName: config.cloudName,
          folder,
          publicId,
          resourceType,
          fileSizeBytes: input.fileSizeBytes,
        },
      },
    };
  }

  async uploadFile(
    filePath: string,
    input: CreateCloudinaryUploadInput,
  ): Promise<CloudinaryUploadedFile> {
    const resourceType = this.toResourceType(input.type);
    const folder = this.buildFolder(input.userId, input.projectId, input.type);
    const publicId = this.buildPublicId(input.filename);
    const options: UploadApiOptions = {
      resource_type: resourceType,
      folder,
      public_id: publicId,
      tags: `scenix,user_${this.safeTagValue(input.userId)}`,
      context: this.buildContext(input.userId, input.projectId),
      overwrite: false,
      unique_filename: false,
    };
    const result = await cloudinary.uploader.upload(filePath, options);

    return this.toUploadedFile(result);
  }

  async deleteFile(publicId: string, type: MediaType) {
    const result = (await cloudinary.uploader.destroy(publicId, {
      resource_type: this.toResourceType(type),
      invalidate: true,
    })) as { result?: string } | undefined;
    const status = result?.result;

    if (status && !['ok', 'not found'].includes(status)) {
      throw new Error(`Cloudinary delete failed: ${status}`);
    }
  }

  getSourceUrl(publicId: string, type: MediaType) {
    const config = this.requireConfig();

    return cloudinary.url(publicId, {
      cloud_name: config.cloudName,
      resource_type: this.toResourceType(type),
      secure: true,
    });
  }

  private requireConfig(): CloudinaryConfig {
    if (!this.config) {
      throw new BadRequestException(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }

    return this.config;
  }

  private toUploadedFile(result: UploadApiResponse): CloudinaryUploadedFile {
    const duration = (result as UploadApiResponse & { duration?: number })
      .duration;

    return {
      publicId: result.public_id,
      sourceUrl: result.secure_url,
      thumbnailUrl:
        result.resource_type === 'video'
          ? cloudinary.url(result.public_id, {
              resource_type: 'video',
              secure: true,
              transformation: [
                { start_offset: 'auto' },
                { width: 480, crop: 'scale' },
              ],
            })
          : undefined,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      duration,
    };
  }

  private buildFolder(
    userId: string,
    projectId: string | undefined,
    type: string,
  ) {
    const projectPath = projectId ? `projects/${projectId}` : 'unassigned';

    return [
      'scenix',
      'media',
      projectPath,
      `users/${userId}`,
      type.toLowerCase(),
    ].join('/');
  }

  private buildPublicId(filename: string) {
    const safeFilename = this.safeFilename(filename).replace(/\.[^.]+$/, '');

    return `${Date.now()}-${randomBytes(8).toString('hex')}-${safeFilename}`;
  }

  private buildContext(userId: string, projectId?: string) {
    return `user_id=${userId}|project_id=${projectId ?? 'none'}`;
  }

  private safeFilename(filename: string) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'media';
  }

  private safeTagValue(value: string) {
    return value.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32) || 'user';
  }

  private toResourceType(type: MediaType): 'video' | 'image' | 'raw' {
    if (type === MediaType.VIDEO) return 'video';
    if (type === MediaType.IMAGE) return 'image';
    return 'raw';
  }
}
