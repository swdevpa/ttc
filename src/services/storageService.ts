import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as FileSystem from 'expo-file-system';

interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

export class StorageService {
  private static instance: StorageService;
  private s3Client: S3Client;
  private bucket: string;

  private constructor() {
    // Initialize with Hetzner Object Storage credentials
    const config: StorageConfig = {
      endpoint: process.env.STORAGE_ENDPOINT || 'https://s3.eu-central-1.hetzner.com',
      accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
      region: 'eu-central-1',
      bucket: process.env.STORAGE_BUCKET || 'ttc-videos'
    };

    this.s3Client = new S3Client({
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      region: config.region,
      forcePathStyle: true // Required for Hetzner Object Storage
    });

    this.bucket = config.bucket;
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private generateKey(userId: string, type: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${userId}/${type}/${timestamp}_${random}`;
  }

  async uploadVideo(
    uri: string, 
    userId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const key = this.generateKey(userId, 'videos');
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      const file = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(file, 'base64'),
        ContentType: 'video/mp4'
      });

      await this.s3Client.send(command);
      
      // Generate a signed URL that expires in 1 hour
      const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 3600
      });

      return signedUrl;
    } catch (error) {
      console.error('Error uploading to storage:', error);
      throw new Error('Failed to upload video to storage');
    }
  }

  async uploadThumbnail(
    uri: string,
    userId: string
  ): Promise<string> {
    try {
      const key = this.generateKey(userId, 'thumbnails');
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      const file = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(file, 'base64'),
        ContentType: 'image/jpeg'
      });

      await this.s3Client.send(command);
      
      // Generate a signed URL that expires in 1 hour
      const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 3600
      });

      return signedUrl;
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      throw new Error('Failed to upload thumbnail');
    }
  }

  async deleteVideo(key: string): Promise<void> {
    // TODO: Implement video deletion
  }

  async deleteThumbnail(key: string): Promise<void> {
    // TODO: Implement thumbnail deletion
  }
} 