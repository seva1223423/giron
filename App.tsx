import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useThemeStore } from './src/store';
import { ErrorBoundary } from './src/components';
// Touching the wrapper at module load triggers the lazy Sentry init the
// first time reportError() / setUser() / addBreadcrumb() runs. We call
// addBreadcrumb here to mark "app booted" with no PII so the very first
// crash report has useful context. No-op when Sentry isn't installed yet.
import { addBreadcrumb } from './src/utils/errorReporter';

addBreadcrumb('app:boot', { ts: new Date().toISOString() });

export default function App() {
  const { isDark } = useThemeStore();

  return (
    // Top-level ErrorBoundary catches render crashes that happen above the
    // navigator (theme load, safe area, gesture handler init). The
    // navigator has its own inner boundaries for tab-level isolation.
    <ErrorBoundary scope="app-root">
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AppNavigator />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
