/**
 * Persist a /chat assistant response + prune old history.
 *
 * Extracted from routes/ai.ts (audit R-2026-05-22, /chat split step 3).
 * The inline `prisma.chatMessage.create` + fire-and-forget
 * `deleteMany` lived at the bottom of the /chat handler, inside the
 * "happy path" branch. Pulling it out as a tiny helper:
 *   - lets unit tests pin the write shape (actions JSON serialisation,
 *     90d retention window)
 *   - removes one more inline prisma call from the giant route file
 *
 * SSE writing intentionally stays in the route handler — it's
 * tightly coupled to the Express `res` object and the streamMode
 * flag. This helper just persists.
 */

import { prisma } from '../db';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface PersistChatMessageInput {
  userId: string;
  /** Cleaned, validated assistant text. */
  aiContent: string;
  /** Tool actions performed during this turn (DB writes, etc.).
   *  Empty array if the turn had no tool calls. Serialised to
   *  ChatMessage.actions Json column. */
  performedActions: Array<{
    type: string;
    description: string;
    data?: Record<string, unknown>;
  }>;
}

/**
 * Save the assistant message + schedule a fire-and-forget prune of
 * messages older than 90 days. Awaits the create (caller depends on
 * the row being visible to the next request) but not the prune (caller
 * shouldn't pay for it on the hot path).
 */
export async function persistChatMessage(
  input: PersistChatMessageInput,
): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      role: 'assistant',
      content: input.aiContent,
      userId: input.userId,
      actions: input.performedActions.length > 0
        ? JSON.parse(JSON.stringify(input.performedActions))
        : undefined,
    },
  });

  // Fire-and-forget retention sweep — 90d window matches the
  // /chat history take=20 default. Errors caught + swallowed so a
  // transient DB blip doesn't fail the assistant response.
  prisma.chatMessage.deleteMany({
    where: {
      userId: input.userId,
      createdAt: { lt: new Date(Date.now() - NINETY_DAYS_MS) },
    },
  }).catch(() => {});
}

/** Exposed for tests so the retention window stays pinned in one place. */
export const _internal = { NINETY_DAYS_MS };
