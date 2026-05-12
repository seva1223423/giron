/**
 * LineChart — interactive line chart with gradient-area fill + drag tooltip.
 *
 * Replaces the old dots-only chart (55 lines, points scattered with no line)
 * with a real chart: smooth polyline, gradient area underneath, dashed grid,
 * touch-drag tooltip showing value + label, active dot highlight, and smart
 * x-axis label thinning (skip every other when > 7 points).
 *
 * API preserved 1:1 with the previous LineChart — all 6 call sites
 * (WeightTab, SleepTab, CardioTab, OverviewTab, BodyMeasurementsCard,
 * PersonalRecordCard) keep working without changes.
 *
 * Spec source: Claude Design handoff — Direction A `interactive-chart.jsx`.
 * RN port via react-native-svg (already a dependency).
 */
import React, { useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Stop,
} from 'react-native-svg';
import { typography } from '../../../theme';

const VB_W = 300;
const VB_H = 100;
const PAD_T = 14;
const PAD_B = 16;
const PAD_X = 8;

interface DataPoint {
  label: string;
  value: number;
}

interface ThemeColors {
  text: string;
  textTertiary: string;
  surface: string;
  background: string;
  borderLight: string;
}

interface LineChartProps {
  data: DataPoint[];
  color: string;
  height?: number;
  colors: ThemeColors;
  suffix?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  color,
  height = 120,
  colors,
  suffix = '',
}) => {
  if (data.length < 2) return null;

  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  const xAt = (i: number) => PAD_X + (i / (data.length - 1)) * (VB_W - PAD_X * 2);
  const yAt = (v: number) =>
    PAD_T + (1 - (v - min) / range) * (VB_H - PAD_T - PAD_B);

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value) }));
  const linePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `${PAD_X},${VB_H - PAD_B} ${linePoints} ${VB_W - PAD_X},${VB_H - PAD_B}`;
  const grid = [0, 0.5, 1].map((f) => PAD_T + f * (VB_H - PAD_T - PAD_B));

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // Live chart-area pixel width — used to convert touch coords (in px) to
  // viewBox coords. Updated by onLayout on the touch wrapper.
  const [chartWidth, setChartWidth] = useState(VB_W);

  const findClosest = (touchPx: number) => {
    if (chartWidth <= 0) return;
    const vbX = (touchPx / chartWidth) * VB_W;
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - vbX);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    setActiveIdx(bestI);
  };

  // PanResponder captured once — onPanResponderGrant fires the first touch,
  // Move follows the drag, Release / Terminate clears the active state so
  // the tooltip dismisses cleanly.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => findClosest(e.nativeEvent.locationX),
      onPanResponderMove: (e) => findClosest(e.nativeEvent.locationX),
      onPanResponderRelease: () => setActiveIdx(null),
      onPanResponderTerminate: () => setActiveIdx(null),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) =>
    setChartWidth(e.nativeEvent.layout.width);

  // When idle (no touch): we highlight the last point so the chart "lands"
  // on the most recent value — same convention as Apple Health / Whoop.
  const showIdx = activeIdx ?? data.length - 1;
  const ap = pts[showIdx];

  // Tooltip position (relative to the touch-zone View, height = height-32):
  //  x = active dot x mapped from viewBox % → CSS %
  //  y = active dot y mapped from viewBox → pixel within touchZoneHeight,
  //      then nudged up by 30px so the tooltip sits above the dot.
  const touchZoneHeight = height - 32;
  const tooltipLeftPct = (ap.x / VB_W) * 100;
  const tooltipTopPx = Math.max(0, (ap.y / VB_H) * touchZoneHeight - 30);

  return (
    <View style={{ height }}>
      {/* max/min badges — kept from the old chart so legend doesn't disappear */}
      <View style={styles.minMaxRow}>
        <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>
          {max}
          {suffix}
        </Text>
        <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>
          {min}
          {suffix}
        </Text>
      </View>

      {/* Touch-capture zone wrapping the SVG. PanResponder lives here so
          drag works at any vertical position within the chart area. */}
      <View
        style={{ height: touchZoneHeight, position: 'relative' }}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="lcGrad" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* dashed grid (3 horizontal lines) */}
          {grid.map((y, i) => (
            <Line
              key={i}
              x1={PAD_X}
              x2={VB_W - PAD_X}
              y1={y}
              y2={y}
              stroke={colors.borderLight}
              strokeWidth={0.6}
              strokeDasharray="2 3"
            />
          ))}

          {/* area fill under the line */}
          <Polygon points={areaPoints} fill="url(#lcGrad)" />

          {/* the line itself */}
          <Polyline
            points={linePoints}
            fill="none"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* vertical guideline at the active point — only while touching */}
          {activeIdx !== null && (
            <Line
              x1={ap.x}
              x2={ap.x}
              y1={PAD_T - 4}
              y2={VB_H - PAD_B}
              stroke={color}
              strokeWidth={0.8}
              strokeDasharray="2 2"
              opacity={0.6}
            />
          )}

          {/* dots: small for inactive, big with ring for active */}
          {pts.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === showIdx ? 3 : 1.4}
              fill={i === showIdx ? color : 'rgba(255,255,255,0.35)'}
              stroke={i === showIdx ? colors.background : 'transparent'}
              strokeWidth={i === showIdx ? 1 : 0}
            />
          ))}
        </Svg>

        {/* tooltip — only while user is touching, positioned above the dot */}
        {activeIdx !== null && (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              {
                left: `${tooltipLeftPct}%`,
                top: tooltipTopPx,
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
              },
            ]}
          >
            <Text style={[styles.tooltipText, { color: colors.text }]}>
              {data[activeIdx].value}
              {suffix}{' '}
              <Text style={{ color: colors.textTertiary, fontWeight: '400' }}>
                · {data[activeIdx].label}
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* x-axis labels with smart thinning (every-other if > 7 points) */}
      <View style={styles.labelsRow}>
        {data.map((item, i) => {
          const show = data.length <= 7 || i % 2 === 0 || i === data.length - 1;
          return (
            <View key={i} style={styles.labelCell}>
              <Text
                style={[
                  typography.small,
                  {
                    color: activeIdx === i ? color : colors.textTertiary,
                    fontSize: 9,
                    fontWeight: activeIdx === i ? '700' : '400',
                    opacity: show ? 1 : 0,
                  },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  minMaxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  labelsRow: { flexDirection: 'row', marginTop: 4 },
  labelCell: { flex: 1, alignItems: 'center' },
  tooltip: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    // Center the tooltip on its x anchor — react-native supports negative
    // translateX values on transform; this works on both iOS and Android.
    transform: [{ translateX: -40 }],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
    }),
  },
  tooltipText: { fontSize: 10, fontWeight: '600' },
});
