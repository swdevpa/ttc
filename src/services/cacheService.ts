import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import crypto from 'crypto-js';

const CACHE_FOLDER = `${FileSystem.cacheDirectory}videos/`;
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheInfo {
  uri: string;
  size: number;
  timestamp: number;
}

export class CacheService {
  private static instance: CacheService;
  private cacheMap: Map<string, CacheInfo>;
  private initialized: boolean = false;

  private constructor() {
    this.cacheMap = new Map();
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private async ensureInitialized() {
    if (this.initialized) return;

    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_FOLDER);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
      }

      // Load existing cache info
      const files = await FileSystem.readDirectoryAsync(CACHE_FOLDER);
      for (const file of files) {
        const path = `${CACHE_FOLDER}${file}`;
        const info = await FileSystem.getInfoAsync(path, { size: true });
        if (info.exists) {
          const uri = await this.readMetadata(path);
          if (uri) {
            this.cacheMap.set(uri, {
              uri,
              size: info.size || 0,
              timestamp: info.modificationTime || Date.now(),
            });
          }
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  }

  private async readMetadata(path: string): Promise<string | null> {
    try {
      const metadataPath = `${path}.meta`;
      const exists = await FileSystem.getInfoAsync(metadataPath);
      if (exists.exists) {
        const content = await FileSystem.readAsStringAsync(metadataPath);
        return content;
      }
      return null;
    } catch (error) {
      console.error('Failed to read metadata:', error);
      return null;
    }
  }

  private async writeMetadata(path: string, uri: string) {
    try {
      await FileSystem.writeAsStringAsync(`${path}.meta`, uri);
    } catch (error) {
      console.error('Failed to write metadata:', error);
    }
  }

  private getCacheKey(uri: string): string {
    return crypto.MD5(uri).toString();
  }

  async getCachedUri(uri: string): Promise<string> {
    await this.ensureInitialized();
    const cacheKey = this.getCacheKey(uri);
    const cachePath = `${CACHE_FOLDER}${cacheKey}`;

    const cacheInfo = await FileSystem.getInfoAsync(cachePath);
    if (cacheInfo.exists) {
      const cacheData = this.cacheMap.get(uri);
      if (cacheData && Date.now() - cacheData.timestamp <= MAX_CACHE_AGE) {
        return cachePath;
      }
      // Cache expired, delete it
      await this.clearCache(uri);
    }

    // Cache miss or expired, download the file
    try {
      const downloadResult = await FileSystem.downloadAsync(uri, cachePath);
      if (downloadResult.status === 200) {
        const fileInfo = await FileSystem.getInfoAsync(cachePath, { size: true });
        this.cacheMap.set(uri, {
          uri,
          size: fileInfo.size || 0,
          timestamp: Date.now(),
        });
        await this.writeMetadata(cachePath, uri);
        await this.ensureCacheSizeLimit();
        return cachePath;
      }
    } catch (error) {
      console.error('Failed to cache video:', error);
    }

    // Return original URI if caching failed
    return uri;
  }

  private async ensureCacheSizeLimit() {
    let totalSize = 0;
    const cacheItems = Array.from(this.cacheMap.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const item of cacheItems) {
      totalSize += item.size;
    }

    while (totalSize > MAX_CACHE_SIZE && cacheItems.length > 0) {
      const oldestItem = cacheItems.pop();
      if (oldestItem) {
        await this.clearCache(oldestItem.uri);
        totalSize -= oldestItem.size;
      }
    }
  }

  async clearCache(uri: string) {
    const cacheKey = this.getCacheKey(uri);
    const cachePath = `${CACHE_FOLDER}${cacheKey}`;
    try {
      await FileSystem.deleteAsync(cachePath, { idempotent: true });
      await FileSystem.deleteAsync(`${cachePath}.meta`, { idempotent: true });
      this.cacheMap.delete(uri);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  async clearAllCache() {
    try {
      await FileSystem.deleteAsync(CACHE_FOLDER, { idempotent: true });
      await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
      this.cacheMap.clear();
    } catch (error) {
      console.error('Failed to clear all cache:', error);
    }
  }
} 