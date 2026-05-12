/**
 * flashBus — module-level event bus for "this UI element just changed,
 * highlight it briefly" signals.
 *
 * Direction A spec (chat2.md): "Когда чат меняет данные, нужный чип
 * вспыхивает золотом — пользователь видит, что именно поменялось."
 *
 * Why a bus instead of state:
 *   The data being changed lives in Zustand stores; the UI that should
 *   flash lives in a tree branch far from the call site. Threading
 *   "lastChanged" through the store would couple animation state to
 *   data state. A tiny pub-sub keeps animation signals out-of-band.
 *
 * Usage — emitter side (e.g. useAIChatCommands):
 *   import { flashBus, flashKey } from '../../utils/flashBus';
 *   flashBus.emit(flashKey.set(exIdx, setIdx));
 *
 * Usage — listener side (e.g. CurrentWorkoutPanel chip):
 *   const [flashing, setFlashing] = useState(false);
 *   useEffect(() => flashBus.on(flashKey.set(exIdx, setIdx), () => {
 *     setFlashing(true);
 *     setTimeout(() => setFlashing(false), 900);
 *   }), [exIdx, setIdx]);
 *
 * Keys are namespaced via `flashKey.*` helpers so a typo doesn't silently
 * miss the listener.
 */

type Listener = () => void;

const listenersByKey = new Map<string, Set<Listener>>();

export const flashBus = {
  /**
   * Notify all listeners subscribed to `key`. Best-effort — if there are
   * no listeners (e.g. the chip isn't mounted), nothing happens.
   */
  emit(key: string): void {
    const set = listenersByKey.get(key);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn();
      } catch {
        // Swallow listener errors — one broken listener shouldn't kill the
        // others. The bus has no error reporting itself by design (an
        // animation cue that fails is a no-op, not a bug worth surfacing).
      }
    });
  },

  /**
   * Subscribe `listener` to `key`. Returns an unsubscribe function — call
   * it on component unmount.
   */
  on(key: string, listener: Listener): () => void {
    let set = listenersByKey.get(key);
    if (!set) {
      set = new Set();
      listenersByKey.set(key, set);
    }
    set.add(listener);
    return () => {
      const s = listenersByKey.get(key);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) listenersByKey.delete(key);
    };
  },

  /**
   * Test/cleanup helper — drop every listener. Not exported for callers,
   * but useful for jest.resetModules-style teardown.
   */
  _clear(): void {
    listenersByKey.clear();
  },
};

/**
 * Key namespace — typo-safe builders for the keys used across the app.
 * Add a helper here when you introduce a new flash signal so listeners
 * and emitters share the same source of truth.
 */
export const flashKey = {
  /** A specific set in a specific exercise just changed. */
  set: (exerciseIndex: number, setIndex: number) =>
    `set:${exerciseIndex}:${setIndex}`,
  /** The active exercise was switched (panel highlights move). */
  exerciseSwitch: () => 'exercise:switch',
  /** Water counter just changed. */
  water: () => 'nutrition:water',
};
