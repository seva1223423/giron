# Knowledge Blocks — PoC structure

Audit R-2026-05-22 finding C1: `server/src/routes/ai.ts` holds ~1422
inline `getXxx(message)` / `getXxx(...)` helpers with knowledge-base
prose as TypeScript string literals. That accounts for ~64 000 of the
file's 87 565 lines. Result:

- `tsx watch` reloads slowly on every edit
- IDE opens drag for seconds
- Any change near `/chat` requires scrolling past tens of thousands
  of lines of unrelated text

This folder is the **destination** for the migration: each helper moves
into its own topic-grouped file, exported via a single registry, and
the `/chat` handler iterates the registry instead of ~120 explicit
`get*()` calls.

## Status

**Proof-of-concept only.** This commit ships:

- `types.ts` — the `KnowledgeBlock` interface
- `registry.ts` — array of all blocks (currently 3)
- `seasonal.ts` — extracted from `getSeasonalAdvice()` (ai.ts L16156)
- `confidence.ts` — extracted from `getConfidenceDirective()` (ai.ts L13265)
- `substitution.ts` — extracted from `getSubstitutionAdvice()` (ai.ts L13141)

The corresponding inline functions in `ai.ts` are **not yet removed**.
That migration is the next round of work — it requires verifying that
no helper closes over route-local state (`req`, `res`, `prisma`, etc.)
before move, and updating ~120 call sites in the `/chat` handler.

## Migration recipe

For each `getXxx(args): string` helper in ai.ts:

1. **Verify purity.** Grep the function body for `prisma\.`, `req`, `res`,
   `userId` (parameter is fine; closure is not). Skip helpers that aren't
   pure functions of their arguments.

2. **Pick a topic file.** Group by subject — `creatine.ts`, `deload.ts`,
   `sleep.ts`, `seasonal.ts`. New file per topic if none fits.

3. **Move the function verbatim.** Keep the signature; just relocate.

4. **Add a `KnowledgeBlock` entry to the topic file.** Each block
   declares: a stable `id`, list of `keywords` for the TF-IDF selector,
   and a `build(input)` function. The `input` shape is per-block (some
   take just `message`, others take `userMessage + history + intent`).

5. **Register in `registry.ts`.** Import the block and add to the
   array. Order doesn't matter for the registry — the existing
   `getRelevantKnowledge()` already picks the top-N by score.

6. **Replace the call site in `ai.ts`.** Remove the inline function
   definition and the explicit `getXxx(message)` call. The registry-
   driven loop in `getRelevantKnowledge()` will pick it up.

7. **Run `npm test -- ai`.** The block-level surface tests should pass
   unchanged; the snapshot of selected blocks for sample queries may
   reshuffle order — that's expected and the assertions are by set, not
   order.

## Anti-patterns to avoid

- **Don't put DB queries in a block.** Blocks are pure text builders.
  DB lookups belong in `contextEngine.ts` and pass the result in.
- **Don't import from `routes/ai.ts`.** Blocks are leaves — they
  shouldn't depend on the route. If you need a shared util, put it
  in `ai/utils/`.
- **Don't compute the same thing in two blocks.** If two blocks need
  the user's age, compute once in `contextEngine` and pass to both.
