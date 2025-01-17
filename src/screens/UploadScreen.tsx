import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UploadStackParamList } from '../types/navigation';

type UploadScreenNavigationProp = NativeStackNavigationProp<UploadStackParamList, 'UploadMain'>;

export function UploadScreen() {
  const navigation = useNavigation<UploadScreenNavigationProp>();
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  const requestPermissions = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const mediaPermission = await MediaLibrary.requestPermissionsAsync();
    
    setPermissionsGranted(
      cameraPermission.status === 'granted' && 
      mediaPermission.status === 'granted'
    );
  };

  React.useEffect(() => {
    requestPermissions();
  }, []);

  const pickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets[0]) {
        navigation.navigate('VideoPreview', {
          uri: result.assets[0].uri,
          type: 'library'
        });
      }
    } catch (error) {
      console.error('Error picking video:', error);
    }
  };

  const openCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets[0]) {
        navigation.navigate('VideoPreview', {
          uri: result.assets[0].uri,
          type: 'camera'
        });
      }
    } catch (error) {
      console.error('Error recording video:', error);
    }
  };

  if (!permissionsGranted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.permissionText}>
            We need camera and media library permissions to upload videos
          </Text>
          <TouchableOpacity 
            style={styles.permissionButton}
            onPress={requestPermissions}
          >
            <Text style={styles.permissionButtonText}>Grant Permissions</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Upload a Video</Text>
        <Text style={styles.subtitle}>Share your moments with the world</Text>
        
        <View style={styles.optionsContainer}>
          <TouchableOpacity style={styles.option} onPress={pickVideo}>
            <View style={styles.iconContainer}>
              <Ionicons name="images" size={40} color="#fff" />
            </View>
            <Text style={styles.optionText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={openCamera}>
            <View style={styles.iconContainer}>
              <Ionicons name="camera" size={40} color="#fff" />
            </View>
            <Text style={styles.optionText}>Record a Video</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Videos should be up to 60 seconds long
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 40,
  },
  optionsContainer: {
    width: '100%',
    maxWidth: 500,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  option: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff2b55',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
  },
  hint: {
    color: '#666',
    fontSize: 14,
    position: 'absolute',
    bottom: 40,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#ff2b55',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 