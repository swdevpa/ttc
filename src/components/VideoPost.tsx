import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { CacheService } from '../services/cacheService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Constants for UI spacing
const BOTTOM_TAB_HEIGHT = 49;
const SIDEBAR_MARGIN = Platform.OS === 'ios' ? 90 : 70;
const CONTENT_MARGIN = Platform.OS === 'ios' ? 50 : 40;
const CONTENT_HORIZONTAL_PADDING = 16;

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');

interface VideoPostProps {
  uri: string;
  caption: string;
  username: string;
  likes: number;
  comments: number;
  isVisible?: boolean;
}

export function VideoPost({ uri, caption, username, likes, comments, isVisible = true }: VideoPostProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState(uri);
  const insets = useSafeAreaInsets();

  const videoHeight = WINDOW_HEIGHT;

  useEffect(() => {
    loadCachedVideo();
  }, [uri]);

  const loadCachedVideo = async () => {
    try {
      const cacheService = CacheService.getInstance();
      const cachedUri = await cacheService.getCachedUri(uri);
      setVideoUri(cachedUri);
    } catch (error) {
      console.error('Failed to load cached video:', error);
      setVideoUri(uri);
    }
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleLike = () => {
    setIsLiked(!isLiked);
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsLoading(false);
      if (!isVisible && status.isPlaying) {
        videoRef.current?.pauseAsync();
      }
    } else {
      if (status.error) {
        setError('Failed to load video');
      }
    }
  };

  const retryLoadingVideo = async () => {
    setError(null);
    setIsLoading(true);
    await loadCachedVideo();
  };

  React.useEffect(() => {
    if (!isVisible && isPlaying) {
      videoRef.current?.pauseAsync();
      setIsPlaying(false);
    }
  }, [isVisible]);

  return (
    <View style={[styles.container, { height: videoHeight }]}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity activeOpacity={1} onPress={togglePlayPause} style={styles.videoContainer}>
        <Video
          ref={videoRef}
          source={{ uri: videoUri }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={isPlaying && isVisible}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          useNativeControls={false}
        />
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={40} color="#fff" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={retryLoadingVideo} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.overlay}>
          <View style={styles.sidebar}>
            <TouchableOpacity onPress={toggleLike} style={styles.sidebarButton}>
              <Ionicons 
                name={isLiked ? "heart" : "heart-outline"} 
                size={35} 
                color={isLiked ? "#ff2b55" : "#fff"} 
              />
              <Text style={styles.sidebarText}>{likes}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sidebarButton}>
              <Ionicons name="chatbubble-outline" size={35} color="#fff" />
              <Text style={styles.sidebarText}>{comments}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sidebarButton}>
              <Ionicons name="share-social-outline" size={35} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.username}>@{username}</Text>
            <Text style={styles.caption} numberOfLines={3}>{caption}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: WINDOW_WIDTH,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: CONTENT_HORIZONTAL_PADDING,
    paddingBottom: BOTTOM_TAB_HEIGHT + CONTENT_MARGIN,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  errorText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  retryButton: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ff2b55',
    borderRadius: 20,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sidebar: {
    position: 'absolute',
    right: CONTENT_HORIZONTAL_PADDING,
    bottom: SIDEBAR_MARGIN,
    alignItems: 'center',
  },
  sidebarButton: {
    alignItems: 'center',
    marginVertical: 8,
  },
  sidebarText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
  },
  bottomSection: {
    marginRight: 80,
  },
  username: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
}); 