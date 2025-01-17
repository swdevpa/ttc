import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UploadStackParamList } from '../types/navigation';
import { UploadService } from '../services/uploadService';

type VideoPreviewScreenNavigationProp = NativeStackNavigationProp<UploadStackParamList, 'VideoPreview'>;
type VideoPreviewScreenRouteProp = RouteProp<UploadStackParamList, 'VideoPreview'>;

const CATEGORIES = [
  'Comedy', 'Dance', 'Education', 'Entertainment', 'Gaming',
  'Lifestyle', 'Music', 'News', 'Pets', 'Sports'
];

export function VideoPreviewScreen() {
  const navigation = useNavigation<VideoPreviewScreenNavigationProp>();
  const route = useRoute<VideoPreviewScreenRouteProp>();
  const { uri, type } = route.params;
  
  const [caption, setCaption] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoRef = useRef<Video>(null);

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      }
      if (prev.length < 3) {
        return [...prev, category];
      }
      return prev;
    });
  };

  const handleUpload = async () => {
    if (caption.trim().length === 0) {
      Alert.alert('Error', 'Please add a caption to your video');
      return;
    }

    if (selectedCategories.length === 0) {
      Alert.alert('Error', 'Please select at least one category');
      return;
    }

    setIsUploading(true);

    try {
      const uploadService = UploadService.getInstance();
      await uploadService.uploadVideo(
        {
          uri,
          type,
          caption: caption.trim(),
          categories: selectedCategories,
        },
        (progress) => {
          setUploadProgress(progress);
        }
      );

      navigation.navigate('UploadMain');
      navigation.getParent()?.navigate('Home');
    } catch (error) {
      console.error('Upload failed:', error);
      Alert.alert(
        'Upload Failed',
        'There was an error uploading your video. Please try again.'
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          disabled={isUploading}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity 
          onPress={handleUpload}
          style={[styles.headerButton, styles.uploadButton]}
          disabled={isUploading}
        >
          {isUploading ? (
            <View style={styles.uploadProgress}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.uploadProgressText}>
                {Math.round(uploadProgress)}%
              </Text>
            </View>
          ) : (
            <Text style={styles.uploadText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping
          />
        </View>

        <View style={styles.inputSection}>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption..."
            placeholderTextColor="#666"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={150}
            editable={!isUploading}
          />
          
          <Text style={styles.sectionTitle}>Categories (max 3)</Text>
          <View style={styles.categoriesContainer}>
            {CATEGORIES.map(category => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  selectedCategories.includes(category) && styles.categoryButtonSelected
                ]}
                onPress={() => toggleCategory(category)}
                disabled={isUploading}
              >
                <Text style={[
                  styles.categoryText,
                  selectedCategories.includes(category) && styles.categoryTextSelected
                ]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerButton: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  uploadButton: {
    backgroundColor: '#ff2b55',
    borderRadius: 20,
    paddingVertical: 8,
  },
  uploadText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  uploadProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  uploadProgressText: {
    color: '#fff',
    marginLeft: 5,
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  videoContainer: {
    aspectRatio: 9/16,
    backgroundColor: '#111',
    width: '100%',
  },
  video: {
    flex: 1,
  },
  inputSection: {
    padding: 16,
  },
  captionInput: {
    color: '#fff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    margin: 4,
  },
  categoryButtonSelected: {
    backgroundColor: '#ff2b55',
    borderColor: '#ff2b55',
  },
  categoryText: {
    color: '#fff',
    fontSize: 14,
  },
  categoryTextSelected: {
    fontWeight: 'bold',
  },
}); 