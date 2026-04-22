---
description: Add a new AI tool to Iron Gym's AI coach. Argument: "tool_name description" — e.g. "log_mood Logs user's current mood/energy level (1-10)". Handles all 4 steps: TOOLS array, executeTool case, bounds validation, DB write. Verifies TypeScript clean.
---

You are adding a new AI tool to the Iron Gym AI coach system. Argument: **$ARGUMENTS**

Parse: `<tool_name>` (snake_case) and `<description>` of what the tool does.

**Before starting:** verify the tool doesn't already exist:
```bash
grep -n "name: '$ARGUMENTS'" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -5
```

The current tool count is **26**. After adding, it will be **27**.

## Step 1 — Design the Tool Schema

Think through:
- What parameters does the tool need? (always include: the data being logged/set)
- Which are required vs optional?
- What are the validation bounds? (string max length, number range, enum values)
- Which Prisma model does it write to? Does it need a userId scope?

## Step 2 — Add to TOOLS Array

Find the array with:
```bash
grep -n "const TOOLS\|name: 'update_user_profile'" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -5
```

Add the new tool definition BEFORE the closing `] as const` or `] satisfies`:
```typescript
{
  type: 'function',
  function: {
    name: '<tool_name>',
    description: 'Russian: когда AI должен вызвать этот инструмент и что именно он делает. Конкретные примеры триггеров.',
    parameters: {
      type: 'object',
      properties: {
        // Each property needs: type, description with valid range/examples
        value: { type: 'number', description: 'значение (диапазон: 1-10)' },
        note: { type: 'string', description: 'опциональный комментарий (макс. 500 символов)' },
      },
      required: ['value'],
    },
  },
},
```

## Step 3 — Add to executeTool Function

Find with:
```bash
grep -n "async function executeTool\|case 'update_user_profile'\|case 'log_sleep'" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -5
```

Add a new `case` BEFORE the `default:` case:
```typescript
case '<tool_name>': {
  const { value, note } = args as { value: number; note?: string };

  // BOUNDS VALIDATION — always required before DB call
  if (typeof value !== 'number' || value < 1 || value > 10) {
    return { error: 'Некорректное значение — ожидается число 1-10' };
  }
  if (note && note.length > 500) {
    return { error: 'Комментарий слишком длинный (макс. 500 символов)' };
  }

  // DB WRITE — always scope to userId, never trust args for ownership
  const record = await prisma.myModel.create({
    data: { userId, value, note: note ?? null },
  });

  return { success: true, message: `Записано: ${value}`, id: record.id };
}
```

**Security rules (MANDATORY):**
- `userId` comes from the route context, NEVER from `args`
- Always validate every arg before DB call
- Return `{ error: 'Russian message' }` for invalid input
- Return `{ success: true, message: 'Russian confirmation' }` on success

## Step 4 — Verification

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx tsc --noEmit 2>&1
```

Must be completely clean.

Also verify the tool appears in the array:
```bash
grep -c "name: '" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts
```

Should be 27 (was 26).

## Step 5 — Update Agent Documentation

Update the tool count in `.claude/agents/ai-coach.md`:
- Find `26 Tools` heading → change to `27 Tools`
- Add `<tool_name>` to the tools list

## Step 6 — Report

```
TOOL ADDED:
- Name: <tool_name>
- Description: <what it does>
- Parameters: <list with types>
- DB model: <Prisma model written to>
- Validation: <bounds checked>
- Tool count: 27
- TypeScript: clean
```
