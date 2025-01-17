import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomTabs } from './src/navigation/BottomTabs';
import { StatusBar } from 'expo-status-bar';
import { RootTabParamList } from './src/types/navigation';

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <BottomTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
