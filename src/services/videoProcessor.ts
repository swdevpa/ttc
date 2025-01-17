import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video } from 'expo-av';
import { Platform } from 'react-native';

interface ProcessedVideo {
  uri: string;
  thumbnailUri: string;
  duration: number;
  size: number;
}

interface CompressionConfig {
  quality: number; // 0.1 to 1.0
  bitrate?: number; // bits per second
  width?: number;
  height?: number;
}

export class VideoProcessor {
  private static instance: VideoProcessor;
  private processingQueue: Map<string, boolean>;

  private constructor() {
    this.processingQueue = new Map();
  }

  static getInstance(): VideoProcessor {
    if (!VideoProcessor.instance) {
      VideoProcessor.instance = new VideoProcessor();
    }
    return VideoProcessor.instance;
  }

  private getCompressionConfig(fileSize: number): CompressionConfig {
    // Base configuration for different file sizes
    if (fileSize > 100 * 1024 * 1024) { // > 100MB
      return {
        quality: 0.5,
        bitrate: 1500000, // 1.5 Mbps
        width: 720,
        height: 1280
      };
    } else if (fileSize > 50 * 1024 * 1024) { // > 50MB
      return {
        quality: 0.6,
        bitrate: 2000000, // 2 Mbps
        width: 1080,
        height: 1920
      };
    } else {
      return {
        quality: 0.8,
        bitrate: 3000000, // 3 Mbps
      };
    }
  }

  private async generateThumbnail(videoUri: string): Promise<string> {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 0,
        quality: 0.7,
      });
      return uri;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      throw new Error('Failed to generate video thumbnail');
    }
  }

  private async getVideoMetadata(uri: string) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      return fileInfo;
    } catch (error) {
      console.error('Error getting video metadata:', error);
      throw new Error('Failed to get video metadata');
    }
  }

  private async compressVideo(
    uri: string, 
    config: CompressionConfig,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const video = new Video.createAsync(
        { uri },
        { shouldPlay: false, isLooping: false },
        false
      );

      // Create output file path
      const timestamp = Date.now();
      const outputUri = `${FileSystem.cacheDirectory}compressed_${timestamp}.mp4`;

      // Load video and get status
      const status = await video.loadAsync({ uri }, {}, false);
      
      if (!status.isLoaded || status.error) {
        throw new Error('Failed to load video for compression');
      }

      // Set compression options
      const options = {
        quality: config.quality,
        bitrate: config.bitrate,
        width: config.width,
        height: config.height,
        codec: 'h264',
        outputPath: outputUri,
      };

      // Compress video
      await video.compressAsync(options, (progress) => {
        onProgress?.(progress * 100);
      });

      return outputUri;
    } catch (error) {
      console.error('Error compressing video:', error);
      throw new Error('Failed to compress video');
    }
  }

  private async copyToCache(uri: string, type: string): Promise<string> {
    const timestamp = Date.now();
    const extension = uri.split('.').pop() || type;
    const fileName = `processed_${timestamp}.${extension}`;
    const cacheUri = `${FileSystem.cacheDirectory}processed/${fileName}`;

    try {
      await FileSystem.makeDirectoryAsync(`${FileSystem.cacheDirectory}processed/`, {
        intermediates: true
      });

      await FileSystem.copyAsync({
        from: uri,
        to: cacheUri
      });

      return cacheUri;
    } catch (error) {
      console.error('Error copying to cache:', error);
      throw new Error('Failed to copy file to cache');
    }
  }

  async processVideo(
    videoUri: string,
    onProgress?: (progress: number) => void
  ): Promise<ProcessedVideo> {
    const processId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.processingQueue.has(processId)) {
      throw new Error('Video is already being processed');
    }

    this.processingQueue.set(processId, true);
    onProgress?.(0);

    try {
      // Get video metadata
      const metadata = await this.getVideoMetadata(videoUri);
      if (!metadata.exists || !metadata.size) {
        throw new Error('Invalid video file');
      }
      onProgress?.(10);

      // Generate thumbnail
      const thumbnailUri = await this.generateThumbnail(videoUri);
      onProgress?.(30);

      // Compress video based on size
      const compressionConfig = this.getCompressionConfig(metadata.size);
      const compressedUri = await this.compressVideo(
        videoUri,
        compressionConfig,
        (compressProgress) => {
          onProgress?.(30 + (compressProgress * 0.6)); // 30% to 90%
        }
      );
      
      // Copy to cache
      const processedUri = await this.copyToCache(compressedUri, 'mp4');
      onProgress?.(95);

      // Get final metadata
      const finalMetadata = await this.getVideoMetadata(processedUri);
      onProgress?.(100);

      // Cleanup temporary compressed file
      await FileSystem.deleteAsync(compressedUri, { idempotent: true });

      this.processingQueue.delete(processId);

      return {
        uri: processedUri,
        thumbnailUri,
        duration: 0, // TODO: Implement actual duration extraction
        size: finalMetadata.size || 0,
      };
    } catch (error) {
      this.processingQueue.delete(processId);
      throw error;
    }
  }

  async cleanup() {
    try {
      const cacheDir = `${FileSystem.cacheDirectory}processed/`;
      await FileSystem.deleteAsync(cacheDir, { idempotent: true });
    } catch (error) {
      console.error('Error cleaning up processed videos:', error);
    }
  }
} 