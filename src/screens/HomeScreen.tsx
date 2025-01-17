import React, { useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, ViewToken, Dimensions, ListRenderItemInfo, ActivityIndicator } from 'react-native';
import { VideoPost } from '../components/VideoPost';
import { Video } from '../types/video';
import { VideoService } from '../services/videoService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PAGE_SIZE = 5;
const { height: WINDOW_HEIGHT } = Dimensions.get('window');

export function HomeScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [visibleVideoId, setVisibleVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const insets = useSafeAreaInsets();

  const videoService = VideoService.getInstance();

  const loadVideos = useCallback(async (page: number) => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const { videos: newVideos, hasMore: more } = await videoService.fetchVideos({
        page,
        pageSize: PAGE_SIZE,
      });

      setVideos(prev => (page === 1 ? newVideos : [...prev, ...newVideos]));
      setHasMore(more);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error loading videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore]);

  useEffect(() => {
    loadVideos(1);
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const visibleItem = viewableItems[0];
      setVisibleVideoId(visibleItem.key as string);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 80,
    minimumViewTime: 300,
  };

  const renderItem = useCallback(({ item }: ListRenderItemInfo<Video>) => (
    <VideoPost
      uri={item.uri}
      caption={item.caption}
      username={item.username}
      likes={item.likes}
      comments={item.comments}
      isVisible={item.id === visibleVideoId}
    />
  ), [visibleVideoId]);

  const keyExtractor = useCallback((item: Video) => item.id, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: WINDOW_HEIGHT,
    offset: WINDOW_HEIGHT * index,
    index,
  }), []);

  const onEndReached = useCallback(() => {
    if (!isLoading && hasMore) {
      loadVideos(currentPage + 1);
    }
  }, [isLoading, hasMore, currentPage, loadVideos]);

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;

    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }, [isLoading]);

  const onMomentumScrollEnd = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / WINDOW_HEIGHT);
    const item = videos[index];
    if (item) {
      setVisibleVideoId(item.id);
    }
  }, [videos]);

  return (
    <View style={styles.container}>
      <FlatList
        data={videos}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        pagingEnabled
        snapToInterval={WINDOW_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        removeClippedSubviews={true}
        maxToRenderPerBatch={2}
        windowSize={3}
        initialNumToRender={1}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        onMomentumScrollEnd={onMomentumScrollEnd}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loaderContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 