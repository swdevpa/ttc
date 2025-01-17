import { Video } from '../types/video';

// Simulating a backend API response delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// More mock videos for testing pagination
const ALL_VIDEOS: Video[] = [
  {
    id: '1',
    uri: 'https://assets.mixkit.co/active_storage/video_items/100630/1730327585/100630-video-720.mp4',
    caption: 'Beautiful nature views! 🌸',
    username: 'nature_lover',
    likes: 1234,
    comments: 123,
    category: 'nature',
    isPopular: true,
  },
  {
    id: '2',
    uri: 'https://assets.mixkit.co/active_storage/video_items/100134/1720822792/100134-video-720.mp4',
    caption: 'Just chatting with friends 😊',
    username: 'social_butterfly',
    likes: 2345,
    comments: 234,
    category: 'lifestyle',
    isPopular: false,
  },
  {
    id: '3',
    uri: 'https://assets.mixkit.co/active_storage/video_items/100250/1722542271/100250-video-720.mp4',
    caption: 'Ocean vibes 🌊',
    username: 'beach_life',
    likes: 3456,
    comments: 345,
    category: 'nature',
    isPopular: true,
  },
  // Add more mock videos here...
];

interface FetchVideosOptions {
  page: number;
  pageSize: number;
  userPreferences?: string[];
}

export class VideoService {
  private static instance: VideoService;
  private userPreferences: string[] = ['nature', 'lifestyle']; // Mock user preferences

  private constructor() {}

  static getInstance(): VideoService {
    if (!VideoService.instance) {
      VideoService.instance = new VideoService();
    }
    return VideoService.instance;
  }

  async fetchVideos({ page, pageSize, userPreferences = this.userPreferences }: FetchVideosOptions): Promise<{
    videos: Video[];
    hasMore: boolean;
  }> {
    // Simulate API delay
    await delay(800);

    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    // Apply the 50/50 algorithm
    const popularVideos = ALL_VIDEOS.filter(video => video.isPopular);
    const preferredVideos = ALL_VIDEOS.filter(
      video => !video.isPopular && userPreferences.includes(video.category)
    );

    // Combine videos according to the 50/50 rule
    const halfPageSize = Math.ceil(pageSize / 2);
    const selectedPopular = popularVideos.slice(start, start + halfPageSize);
    const selectedPreferred = preferredVideos.slice(start, start + halfPageSize);

    const combinedVideos = [...selectedPopular, ...selectedPreferred].sort(
      () => Math.random() - 0.5
    );

    return {
      videos: combinedVideos.slice(0, pageSize),
      hasMore: end < ALL_VIDEOS.length,
    };
  }

  updateUserPreferences(categories: string[]) {
    this.userPreferences = categories;
  }
} 