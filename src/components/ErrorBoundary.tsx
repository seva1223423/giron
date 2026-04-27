import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { reportError } from '../utils/errorReporter';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional tag attached to Sentry events — useful when an ErrorBoundary
   *  wraps a specific screen subtree (e.g. AIChatScreen) so issues land in
   *  the right inbox. Defaults to 'app-root'. */
  scope?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Surface the React-render crash to Sentry with the component-stack
    // attached. Without this every render-phase exception was invisible —
    // the user sees the fallback screen, but the dev never knew it fired.
    reportError(error, {
      screen: this.props.scope ?? 'app-root',
      tags: { origin: 'error-boundary' },
      extra: { componentStack: errorInfo?.componentStack ?? null },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>!</Text>
          <Text style={styles.title}>Что-то пошло не так</Text>
          <Text style={styles.message}>Попробуйте перезапустить приложение.</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.buttonText}>Попробовать снова</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0F0F1A' },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 8 },
  message: { fontSize: 14, color: '#999', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#8B5CF6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
