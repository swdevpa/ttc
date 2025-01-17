import { NavigatorScreenParams } from '@react-navigation/native';

export type RootTabParamList = {
  Home: undefined;
  Profile: undefined;
  Upload: NavigatorScreenParams<UploadStackParamList>;
  Notifications: undefined;
};

export type UploadStackParamList = {
  UploadMain: undefined;
  VideoPreview: {
    uri: string;
    type: 'library' | 'camera';
  };
}; 