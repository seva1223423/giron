/**
 * knowledgeHelpers.ts — barrel for the topic-split knowledge layer.
 *
 * The actual decls live in `./knowledge-topics/<topic>.ts`. This file
 * just re-exports them so existing callers
 *   `import { X } from '../ai/knowledgeHelpers'`
 * keep resolving without per-call-site rewrites.
 *
 * Audit R-2026-05-22 Tier 1 item 4: split this barrel was originally
 * 73 410 lines of inline prose; now navigation jumps directly to the
 * topic file.
 */

export * from './knowledge-topics/analytics';
export * from './knowledge-topics/cardio';
export * from './knowledge-topics/context';
export * from './knowledge-topics/equipment';
export * from './knowledge-topics/gamification';
export * from './knowledge-topics/injury';
export * from './knowledge-topics/mindset';
export * from './knowledge-topics/misc';
export * from './knowledge-topics/nutrition';
export * from './knowledge-topics/performance';
export * from './knowledge-topics/physiology';
export * from './knowledge-topics/progression';
export * from './knowledge-topics/recovery';
export * from './knowledge-topics/safety';
export * from './knowledge-topics/senior';
export * from './knowledge-topics/sleep';
export * from './knowledge-topics/supplements';
export * from './knowledge-topics/training';
export * from './knowledge-topics/womens';
export * from './knowledge-topics/youth';
