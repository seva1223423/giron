/**
 * Bundled video + poster assets for verified exercises.
 *
 * Videos and posters live in assets/exercise-videos/ alongside the app code
 * (same repo — no separate iron-gym-media). Each entry is a React Native
 * module id (produced by require()), which expo-video's useVideoPlayer and
 * <Image source={…} /> both accept directly.
 *
 * Keep the keys in sync with VERIFIED_INLINE_VIDEO_IDS in src/config/store.ts
 * and with scripts/whitelist-verified.json.
 *
 * Offline-first: once the APK is installed, the user has the entire demo
 * library. No network requests for playback, no rate limits, no Wikimedia
 * downtime concerns. Adds about 9 MB to the app bundle.
 */

export type VideoAssetModule = number;

export const EXERCISE_VIDEO_ASSETS: Record<string, VideoAssetModule> = {
  'arnold-press':             require('../../assets/exercise-videos/arnold-press.mp4'),
  'barbell-curl':             require('../../assets/exercise-videos/barbell-curl.mp4'),
  'barbell-row':              require('../../assets/exercise-videos/barbell-row.mp4'),
  'bench-press':              require('../../assets/exercise-videos/bench-press.mp4'),
  'burpee':                   require('../../assets/exercise-videos/burpee.mp4'),
  'chest-press-machine':      require('../../assets/exercise-videos/chest-press-machine.mp4'),
  'deadlift':                 require('../../assets/exercise-videos/deadlift.mp4'),
  'dumbbell-bench-press':     require('../../assets/exercise-videos/dumbbell-bench-press.mp4'),
  'dumbbell-row':             require('../../assets/exercise-videos/dumbbell-row.mp4'),
  'dumbbell-shoulder-press':  require('../../assets/exercise-videos/dumbbell-shoulder-press.mp4'),
  'french-press':             require('../../assets/exercise-videos/french-press.mp4'),
  'front-squat':              require('../../assets/exercise-videos/front-squat.mp4'),
  'goblet-squat':             require('../../assets/exercise-videos/goblet-squat.mp4'),
  'hack-squat':               require('../../assets/exercise-videos/hack-squat.mp4'),
  'hammer-curl':              require('../../assets/exercise-videos/hammer-curl.mp4'),
  'hanging-leg-raise':        require('../../assets/exercise-videos/hanging-leg-raise.mp4'),
  'hyperextension':           require('../../assets/exercise-videos/hyperextension.mp4'),
  'incline-bench-press':      require('../../assets/exercise-videos/incline-bench-press.mp4'),
  'jump-rope':                require('../../assets/exercise-videos/jump-rope.mp4'),
  'kettlebell-swing':         require('../../assets/exercise-videos/kettlebell-swing.mp4'),
  'lat-pulldown':             require('../../assets/exercise-videos/lat-pulldown.mp4'),
  'leg-curl':                 require('../../assets/exercise-videos/leg-curl.mp4'),
  'leg-extension':            require('../../assets/exercise-videos/leg-extension.mp4'),
  'leg-press':                require('../../assets/exercise-videos/leg-press.mp4'),
  'machine-shoulder-press':   require('../../assets/exercise-videos/machine-shoulder-press.mp4'),
  'overhead-press':           require('../../assets/exercise-videos/overhead-press.mp4'),
  'rack-pull':                require('../../assets/exercise-videos/rack-pull.mp4'),
  'reverse-crunch':           require('../../assets/exercise-videos/reverse-crunch.mp4'),
  'romanian-deadlift':        require('../../assets/exercise-videos/romanian-deadlift.mp4'),
  'squat':                    require('../../assets/exercise-videos/squat.mp4'),
  'sumo-deadlift':            require('../../assets/exercise-videos/sumo-deadlift.mp4'),
  't-bar-row':                require('../../assets/exercise-videos/t-bar-row.mp4'),
};

export const EXERCISE_POSTER_ASSETS: Record<string, VideoAssetModule> = {
  'arnold-press':             require('../../assets/exercise-videos/arnold-press.jpg'),
  'barbell-curl':             require('../../assets/exercise-videos/barbell-curl.jpg'),
  'barbell-row':              require('../../assets/exercise-videos/barbell-row.jpg'),
  'bench-press':              require('../../assets/exercise-videos/bench-press.jpg'),
  'burpee':                   require('../../assets/exercise-videos/burpee.jpg'),
  'chest-press-machine':      require('../../assets/exercise-videos/chest-press-machine.jpg'),
  'deadlift':                 require('../../assets/exercise-videos/deadlift.jpg'),
  'dumbbell-bench-press':     require('../../assets/exercise-videos/dumbbell-bench-press.jpg'),
  'dumbbell-row':             require('../../assets/exercise-videos/dumbbell-row.jpg'),
  'dumbbell-shoulder-press':  require('../../assets/exercise-videos/dumbbell-shoulder-press.jpg'),
  'french-press':             require('../../assets/exercise-videos/french-press.jpg'),
  'front-squat':              require('../../assets/exercise-videos/front-squat.jpg'),
  'goblet-squat':             require('../../assets/exercise-videos/goblet-squat.jpg'),
  'hack-squat':               require('../../assets/exercise-videos/hack-squat.jpg'),
  'hammer-curl':              require('../../assets/exercise-videos/hammer-curl.jpg'),
  'hanging-leg-raise':        require('../../assets/exercise-videos/hanging-leg-raise.jpg'),
  'hyperextension':           require('../../assets/exercise-videos/hyperextension.jpg'),
  'incline-bench-press':      require('../../assets/exercise-videos/incline-bench-press.jpg'),
  'jump-rope':                require('../../assets/exercise-videos/jump-rope.jpg'),
  'kettlebell-swing':         require('../../assets/exercise-videos/kettlebell-swing.jpg'),
  'lat-pulldown':             require('../../assets/exercise-videos/lat-pulldown.jpg'),
  'leg-curl':                 require('../../assets/exercise-videos/leg-curl.jpg'),
  'leg-extension':            require('../../assets/exercise-videos/leg-extension.jpg'),
  'leg-press':                require('../../assets/exercise-videos/leg-press.jpg'),
  'machine-shoulder-press':   require('../../assets/exercise-videos/machine-shoulder-press.jpg'),
  'overhead-press':           require('../../assets/exercise-videos/overhead-press.jpg'),
  'rack-pull':                require('../../assets/exercise-videos/rack-pull.jpg'),
  'reverse-crunch':           require('../../assets/exercise-videos/reverse-crunch.jpg'),
  'romanian-deadlift':        require('../../assets/exercise-videos/romanian-deadlift.jpg'),
  'squat':                    require('../../assets/exercise-videos/squat.jpg'),
  'sumo-deadlift':            require('../../assets/exercise-videos/sumo-deadlift.jpg'),
  't-bar-row':                require('../../assets/exercise-videos/t-bar-row.jpg'),
};
