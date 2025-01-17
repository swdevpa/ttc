import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { VideoProcessor } from './videoProcessor';
import { StorageService } from './storageService';

interface UploadProgress {
  totalBytes: number;
  bytesWritten: number;
  percent: number;
}

interface VideoMetadata {
  uri: string;
  type: 'library' | 'camera';
  caption: string;
  categories: string[];
  userId: string;
}

export class UploadService {
  private static instance: UploadService;
  private uploadQueue: Map<string, { 
    status: 'pending' | 'processing' | 'uploading' | 'completed' | 'failed',
    progress: number,
    error?: string
  }>;
  private videoProcessor: VideoProcessor;
  private storageService: StorageService;

  private constructor() {
    this.uploadQueue = new Map();
    this.videoProcessor = VideoProcessor.getInstance();
    this.storageService = StorageService.getInstance();
  }

  static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService();
    }
    return UploadService.instance;
  }

  private async getVideoInfo(uri: string) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      return fileInfo;
    } catch (error) {
      console.error('Error getting video info:', error);
      throw new Error('Failed to get video information');
    }
  }

  async uploadVideo(
    metadata: VideoMetadata,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const uploadId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.uploadQueue.set(uploadId, { status: 'pending', progress: 0 });

    try {
      // Process video first (30% of total progress)
      this.uploadQueue.set(uploadId, { status: 'processing', progress: 0 });
      const processedVideo = await this.videoProcessor.processVideo(
        metadata.uri,
        (processProgress) => {
          const progress = processProgress * 0.3;
          this.uploadQueue.set(uploadId, { 
            status: 'processing', 
            progress: progress
          });
          onProgress?.(progress);
        }
      );

      // Upload thumbnail (20% of total progress)
      const thumbnailProgress = await this.storageService.uploadThumbnail(
        processedVideo.thumbnailUri,
        metadata.userId
      );
      this.uploadQueue.set(uploadId, { 
        status: 'uploading', 
        progress: 50
      });
      onProgress?.(50);

      // Upload processed video (50% of total progress)
      const videoUrl = await this.storageService.uploadVideo(
        processedVideo.uri,
        metadata.userId,
        (uploadProgress) => {
          const progress = 50 + (uploadProgress * 0.5);
          this.uploadQueue.set(uploadId, { 
            status: 'uploading', 
            progress: progress
          });
          onProgress?.(progress);
        }
      );

      // Clean up local files
      await FileSystem.deleteAsync(processedVideo.uri, { idempotent: true });
      await FileSystem.deleteAsync(processedVideo.thumbnailUri, { idempotent: true });
      
      this.uploadQueue.set(uploadId, { status: 'completed', progress: 100 });
    } catch (error) {
      console.error('Upload failed:', error);
      this.uploadQueue.set(uploadId, { 
        status: 'failed', 
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  getUploadStatus(uploadId: string) {
    return this.uploadQueue.get(uploadId);
  }

  clearUploadStatus(uploadId: string) {
    this.uploadQueue.delete(uploadId);
  }
} 