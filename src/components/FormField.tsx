import React from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Text } from './Text';
import { useThemeStore } from '../store/useThemeStore';
import { useResponsive } from '../hooks/useResponsive';

export interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  /** Visible label above the input. */
  label?: string;
  /** Helper text below the input. */
  helper?: string;
  /** Error message — when truthy, renders red border + replaces helper. */
  error?: string | null;
  /** Right-side adornment, e.g. a unit ("кг") or a clear button. */
  trailing?: React.ReactNode;
  /** Left-side adornment, e.g. an icon. */
  leading?: React.ReactNode;
  /** Required marker on the label. */
  required?: boolean;
  /** Optional callback when user taps anywhere on the field area. */
  onPressContainer?: () => void;
}

/**
 * Giron's universal text input. Solves repeated boilerplate:
 *   - label + required asterisk
 *   - helper text and error state with consistent colors
 *   - leading / trailing adornments (icon, unit, clear)
 *   - 48pt min hit-area on Android
 *   - correct accessible focus ring on web
 *   - safe defaults for fonts and color (theme-aware)
 *
 * Drop-in replacement for `<TextInput>` — pass any TextInput prop through.
 */
export function FormField({
  label,
  helper,
  error,
  trailing,
  leading,
  required,
  onPressContainer,
  ...input
}: FormFieldProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();
  const [focused, setFocused] = React.useState(false);

  const borderColor = error
    ? colors.error ?? '#EF4444'
    : focused
    ? colors.primary ?? colors.text
    : colors.border;

  const inputHeight = r.scale(48);

  return (
    <View style={{ marginBottom: r.space('md') }}>
      {label ? (
        <View style={styles.labelRow}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0.4,
              color: colors.textMuted ?? colors.text,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Text>
          {required ? (
            <Text style={{ color: colors.error ?? '#EF4444', marginLeft: 4 }}>*</Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={onPressContainer}
        style={[
          styles.container,
          {
            height: inputHeight,
            borderColor,
            backgroundColor: colors.surface,
            borderRadius: r.scale(12),
            paddingHorizontal: r.space('md'),
          },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <TextInput
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={colors.textMuted ?? '#888'}
          style={[
            styles.input,
            {
              color: colors.text,
              fontSize: r.fontScale_(15),
            },
          ]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Pressable>

      {error || helper ? (
        <Text
          style={{
            marginTop: 6,
            fontSize: 12,
            color: error ? colors.error ?? '#EF4444' : colors.textMuted ?? colors.text,
            lineHeight: 16,
          }}
        >
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  leading: { marginRight: 10 },
  trailing: { marginLeft: 10 },
  input: {
    flex: 1,
    paddingVertical: 0, // height comes from container
  },
});
