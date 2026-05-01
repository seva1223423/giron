import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useThemeStore } from '../store/useThemeStore';
import { useReducedMotion } from '../hooks/useAccessibility';

type ToastVariant = 'info' | 'success' | 'error' | 'warning';

interface ToastOptions {
  message: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  show: (opts: ToastOptions) => void;
  hide: () => void;
}

const ToastCtx = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const VARIANT_BG: Record<ToastVariant, string> = {
  info: '#1F2937',
  success: '#065F46',
  error: '#7F1D1D',
  warning: '#78350F',
};

/**
 * Wrap your app root in `<ToastProvider>` once. Anywhere below, call
 * `useToast().show({ message: 'Сохранено' })`.
 *
 * Toasts:
 *   - sit above the bottom safe area (home indicator)
 *   - auto-dismiss after `duration` (default 3500ms)
 *   - support an inline action button ("Отменить", "Повторить")
 *   - honor Reduce Motion (instant fade)
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(20)).current;
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((s) => s.colors);
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: reduce ? 0 : 180, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 20, duration: reduce ? 0 : 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translate, reduce]);

  const show = useCallback(
    (opts: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(opts);
      opacity.setValue(0);
      translate.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: reduce ? 0 : 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: reduce ? 0 : 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      timer.current = setTimeout(hide, opts.duration ?? 3500);
    },
    [opacity, translate, reduce, hide],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const variant = toast?.variant ?? 'info';

  return (
    <ToastCtx.Provider value={{ show, hide }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { bottom: Math.max(insets.bottom, 12) + 12, opacity, transform: [{ translateY: translate }] },
          ]}
        >
          <View
            style={[
              styles.toast,
              { backgroundColor: VARIANT_BG[variant], borderColor: colors.border },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{toast.message}</Text>
              {toast.description ? (
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
                  {toast.description}
                </Text>
              ) : null}
            </View>
            {toast.action ? (
              <Pressable
                onPress={() => {
                  toast.action!.onPress();
                  hide();
                }}
                style={styles.action}
                hitSlop={10}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  {toast.action.label.toUpperCase()}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    minHeight: 48,
    width: '100%',
    maxWidth: 560,
    borderWidth: StyleSheet.hairlineWidth,
  },
  action: {
    marginLeft: 12,
    paddingHorizontal: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
});
