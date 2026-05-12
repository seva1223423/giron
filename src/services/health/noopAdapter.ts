/**
 * No-op adapter — fallback for platforms without a real provider.
 *
 * Used on web (jest) and as the iOS placeholder until Phase C wires
 * `@kingstinct/react-native-healthkit`. Returns "unavailable" for
 * every check so the UI surfaces an empty state instead of crashing.
 */
import type { HealthDataProvider, HealthScope } from './types';

export const noopAdapter: HealthDataProvider = {
  kind: 'healthconnect',
  async isAvailable() { return false; },
  async requestPermissions(scopes) {
    const out: Record<HealthScope, boolean> = {} as any;
    for (const s of scopes) out[s] = false;
    return out;
  },
  async getGrantedScopes() {
    return {} as Record<HealthScope, boolean>;
  },
  async pullSince() {
    return { cardio: [], sleep: [], samples: [] };
  },
};
