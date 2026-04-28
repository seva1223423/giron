import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useThemeStore } from './src/store';
import { ErrorBoundary, ForceUpdateModal } from './src/components';
// Touching the wrapper at module load triggers the lazy Sentry init the
// first time reportError() / setUser() / addBreadcrumb() runs. We call
// addBreadcrumb here to mark "app booted" with no PII so the very first
// crash report has useful context. No-op when Sentry isn't installed yet.
import { addBreadcrumb } from './src/utils/errorReporter';
import { checkAndApplyUpdate } from './src/services/otaUpdater';

addBreadcrumb('app:boot', { ts: new Date().toISOString() });

export default function App() {
  const { isDark } = useThemeStore();

  // OTA update check (OTA-01). Fires once on initial mount, then again
  // every time the app returns from background. Both passes are silent
  // and non-blocking — even if the network call hangs, the user never
  // waits on a spinner. The downloaded bundle activates on the *next*
  // cold start, never mid-session, to avoid wiping state under the user
  // (active workout, AI chat input). expo-updates handles dedupe so
  // these calls are safe to fire frequently.
  useEffect(() => {
    checkAndApplyUpdate({ silent: true });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAndApplyUpdate({ silent: true });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    // Top-level ErrorBoundary catches render crashes that happen above the
    // navigator (theme load, safe area, gesture handler init). The
    // navigator has its own inner boundaries for tab-level isolation.
    <ErrorBoundary scope="app-root">
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AppNavigator />
          {/* Sits at the root so the modal overlays every screen, including
              auth/onboarding. Mounts once for the lifetime of the app and
              is internally driven by the api.ts event bus. */}
          <ForceUpdateModal />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
