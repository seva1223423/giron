/**
 * Giron — top-screen toast (lightweight notifications, complementary to the
 * bottom-sheet ToastProvider in src/components/Toast.tsx).
 *
 * Mount one <ToastHost/> at the root after <AppModalProvider>, then call:
 *   import { toast } from '@/components/app-modal/toast';
 *   toast.success('Сохранено');
 *   toast.error('Нет соединения');
 *   toast.warn('Разрешите доступ к камере');
 *   toast.info('Сессия истекла');
 *
 * Differs from the existing ToastProvider/useToast pair: that one is bottom
 * positioned with action buttons (replaces blocking Alerts). This one is top
 * positioned, no actions, fire-and-forget — for quick feedback ("saved",
 * "copied", "no internet, queued") that shouldn't fight for attention.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IronGymTheme as T } from './AppModalProvider';

type ToastKind = 'success' | 'error' | 'warn' | 'info';

interface ToastItem {
  id: string;
  kind: ToastKind;
  text: string;
  duration?: number;
}

interface ToastOpts {
  duration?: number;
}

const COLORS: Record<ToastKind, string> = {
  success: T.good,
  error: T.danger,
  warn: T.warn,
  info: T.accent,
};

const ICONS: Record<ToastKind, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark',
  error: 'close',
  warn: 'warning',
  info: 'information',
};

// Module-scope sink, swapped in by ToastHost on mount. No-op before mount —
// keeps `toast.success(...)` safe to call from anywhere (e.g. an axios
// interceptor that fires before the host is rendered).
let _enqueue: (item: Omit<ToastItem, 'id'>) => void = () => {};

export const toast = {
  success: (text: string, opts?: ToastOpts) => _enqueue({ kind: 'success', text, ...opts }),
  error: (text: string, opts?: ToastOpts) => _enqueue({ kind: 'error', text, ...opts }),
  warn: (text: string, opts?: ToastOpts) => _enqueue({ kind: 'warn', text, ...opts }),
  info: (text: string, opts?: ToastOpts) => _enqueue({ kind: 'info', text, ...opts }),
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _enqueue = (item) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { ...item, id }]);
      const ttl = item.duration ?? 2800;
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), ttl);
    };
    return () => {
      _enqueue = () => {};
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.host}>
      {items.map((it) => (
        <ToastItemView key={it.id} item={it} />
      ))}
    </View>
  );
}

function ToastItemView({ item }: { item: ToastItem }) {
  const y = useRef(new Animated.Value(-20)).current;
  const o = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(o, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [o, y]);

  const color = COLORS[item.kind];
  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY: y }], opacity: o }]}>
      <View style={[styles.iconBox, { borderColor: color + '55', backgroundColor: color + '1F' }]}>
        <Ionicons name={ICONS[item.kind]} size={16} color={color} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {item.text}
      </Text>
      <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    width: 320,
    height: 56,
    borderRadius: 18,
    backgroundColor: T.surfaceHi,
    borderWidth: 1,
    borderColor: T.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
    }),
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, color: T.text, fontSize: 13.5, fontWeight: '500' },
  dot: {
    width: 4,
    height: 28,
    borderRadius: 4,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
});
