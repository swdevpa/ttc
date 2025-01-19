import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';
import ImageEditor from '@react-native-community/image-editor';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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

// Define a custom type that includes size
type VideoFileInfo = {
  exists: true;
  uri: string;
  size: number;
  isDirectory: boolean;
  modificationTime: number;
  md5?: string;
};

export class VideoProcessor {
  private static instance: VideoProcessor;
  private processingQueue: Map<string, boolean>;
  private readonly MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

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
      // Generate thumbnail
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 0,
        quality: 0.7,
      });

      // Compress thumbnail
      const compressedThumbnail = await manipulateAsync(
        uri,
        [{ resize: { width: 540 } }], // 540p is good for thumbnails
        { compress: 0.7, format: SaveFormat.JPEG }
      );

      return compressedThumbnail.uri;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      throw new Error('Failed to generate video thumbnail');
    }
  }

  private async getVideoMetadata(uri: string): Promise<VideoFileInfo> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists || !('size' in fileInfo)) {
        throw new Error('Invalid video file or size information not available');
      }
      return fileInfo as VideoFileInfo;
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
      // Create output file path
      const timestamp = Date.now();
      const outputUri = `${FileSystem.cacheDirectory}compressed_${timestamp}.mp4`;
      
      // Start with reading the file in chunks
      const chunkSize = 1024 * 1024; // 1MB chunks
      const fileInfo = await this.getVideoMetadata(uri);
      const totalChunks = Math.ceil(fileInfo.size / chunkSize);
      
      // Process chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileInfo.size);
        
        // Read chunk
        const chunk = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
          position: start,
          length: end - start
        });
        
        // Write chunk (append mode)
        await FileSystem.writeAsStringAsync(outputUri, chunk, {
          encoding: FileSystem.EncodingType.Base64
        });
        
        // Report progress
        const progress = (i + 1) / totalChunks;
        onProgress?.(progress * 100);
      }

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
      onProgress?.(10);

      // Check if video needs compression
      const needsCompression = metadata.size > this.MAX_VIDEO_SIZE;

      // Generate thumbnail
      const thumbnailUri = await this.generateThumbnail(videoUri);
      onProgress?.(30);

      let processedUri: string;
      if (needsCompression) {
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
        processedUri = await this.copyToCache(compressedUri, 'mp4');
        
        // Cleanup temporary compressed file
        await FileSystem.deleteAsync(compressedUri, { idempotent: true });
      } else {
        // If no compression needed, just copy to cache
        processedUri = await this.copyToCache(videoUri, 'mp4');
      }
      
      onProgress?.(95);

      // Get final metadata
      const finalMetadata = await this.getVideoMetadata(processedUri);
      onProgress?.(100);

      this.processingQueue.delete(processId);

      return {
        uri: processedUri,
        thumbnailUri,
        duration: 0, // TODO: Implement actual duration extraction
        size: finalMetadata.size,
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