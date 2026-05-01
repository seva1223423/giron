import { useEffect, useState, useMemo } from 'react';
import { Dimensions, ScaledSize } from 'react-native';
import { buildResponsiveInfo, ResponsiveInfo } from '../theme/responsive';
import { useDensityStore } from '../store/useDensityStore';

/**
 * Reactive responsive info — re-renders on rotate, resize, foldable open/close,
 * and accessibility text-size changes.
 *
 * Use this on every screen and component that needs to adapt:
 *
 *   const r = useResponsive();
 *   const fontSize = r.pick({ xs: 14, sm: 15, md: 16, tablet: 18 });
 *   const cols = r.cols({ tablet: 2, desktop: 3 });
 *   if (r.isShort) return <CompactLayout/>;
 *   const buttonHeight = r.scale(48);
 */
export function useResponsive(): ResponsiveInfo {
  const density = useDensityStore((s) => s.density);
  const [win, setWin] = useState<ScaledSize>(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWin(window);
    });
    return () => sub.remove();
  }, []);

  return useMemo(() => buildResponsiveInfo(win, density), [win, density]);
}
