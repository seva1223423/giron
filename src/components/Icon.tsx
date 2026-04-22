import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

/**
 * Direction A icon set — SVG paths ported 1:1 from the Claude Design
 * handoff bundle (primitives.jsx → Icons). 24pt grid, 1.6 stroke,
 * rounded caps + joins, currentColor fill — stroke inheritance makes
 * them easy to recolor by wrapping in a View with `color` set.
 *
 * Usage:
 *   <Icon name="bell" size={20} color={colors.text} />
 *
 * Prefer this over emoji or unicode glyphs for any icon that's going
 * into the app chrome — emoji render inconsistently across platforms
 * and unicode box-drawing chars (◈ ◫ △) look cheap next to the
 * premium typography + spacing.
 */

export type IconName =
  | 'bell' | 'spark' | 'flame' | 'trophy' | 'check' | 'arrow' | 'chev' | 'chevDn'
  | 'timer' | 'camera' | 'mic' | 'scan' | 'heart' | 'bolt' | 'target'
  | 'plus' | 'play' | 'pause' | 'refresh' | 'send' | 'search' | 'logo'
  | 'dumbbell' | 'apple' | 'chart' | 'user' | 'home' | 'message' | 'bookmark' | 'more'
  | 'settings' | 'lock' | 'grid' | 'news' | 'water' | 'moon' | 'rouble';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}

// All stroke paths share the same base wrapping; only the d/extras differ.
const PATHS: Record<IconName, (color: string, sw: number) => React.ReactNode> = {
  bell: (c, sw) => (
    <>
      <Path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 20a2 2 0 0 0 4 0" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  spark: (c, sw) => (
    <>
      <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  ),
  flame: (c, sw) => (
    <Path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4-.3 1.5.5 2.5 1.5 2.5 0-3 0-5 1.5-7.5Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  trophy: (c, sw) => (
    <>
      <Path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 14h6v2H9zM7 20h10M10 16v4M14 16v4" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  check: (c, sw) => (
    <Path d="m5 12 5 5L20 7" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  arrow: (c, sw) => (
    <Path d="M5 12h14M13 6l6 6-6 6" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  chev: (c, sw) => (
    <Path d="m9 6 6 6-6 6" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  chevDn: (c, sw) => (
    <Path d="m6 9 6 6 6-6" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  timer: (c, sw) => (
    <>
      <Circle cx={12} cy={13} r={8} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="M12 9v4l3 2M9 3h6" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  camera: (c, sw) => (
    <>
      <Path d="M4 8h3l2-2h6l2 2h3v11H4z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3.5} stroke={c} strokeWidth={sw} fill="none" />
    </>
  ),
  mic: (c, sw) => (
    <>
      <Rect x={9} y={3} width={6} height={12} rx={3} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" />
    </>
  ),
  scan: (c, sw) => (
    <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M3 12h18" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  heart: (c, sw) => (
    <Path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  bolt: (c) => (
    <Path d="M13 3 4 14h6l-1 7 9-11h-6z" stroke={c} strokeWidth={0} fill={c} strokeLinecap="round" strokeLinejoin="round" />
  ),
  target: (c, sw) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={sw} fill="none" />
      <Circle cx={12} cy={12} r={5} stroke={c} strokeWidth={sw} fill="none" />
      <Circle cx={12} cy={12} r={1.5} fill={c} />
    </>
  ),
  plus: (c, sw) => (
    <Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={sw} strokeLinecap="round" />
  ),
  play: (c) => (
    <Path d="M7 5v14l12-7Z" fill={c} />
  ),
  pause: (c) => (
    <>
      <Rect x={7} y={5} width={3.5} height={14} fill={c} />
      <Rect x={13.5} y={5} width={3.5} height={14} fill={c} />
    </>
  ),
  refresh: (c, sw) => (
    <Path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  send: (c, sw) => (
    <Path d="m4 12 16-8-5 18-3-8Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  search: (c, sw) => (
    <>
      <Circle cx={11} cy={11} r={7} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="m20 20-4-4" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  ),
  logo: (c) => (
    <>
      <Rect x={5} y={5} width={3} height={14} fill={c} />
      <Rect x={16} y={5} width={3} height={14} fill={c} />
      <Rect x={8} y={10} width={8} height={4} fill={c} />
    </>
  ),
  dumbbell: (c, sw) => (
    <Path d="M2 10v4M22 10v4M6 7v10M18 7v10M6 12h12" stroke={c} strokeWidth={sw} strokeLinecap="round" />
  ),
  apple: (c, sw) => (
    <>
      <Path d="M12 7c1-2 3-3 5-3-.3 2-1.5 4-3 4M12 7c-1-1.5-2.5-3-5-3 .3 2 1.3 3.3 3 4" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 12c0 5 3 9 7 9s7-4 7-9c0-2.5-2-5-5-5-1 0-1.7.4-2 1-.3-.6-1-1-2-1-3 0-5 2.5-5 5Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  chart: (c, sw) => (
    <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke={c} strokeWidth={sw} strokeLinecap="round" />
  ),
  user: (c, sw) => (
    <>
      <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" />
    </>
  ),
  home: (c, sw) => (
    <>
      <Path d="M3 11.5 12 4l9 7.5" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v10h14V10" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  message: (c, sw) => (
    <Path d="M4 5h16v12H8l-4 4V5Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  bookmark: (c, sw) => (
    <Path d="M6 3h12v18l-6-4-6 4V3Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  more: (c) => (
    <>
      <Circle cx={5} cy={12} r={1.5} fill={c} />
      <Circle cx={12} cy={12} r={1.5} fill={c} />
      <Circle cx={19} cy={12} r={1.5} fill={c} />
    </>
  ),
  settings: (c, sw) => (
    <>
      <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke={c} strokeWidth={sw} strokeLinecap="round" />
    </>
  ),
  lock: (c, sw) => (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" />
    </>
  ),
  grid: (c, sw) => (
    <>
      <Rect x={3} y={3} width={7} height={7} rx={1} stroke={c} strokeWidth={sw} fill="none" />
      <Rect x={14} y={3} width={7} height={7} rx={1} stroke={c} strokeWidth={sw} fill="none" />
      <Rect x={3} y={14} width={7} height={7} rx={1} stroke={c} strokeWidth={sw} fill="none" />
      <Rect x={14} y={14} width={7} height={7} rx={1} stroke={c} strokeWidth={sw} fill="none" />
    </>
  ),
  news: (c, sw) => (
    <>
      <Rect x={3} y={5} width={18} height={14} rx={2} stroke={c} strokeWidth={sw} fill="none" />
      <Path d="M7 9h7M7 13h10M7 17h5" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" />
    </>
  ),
  water: (c, sw) => (
    <Path d="M12 3c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  moon: (c, sw) => (
    <Path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  rouble: (c, sw) => (
    <Path d="M7 20V4h5a4.5 4.5 0 0 1 0 9H5M5 16h8" stroke={c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
};

export const Icon: React.FC<Props> = ({ name, size = 20, color = 'currentColor', strokeWidth = 1.6 }) => {
  const render = PATHS[name];
  if (!render) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render(color, strokeWidth)}
    </Svg>
  );
};
