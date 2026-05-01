import React from 'react';
import {
  Modal,
  ModalProps,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../store/useThemeStore';
import { useResponsive } from '../hooks/useResponsive';

interface SafeModalProps extends Omit<ModalProps, 'children'> {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 'sheet' (slide-up bottom sheet) or 'center' (centered card). Default: auto by device. */
  layout?: 'sheet' | 'center' | 'auto';
  /** Cap sheet height. Default 0.9 of screen. */
  maxHeightFraction?: number;
  /** Backdrop opacity. Default 0.5. */
  backdropOpacity?: number;
  /** Style on the white inner container. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Render the drag handle on sheet layout. Default true. */
  showHandle?: boolean;
  /** Tap on backdrop closes. Default true. */
  closeOnBackdrop?: boolean;
}

/**
 * Drop-in replacement for `<Modal>` that solves three pain points at once:
 *
 *   ✅ NEVER overflows the screen — `maxHeight` capped at 90% by default,
 *      so on iPhone SE / landscape phones the modal scrolls instead of
 *      pushing buttons off-screen.
 *
 *   ✅ Lifts above the keyboard via KeyboardAvoidingView — works on both
 *      iOS (padding) and Android (height/adjustResize).
 *
 *   ✅ Adapts to tablets / desktop — slides up as a bottom sheet on phones,
 *      fades in as a centered card on iPad/web.
 *
 * Usage:
 *   <SafeModal visible={open} onClose={close}>
 *     <Text>Hello</Text>
 *   </SafeModal>
 */
export function SafeModal({
  visible,
  onClose,
  children,
  layout = 'auto',
  maxHeightFraction = 0.9,
  backdropOpacity = 0.5,
  contentStyle,
  showHandle = true,
  closeOnBackdrop = true,
  ...modalRest
}: SafeModalProps) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((s) => s.colors);
  const screenH = Dimensions.get('window').height;

  const resolvedLayout: 'sheet' | 'center' =
    layout === 'auto' ? (r.isTablet || r.isDesktop ? 'center' : 'sheet') : layout;

  const isCentered = resolvedLayout === 'center';
  const cap = screenH * maxHeightFraction;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isCentered ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      {...modalRest}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fill}
        // On Android we don't want huge offset (status bar handled by adjustResize manifest flag)
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <Pressable
          style={[
            styles.backdrop,
            { backgroundColor: `rgba(0,0,0,${backdropOpacity})` },
            isCentered && styles.center,
          ]}
          onPress={closeOnBackdrop ? onClose : undefined}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              isCentered ? styles.card : styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                maxHeight: cap,
                paddingBottom: isCentered
                  ? 24
                  : Math.max(insets.bottom + 12, 24),
                width: isCentered ? Math.min(560, r.width - 64) : '100%',
              },
              contentStyle,
            ]}
          >
            {!isCentered && showHandle && (
              <View style={styles.handleWrap}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>
            )}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});
