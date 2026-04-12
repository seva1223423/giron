import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle, TextInputProps } from 'react-native';
import { useThemeStore } from '../store';
import { typography } from '../theme';
import { borderRadius, spacing } from '../theme/spacing';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  containerStyle,
  style,
  ...props
}) => {
  const { colors } = useThemeStore();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.inputBackground,
            borderRadius: borderRadius.md,
            borderWidth: 1.5,
            borderColor: error
              ? colors.error
              : isFocused
              ? colors.primary
              : colors.inputBorder,
            paddingHorizontal: spacing.lg,
          },
        ]}
      >
        {icon && <View style={{ marginRight: spacing.md }}>{icon}</View>}
        <TextInput
          style={[
            typography.body,
            {
              flex: 1,
              color: colors.inputText,
              paddingVertical: spacing.md + 2,
            },
            style,
          ]}
          placeholderTextColor={colors.inputPlaceholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
      </View>
      {error && (
        <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
          {error}
        </Text>
      )}
    </View>
  );
};
