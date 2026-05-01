import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

interface TextProps extends RNTextProps {
  children?: React.ReactNode;
}

/**
 * Iron Gym Text wrapper with two safety defaults:
 *
 *   1. `maxFontSizeMultiplier={1.4}` — caps Dynamic Type / fontScale at +40%
 *      so accessibility users still get bigger fonts but our layouts don't
 *      explode (200% iOS Larger Text was breaking metric tiles).
 *
 *   2. `numberOfLines` is *not* defaulted — pass it where overflow matters.
 *
 * Drop-in: `import { Text } from '@/components/Text';` — same API as RN Text.
 */
export function Text({ style, maxFontSizeMultiplier = 1.4, ...rest }: TextProps) {
  return <RNText {...rest} style={style} maxFontSizeMultiplier={maxFontSizeMultiplier} />;
}

export type { TextStyle };
