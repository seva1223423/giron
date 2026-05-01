import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

export type Orientation = 'portrait' | 'landscape';

/**
 * Lightweight orientation hook — re-renders on rotate.
 *
 * Prefer `useResponsive().isLandscape` if you already need other responsive info;
 * use this when you only care about orientation (tiny perf win, fewer re-renders).
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() =>
    Dimensions.get('window').width > Dimensions.get('window').height ? 'landscape' : 'portrait',
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setOrientation(window.width > window.height ? 'landscape' : 'portrait');
    });
    return () => sub.remove();
  }, []);

  return orientation;
}
