import * as FileSystem from 'expo-file-system';
import AWS from 'aws-sdk';
import { decode as base64decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CF_ACCOUNT_ID,
  CF_ACCESS_KEY_ID,
  CF_SECRET_ACCESS_KEY,
  CF_BUCKET
} from '@env';

interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  bucket: string;
}

export interface UploadTask {
  uri: string;
  userId: string;
  type: 'video' | 'thumbnail';
  priority?: number; // Higher number = higher priority
  onProgress?: (progress: number) => void;
  onComplete?: (url: string) => void;
  onError?: (error: Error) => void;
}

interface StoredUploadTask {
  uri: string;
  userId: string;
  type: 'video' | 'thumbnail';
  priority?: number;
  createdAt: number;
}

export class StorageService {
  private static instance: StorageService;
  private s3: AWS.S3;
  private bucket: string;
  private endpoint: string;
  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 2000; // 2 seconds
  private static readonly MAX_CONCURRENT_UPLOADS = 3;
  private static readonly QUEUE_STORAGE_KEY = '@storage_queue';
  private static readonly MAX_QUEUE_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly DEFAULT_PRIORITY = 1;
  private static readonly HIGH_PRIORITY = 2;
  private static readonly URGENT_PRIORITY = 3;

  // Keep track of active uploads for cancellation
  private activeUploads: Map<string, AWS.Request<AWS.S3.PutObjectOutput, AWS.AWSError>> = new Map();
  
  // Upload queue management
  private uploadQueue: UploadTask[] = [];
  private activeUploadCount = 0;
  private isProcessingQueue = false;
  private isPaused = false;
  private pausedTasks: UploadTask[] = [];

  private constructor() {
    const accountId = CF_ACCOUNT_ID;
    
    // Validate account ID
    if (!accountId) {
      throw new Error('Missing Cloudflare Account ID');
    }

    this.endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    this.bucket = CF_BUCKET;

    // Configure AWS SDK for R2
    this.s3 = new AWS.S3({
      endpoint: this.endpoint,
      accessKeyId: CF_ACCESS_KEY_ID,
      secretAccessKey: CF_SECRET_ACCESS_KEY,
      signatureVersion: 'v4',
      region: 'auto',
      s3ForcePathStyle: true, // Required for R2
    });

    // Validate configuration
    if (!this.bucket) {
      throw new Error('Missing R2 bucket name');
    }

    if (!CF_ACCESS_KEY_ID || !CF_SECRET_ACCESS_KEY) {
      throw new Error('Missing R2 API token credentials. Please generate them from Cloudflare Dashboard -> R2 -> Manage R2 API tokens');
    }

    // Debug logging (safe version without credentials)
    console.log('R2 Storage Service initialized:', {
      endpoint: this.endpoint,
      bucket: this.bucket,
      region: 'auto',
      accessKeyLength: CF_ACCESS_KEY_ID?.length || 0,
      secretKeyLength: CF_SECRET_ACCESS_KEY?.length || 0,
      accessKeyStart: CF_ACCESS_KEY_ID?.substring(0, 4) || ''
    });

    // Load persisted queue
    this.loadQueue();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private generateKey(userId: string, type: string): string {
    const safeUserId = userId || 'anonymous';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${type}/${safeUserId}/${timestamp}_${random}.${type === 'videos' ? 'mp4' : 'jpg'}`;
  }

  private async retry<T>(
    operation: () => Promise<T>,
    retries: number = StorageService.MAX_RETRIES,
    delay: number = StorageService.RETRY_DELAY
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (retries > 0) {
        console.log(`Retrying operation, ${retries} attempts remaining`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retry(operation, retries - 1, delay * 1.5); // Exponential backoff
      }
      throw error;
    }
  }

  cancelUpload(key: string): void {
    const upload = this.activeUploads.get(key);
    if (upload) {
      upload.abort();
      this.activeUploads.delete(key);
      console.log('Upload cancelled:', { key });
    }
  }

  async uploadVideo(
    uri: string, 
    userId: string = 'anonymous',
    onProgress?: (progress: number) => void
  ): Promise<string> {
    let key: string | null = null;
    try {
      key = this.generateKey(userId, 'videos');
      
      console.log('Starting video upload:', {
        key,
        type: 'video/mp4',
        endpoint: this.endpoint,
        bucket: this.bucket
      });

      // Read the file and validate size
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      if (fileInfo.size > StorageService.MAX_FILE_SIZE) {
        throw new Error(`File size exceeds limit of ${StorageService.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      // Convert file to ArrayBuffer
      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const arrayBuffer = base64decode(fileContent);

      // Upload to R2 with progress tracking and retry
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: arrayBuffer,
        ContentType: 'video/mp4',
        ACL: 'public-read',
        CacheControl: 'max-age=31536000',
        ContentDisposition: `inline; filename="${key}"`,
        Metadata: {
          userId,
          uploadedAt: new Date().toISOString(),
          originalSize: fileInfo.size.toString()
        }
      };

      // Track upload progress
      let uploadedBytes = 0;
      const totalBytes = arrayBuffer.byteLength;

      const result = await this.retry(async () => {
        const upload = this.s3.putObject(params);
        
        // Store the upload request for potential cancellation
        this.activeUploads.set(key!, upload);

        upload.on('httpUploadProgress', (progress) => {
          uploadedBytes = progress.loaded || 0;
          const progressPercent = (uploadedBytes / totalBytes) * 100;
          onProgress?.(progressPercent);
          
          console.log('Upload progress:', {
            key,
            progress: `${Math.round(progressPercent)}%`,
            loaded: uploadedBytes,
            total: totalBytes
          });
        });

        try {
          const result = await upload.promise();
          this.activeUploads.delete(key!);
          return result;
        } catch (error) {
          this.activeUploads.delete(key!);
          throw error;
        }
      });

      console.log('Video upload successful:', {
        key,
        url: `${this.endpoint}/${key}`,
        etag: result.ETag,
        size: fileInfo.size
      });

      return `${this.endpoint}/${key}`;
    } catch (error: any) {
      if (key) {
        this.activeUploads.delete(key);
      }
      console.error('Error in uploadVideo:', {
        error: error.message,
        stack: error.stack,
        uri: uri.substring(0, 50) + '...',
        key
      });
      throw error;
    }
  }

  async uploadThumbnail(
    uri: string,
    userId: string = 'anonymous'
  ): Promise<string> {
    let key: string | null = null;
    try {
      key = this.generateKey(userId, 'thumbnails');
      
      console.log('Starting thumbnail upload:', {
        key,
        type: 'image/jpeg',
        endpoint: this.endpoint,
        bucket: this.bucket
      });

      // Read the file and validate size
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }

      if (fileInfo.size > StorageService.MAX_THUMBNAIL_SIZE) {
        throw new Error(`Thumbnail size exceeds limit of ${StorageService.MAX_THUMBNAIL_SIZE / 1024 / 1024}MB`);
      }

      // Convert file to ArrayBuffer
      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });
      const arrayBuffer = base64decode(fileContent);

      // Upload to R2 with retry
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: arrayBuffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read',
        CacheControl: 'max-age=31536000',
        ContentDisposition: `inline; filename="${key}"`,
        Metadata: {
          userId,
          uploadedAt: new Date().toISOString(),
          originalSize: fileInfo.size.toString()
        }
      };

      const result = await this.retry(async () => {
        const upload = this.s3.putObject(params);
        
        // Store the upload request for potential cancellation
        this.activeUploads.set(key!, upload);

        try {
          const result = await upload.promise();
          this.activeUploads.delete(key!);
          return result;
        } catch (error) {
          this.activeUploads.delete(key!);
          throw error;
        }
      });

      console.log('Thumbnail upload successful:', {
        key,
        url: `${this.endpoint}/${key}`,
        etag: result.ETag,
        size: fileInfo.size
      });

      return `${this.endpoint}/${key}`;
    } catch (error: any) {
      if (key) {
        this.activeUploads.delete(key);
      }
      console.error('Error in uploadThumbnail:', {
        error: error.message,
        stack: error.stack,
        uri: uri.substring(0, 50) + '...',
        key
      });
      throw error;
    }
  }

  async deleteVideo(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({
        Bucket: this.bucket,
        Key: key
      }).promise();
      
      console.log('Video deleted successfully:', { key });
    } catch (error: any) {
      console.error('Error deleting video:', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  async deleteThumbnail(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({
        Bucket: this.bucket,
        Key: key
      }).promise();
      
      console.log('Thumbnail deleted successfully:', { key });
    } catch (error: any) {
      console.error('Error deleting thumbnail:', {
        error: error.message,
        key
      });
      throw error;
    }
  }

  pauseQueue(): void {
    if (!this.isPaused) {
      this.isPaused = true;
      console.log('Upload queue paused:', {
        activeUploads: this.activeUploadCount,
        queuedTasks: this.uploadQueue.length
      });
    }
  }

  resumeQueue(): void {
    if (this.isPaused) {
      this.isPaused = false;
      console.log('Upload queue resumed:', {
        activeUploads: this.activeUploadCount,
        queuedTasks: this.uploadQueue.length
      });
      
      // Resume processing if there are tasks and capacity
      if (this.uploadQueue.length > 0 && this.activeUploadCount < StorageService.MAX_CONCURRENT_UPLOADS) {
        this.processQueue();
      }
    }
  }

  private sortQueue(): void {
    this.uploadQueue.sort((a, b) => {
      // Sort by priority (higher first)
      const priorityA = a.priority || StorageService.DEFAULT_PRIORITY;
      const priorityB = b.priority || StorageService.DEFAULT_PRIORITY;
      return priorityB - priorityA;
    });
  }

  queueUpload(task: UploadTask): void {
    // Set default priority if not specified
    if (!task.priority) {
      task.priority = StorageService.DEFAULT_PRIORITY;
    }

    this.uploadQueue.push(task);
    this.sortQueue(); // Sort queue after adding new task
    
    console.log('Task added to upload queue:', {
      type: task.type,
      userId: task.userId,
      priority: task.priority,
      queueLength: this.uploadQueue.length
    });

    // Persist queue after adding task
    this.persistQueue();

    // Start processing if not paused and not already running
    if (!this.isPaused && !this.isProcessingQueue && this.activeUploadCount < StorageService.MAX_CONCURRENT_UPLOADS) {
      this.processQueue();
    }
  }

  setPriority(taskIndex: number, priority: number): void {
    if (taskIndex >= 0 && taskIndex < this.uploadQueue.length) {
      this.uploadQueue[taskIndex].priority = priority;
      this.sortQueue();
      this.persistQueue();
      
      console.log('Task priority updated:', {
        taskIndex,
        newPriority: priority,
        queueLength: this.uploadQueue.length
      });
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.isPaused) return;
    this.isProcessingQueue = true;

    try {
      while (this.uploadQueue.length > 0 && this.activeUploadCount < StorageService.MAX_CONCURRENT_UPLOADS && !this.isPaused) {
        const task = this.uploadQueue.shift();
        if (!task) continue;

        this.activeUploadCount++;
        
        try {
          const url = await this.processUploadTask(task);
          task.onComplete?.(url);
          // Update persisted queue after successful upload
          this.persistQueue();
        } catch (error: any) {
          console.error('Upload task failed:', {
            type: task.type,
            userId: task.userId,
            priority: task.priority,
            error: error.message
          });
          task.onError?.(error);
        } finally {
          this.activeUploadCount--;
        }
      }
    } finally {
      this.isProcessingQueue = false;
      
      // If there are more items and we're not paused, continue processing
      if (this.uploadQueue.length > 0 && !this.isPaused && this.activeUploadCount < StorageService.MAX_CONCURRENT_UPLOADS) {
        this.processQueue();
      }
    }
  }

  private async processUploadTask(task: UploadTask): Promise<string> {
    if (task.type === 'video') {
      return this.uploadVideo(task.uri, task.userId, task.onProgress);
    } else {
      return this.uploadThumbnail(task.uri, task.userId);
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const storedQueue = await AsyncStorage.getItem(StorageService.QUEUE_STORAGE_KEY);
      if (storedQueue) {
        const tasks: StoredUploadTask[] = JSON.parse(storedQueue);
        
        // Filter out expired tasks and validate files still exist
        const now = Date.now();
        const validTasks: UploadTask[] = [];

        for (const task of tasks) {
          // Skip expired tasks
          if (now - task.createdAt > StorageService.MAX_QUEUE_AGE) {
            continue;
          }

          // Verify file still exists
          const fileInfo = await FileSystem.getInfoAsync(task.uri);
          if (!fileInfo.exists) {
            continue;
          }

          // Convert stored task to upload task
          validTasks.push({
            uri: task.uri,
            userId: task.userId,
            type: task.type,
            priority: task.priority || StorageService.DEFAULT_PRIORITY,
            onError: (error) => {
              console.error('Restored task failed:', {
                type: task.type,
                error: error.message
              });
            }
          });
        }

        // Sort tasks by priority before adding to queue
        validTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        // Add valid tasks to queue
        if (validTasks.length > 0) {
          console.log('Restored upload queue:', {
            totalTasks: tasks.length,
            validTasks: validTasks.length
          });
          await this.uploadBatch(validTasks);
        }
      }
    } catch (error) {
      console.error('Error loading persisted queue:', error);
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      const tasks: StoredUploadTask[] = this.uploadQueue.map(task => ({
        uri: task.uri,
        userId: task.userId,
        type: task.type,
        priority: task.priority,
        createdAt: Date.now()
      }));

      await AsyncStorage.setItem(StorageService.QUEUE_STORAGE_KEY, JSON.stringify(tasks));
      
      console.log('Queue persisted:', {
        taskCount: tasks.length
      });
    } catch (error) {
      console.error('Error persisting queue:', error);
    }
  }

  async uploadBatch(tasks: UploadTask[]): Promise<void> {
    console.log('Starting batch upload:', {
      taskCount: tasks.length,
      types: tasks.map(t => t.type)
    });

    // Add all tasks to queue
    tasks.forEach(task => this.queueUpload(task));
  }

  clearQueue(): void {
    console.log('Clearing upload queue:', {
      remainingTasks: this.uploadQueue.length
    });
    
    this.uploadQueue = [];
    // Clear persisted queue
    AsyncStorage.removeItem(StorageService.QUEUE_STORAGE_KEY);
  }

  getQueueStatus(): {queueLength: number; activeUploads: number; isPaused: boolean} {
    return {
      queueLength: this.uploadQueue.length,
      activeUploads: this.activeUploadCount,
      isPaused: this.isPaused
    };
  }
} 