import { TextStyle, ViewStyle, ImageStyle, StyleSheet } from 'react-native';
import { Breakpoint, ResponsiveInfo, ResponsiveValue, pickResponsive } from './responsive';

type Style = ViewStyle | TextStyle | ImageStyle;

type ResponsiveStyle<S extends Style> = {
  [K in keyof S]?: ResponsiveValue<S[K]>;
};

type StyleMap<S extends Style> = Record<string, ResponsiveStyle<S>>;

/**
 * StyleSheet.create() that understands per-breakpoint values.
 *
 *   const styles = createResponsiveStyles({
 *     card: {
 *       padding:        { xs: 12, md: 16, tablet: 24 },
 *       borderRadius:   { xs: 12, tablet: 20 },
 *       backgroundColor: '#fff', // plain values still work
 *     },
 *   });
 *
 * Then: const flat = styles(r);  // returns flat StyleSheet for current bp
 *       <View style={flat.card}/>
 */
export function createResponsiveStyles<M extends StyleMap<any>>(map: M) {
  return function applyResponsive(r: ResponsiveInfo): { [K in keyof M]: any } {
    const out: any = {};
    for (const key in map) {
      const ruleset = map[key];
      const flat: any = {};
      for (const prop in ruleset) {
        const v = (ruleset as any)[prop];
        flat[prop] = pickResponsive(v, r.bp);
      }
      out[key] = flat;
    }
    return StyleSheet.create(out);
  };
}

/**
 * Lighter alternative: pick a single responsive style at call-time.
 *
 *   <View style={rs(r, { padding: { xs: 12, tablet: 24 } })}/>
 */
export function rs<S extends Style>(r: ResponsiveInfo, style: ResponsiveStyle<S>): S {
  const out: any = {};
  for (const k in style) out[k] = pickResponsive((style as any)[k], r.bp);
  return out;
}
