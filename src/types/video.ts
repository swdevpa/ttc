export interface Video {
  id: string;
  userId: string;
  uri: string;
  thumbnailUri: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  categories: string[];
  createdAt: string;
} 