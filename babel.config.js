// babel.config.js
//
// Expo apps normally need NO babel.config.js — the implicit default is exactly
// `{ presets: ['babel-preset-expo'] }` (the preset auto-adds the reanimated /
// worklets plugin when the package is installed). We add this single file for
// ONE reason: enable `unstable_transformImportMeta` so the app can run in a
// browser (Expo web / Claude Preview pane).
//
// THE BUG IT FIXES
//   Several deps emit raw `import.meta`:
//     • zustand devtools   → `import.meta.env.MODE`
//     • @sentry/browser    → `import.meta.url`
//     • expo's own ImportMetaRegistry
//   `expo start --web` (SDK 54 / RN 0.81) bundles with the Hermes transform
//   profile, under which babel-preset-expo does NOT downlevel `import.meta`
//   (Hermes supports it natively). But the web bundle is served as a classic
//   `<script>`, where `import.meta` is a hard SyntaxError — so the entire
//   ~19 MB bundle fails to PARSE, Metro's runtime never installs, React never
//   mounts, and the page renders blank with no console error.
//
//   `unstable_transformImportMeta: true` makes babel-preset-expo rewrite
//   `import.meta` → `globalThis.__ExpoImportMetaRegistry` (a runtime Expo
//   already ships and initializes per-platform), which is browser-safe.
//   babel-preset-expo's own error message recommends this exact flag.
//
// WHY IT'S SAFE FOR NATIVE (Android / iOS / EAS / APK)
//   Without this flag, babel-preset-expo THROWS at build time if it encounters
//   `import.meta` on a non-web platform. Native builds currently succeed, which
//   proves the native module graph contains ZERO `import.meta` (the web-only
//   builds of zustand-devtools / @sentry/browser aren't resolved on native).
//   So on native the transform has nothing to rewrite → it is a no-op →
//   native bundles are byte-for-byte identical to before. Leaving the flag
//   unconditional (rather than platform-gating it) keeps this config simple and
//   avoids babel caller/cache edge-cases, with no native cost.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
