/**
 * Inline chat-widget descriptors (design ai-chat-pro block 2).
 *
 * When a local command (water / set-weight / meal-kcal / summary) is handled,
 * the handler can attach a small visual widget to the assistant bubble that
 * confirms the change — a progress bar, a before→after diff, a cup grid.
 * Pure data; the renderer lives in components/ChatWidgets.tsx.
 *
 * Wiring without breaking the `tryHandleCommand(): boolean` contract that 99
 * unit tests pin: handlers call `emitChatWidget(w)` as a side effect, and
 * AIChatScreen calls `drainChatWidget()` right after `tryHandle` returns true.
 * Same one-shot-capture idea as flashBus, but pull-based so the screen owns
 * when the assistant bubble is created. Tests never drain, so the emit is an
 * inert side effect for them.
 *
 * Only widgets that have a REAL local-command trigger exist here. The
 * prototype's PlanCard is intentionally omitted — our parser has no
 * "build a workout" local command, so a plan widget would be dead UI.
 */

export type ChatWidget =
  | {
      kind: 'summary';
      water: { got: number; target: number };       // ml
      protein: { got: number; target: number };     // g
      setsDone: number;
    }
  | {
      kind: 'diff';
      title: string;
      label: string;
      before: number;
      after: number;
      unit: string;
    }
  | { kind: 'water'; got: number; target: number }   // ml
  | { kind: 'macro'; protein: number; target: number }; // g

/** Short assistant text shown above the widget bubble. Optional per emit. */
export interface PendingChatWidget {
  text: string;
  widget: ChatWidget;
}

let pending: PendingChatWidget | null = null;

/** Called by a command handler to attach a widget to the next assistant
 *  bubble. Last write wins (a single command emits at most one widget). */
export function emitChatWidget(text: string, widget: ChatWidget): void {
  pending = { text, widget };
}

/** Called by AIChatScreen after tryHandle() returns true. Returns the pending
 *  widget (if any) and clears it so it attaches to exactly one bubble. */
export function drainChatWidget(): PendingChatWidget | null {
  const w = pending;
  pending = null;
  return w;
}
