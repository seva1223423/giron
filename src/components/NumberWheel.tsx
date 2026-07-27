import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useHaptic } from '../hooks/useHaptic';
import { useThemeColors } from '../store';
import { typography } from '../theme';
import { wheelOptions, wheelIndexOf } from '../utils/wheel';

/**
 * Scrolling number wheel — the app's single way to enter a number.
 *
 * WHY THIS EXISTS. Every numeric field used a pair of ±32pt buttons around a
 * cramped text input: five controls per set row, twenty on a workout screen,
 * eight on the nutrition goals sheet. It read as a control panel, and a fixed
 * 2.5 kg step meant forty taps to get from 0 to 100 kg. The row should show
 * data; changing it is comparatively rare and deserves one large, precise
 * control instead of many small ones.
 *
 * WHY A FlatList AND NOT A PICKER LIBRARY. A native picker would need a new
 * APK build (so no OTA delivery) and cannot be themed to graphite + gold on
 * Android. This is plain React Native: virtualised for long ranges, styled
 * with our own tokens, and it ships over the air.
 *
 * ACCESSIBILITY. Removing the ± buttons removes the only thing a screen
 * reader could operate, so the wheel declares `adjustable` and handles
 * increment/decrement — VoiceOver and TalkBack swipe up/down to change it.
 */

export const WHEEL_ITEM_HEIGHT = 38;
/** Visible rows. Odd so exactly one sits in the middle. */
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);

interface Props {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Distance between neighbouring options, e.g. 2.5 for kilograms. */
  step: number;
  /** Shown next to the selected value — "кг", "г", "с". */
  unit?: string;
  /** Spoken by screen readers, e.g. "Вес". */
  label?: string;
  /** Override how a value is rendered (default trims trailing ".0"). */
  format?: (value: number) => string;
  testID?: string;
}

/** Default rendering: 102.5 → "102.5", 100.0 → "100". */
function defaultFormat(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export const NumberWheel: React.FC<Props> = ({
  value, onChange, min, max, step, unit, label, format = defaultFormat, testID,
}) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const listRef = useRef<FlatList<number>>(null);
  const lastIndexRef = useRef<number>(-1);

  const options = useMemo(() => wheelOptions(min, max, step), [min, max, step]);
  const count = options.length;
  const selectedIndex = wheelIndexOf(value, min, step, count);

  // Keep the wheel in sync when the value changes from outside (a preset chip,
  // a different set being opened). Skipped while the user is scrolling.
  const draggingRef = useRef(false);
  useEffect(() => {
    if (draggingRef.current) return;
    lastIndexRef.current = selectedIndex;
    listRef.current?.scrollToIndex({ index: selectedIndex, animated: false });
  }, [selectedIndex]);

  const commitFromOffset = useCallback((y: number) => {
    const idx = Math.min(count - 1, Math.max(0, Math.round(y / WHEEL_ITEM_HEIGHT)));
    if (idx !== lastIndexRef.current) {
      lastIndexRef.current = idx;
      haptic.selection();
      onChange(options[idx]);
    }
  }, [count, haptic, onChange, options]);

  // Settling the wheel needs both endings. A flick ends with momentum; a slow
  // careful drag produces no momentum event at all, so without a second path
  // the nudge would silently do nothing.
  //
  // They cannot both commit, though: `onScrollEndDrag` fires BEFORE momentum
  // begins, so committing there would push a mid-flick value to the parent,
  // and the sync effect below would yank the list back and kill the throw.
  // So drag-end only arms a short timer, and momentum-begin disarms it.
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSettle = useCallback(() => {
    if (settleRef.current) { clearTimeout(settleRef.current); settleRef.current = null; }
  }, []);
  useEffect(() => clearSettle, [clearSettle]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    clearSettle();
    draggingRef.current = false;
    commitFromOffset(e.nativeEvent.contentOffset.y);
  }, [commitFromOffset, clearSettle]);

  const onDragEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    clearSettle();
    settleRef.current = setTimeout(() => {
      draggingRef.current = false;
      commitFromOffset(y);
    }, 120);
  }, [commitFromOffset, clearSettle]);

  const nudge = useCallback((delta: number) => {
    const next = Math.min(count - 1, Math.max(0, selectedIndex + delta));
    if (next === selectedIndex) return;
    haptic.selection();
    onChange(options[next]);
  }, [count, selectedIndex, haptic, onChange, options]);

  const renderItem = useCallback(({ item, index }: { item: number; index: number }) => {
    const distance = Math.abs(index - selectedIndex);
    const isSelected = distance === 0;
    return (
      <View style={styles.item}>
        <Text
          style={[
            isSelected ? typography.h2 : typography.body,
            {
              color: isSelected ? colors.primary : colors.textSecondary,
              // Neighbours fade out so the middle row reads as "the value"
              // without needing a heavy highlight box.
              opacity: isSelected ? 1 : distance === 1 ? 0.55 : 0.25,
              fontWeight: isSelected ? '800' : '500',
            },
          ]}
          allowFontScaling={false}
          numberOfLines={1}
        >
          {format(item)}
        </Text>
      </View>
    );
  }, [selectedIndex, colors, format]);

  return (
    <View
      style={styles.wrap}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `${format(options[selectedIndex])}${unit ? ` ${unit}` : ''}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') nudge(1);
        else if (e.nativeEvent.actionName === 'decrement') nudge(-1);
      }}
    >
      {/* Selection band — two hairlines rather than a filled box, so the
          number stays the brightest thing on the sheet. */}
      <View
        pointerEvents="none"
        style={[
          styles.band,
          { borderColor: colors.primary + '55', top: PAD_ROWS * WHEEL_ITEM_HEIGHT },
        ]}
      />
      <FlatList
        ref={listRef}
        data={options}
        keyExtractor={(item) => String(item)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: WHEEL_ITEM_HEIGHT, offset: WHEEL_ITEM_HEIGHT * index, index })}
        initialScrollIndex={selectedIndex}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        onScrollBeginDrag={() => { draggingRef.current = true; clearSettle(); }}
        onScrollEndDrag={onDragEnd}
        onMomentumScrollBegin={clearSettle}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ paddingVertical: PAD_ROWS * WHEEL_ITEM_HEIGHT }}
        style={{ height: VISIBLE_ROWS * WHEEL_ITEM_HEIGHT }}
        // A scrollToIndex before layout can throw; recover by measuring.
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({ offset: info.index * WHEEL_ITEM_HEIGHT, animated: false });
          }, 0);
        }}
      />
      {unit ? (
        <Text style={[typography.caption, styles.unit, { color: colors.textTertiary }]} allowFontScaling={false}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  item: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  band: {
    position: 'absolute', left: 0, right: 0, height: WHEEL_ITEM_HEIGHT,
    borderTopWidth: 1, borderBottomWidth: 1,
  },
  unit: { position: 'absolute', right: 0, alignSelf: 'center' },
});
