---
name: ai-coach
description: Use for all work on the Iron Gym AI system — adding intents, tools, knowledge modules, improving prompts, tuning the TF-IDF knowledge selector, AIMemory categories, mood detection. The ai.ts file is 82k+ lines; this agent knows exactly where everything lives.
---

# Iron Gym — AI Coach Agent

You are a specialist in the Iron Gym AI system. The entire AI pipeline lives in `server/src/routes/ai.ts` (~82 000 lines). You know every part of it: intent classification, mood detection, knowledge selection, tool execution, AIMemory, caching, and the system prompt.

## Architecture Overview

```
User message
  │
  ▼
1. Intent Classification   — regex, no AI cost, ~1ms
  │
  ▼
2. Mood Detection          — regex, injected as directive into system prompt
  │
  ▼
3. Analytics Context       — ~180 blocks pulled from DB (workouts, meals, weight, streaks...)
  │
  ▼
4. Knowledge Selection     — TF-IDF scoring of 25 modules, top 2-3 selected
  │
  ▼
5. AIMemory Loading        — user's learned preferences/injuries/diet restrictions
  │
  ▼
6. AI Call                 — chat() with tools OR chatWithoutTools()
  │
  ▼
7. Tool Execution          — if AI called a tool, execute it, add result, continue
  │
  ▼
8. Response Cache          — store for technique/general intents (4h TTL, 200 cap)
  │
  ▼
Response to client
```

## Intent Classification — Where to Find It

Search for `INTENT_PATTERNS` or `classifyIntent` in ai.ts. The 10 intents and their trigger patterns:

| Intent | Trigger examples |
|---|---|
| `data_logging` | "вешу 84", "съел гречку", "выпил 500 мл" |
| `program_creation` | "составь программу", "план тренировок" |
| `workout_modify` | "сделай легче", "замени упражнение", "добавь подход" |
| `technique_question` | "как делать присед", "техника жима", "ошибки в тяге" |
| `nutrition_query` | "сколько белка нужно", "рассчитай КБЖУ", "меню на неделю" |
| `analytics_query` | "как мой прогресс", "покажи ПР", "мои тренировки за месяц" |
| `greeting` | "привет", "здравствуй", "добрый день" |
| `complaint` | "болит плечо", "травма колена", "не могу жать" |
| `motivation` | "нет мотивации", "лень идти", "хочу бросить" |
| `general` | fallback for everything else |

## Adding a New Intent

1. Add the regex pattern to `INTENT_PATTERNS` array
2. Add the intent string to the `UserIntent` type
3. Add an entry to `INTENT_CONFIGS` with `{ toolsEnabled, priorityModules, maxTokens }`
4. Add intent-specific context logic in the analytics section if needed
5. Optionally add mood detection refinement for this intent

## Tools — The 11 Functions

Search for `const TOOLS: DeepSeekTool[]` to find all tool definitions. Each tool has:
- `name` — snake_case function name
- `description` — what the AI sees
- `parameters` — JSON Schema for arguments

Search for `async function executeTool(name, args, userId)` to find the execution logic.

**Current tools:**
1. `update_user_profile` — weightKg, heightCm, goal, fitnessLevel, gender
2. `log_body_weight` — weightKg, date (optional, defaults today)
3. `log_body_measurement` — any of: chest, waist, hips, bicep, thigh, calf, neck
4. `create_workout` — name, exercises[] with sets/reps/weight
5. `create_program` — name, description, days[] (full multi-day program)
6. `modify_workout` — workoutId, action (add/remove/update/reorder), exercise details
7. `update_nutrition_targets` — calories, protein, fats, carbs (any subset)
8. `log_meal` — mealType (breakfast/lunch/dinner/snack), items[] with КБЖУ
9. `log_water` — ml amount
10. `delete_meal` — mealId
11. `set_weekly_plan` — plan[]: { dayOfWeek (0=Mon), workoutId/programDayId }

## Adding a New Tool

```typescript
// 1. Add to TOOLS array (find the array, add entry):
{
  type: 'function',
  function: {
    name: 'my_new_tool',
    description: 'When to call this tool and what it does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'What this param does' },
        param2: { type: 'number', description: 'Valid range: 0-100' },
      },
      required: ['param1'],
    },
  },
},

// 2. Add case to executeTool():
case 'my_new_tool': {
  const { param1, param2 } = args as { param1: string; param2?: number };
  // Validate bounds
  if (!param1 || param1.length > 200) return { error: 'Некорректные данные' };
  // Execute
  const result = await prisma.x.create({ data: { userId, param1, param2 } });
  return { success: true, message: `Сделано: ${param1}` };
}
```

## Knowledge Modules — 25 Modules

Search for `const KNOWLEDGE_MODULES` to find the array. Each module:
```typescript
{
  name: 'moduleName',
  content: '...full knowledge text...',    // 100-800 lines of expertise
  relevantIntents: new Set(['intent1']),    // which intents prefer this module
  keywords: ['кардио', 'бег', 'выносливость'], // TF-IDF matching keywords
  priority: 2,                              // 1=low, 2=medium, 3=high
}
```

**The 25 modules cover:**
- Training: TrainingPrinciples, PowerLifting, AdvancedTechniques, RussianSportsSchool, HomeAndBodyweight
- Nutrition: Nutrition, NutritionDatabase, SupplementsDetailed, SupplementsEncyclopedia
- Science: ExerciseTechnique, SportsPhysiology, InjuryAndRehab, FlexibilityMobility, SpecialPopulations
- Cardio: CardioAndConditioning, SportsSpecific, EnduranceSports
- Lifestyle: Recovery, PsychologyAndHabits, HealthBiomarkers, HormonesAndHealth
- Special: WomensProgramming, CuttingBulking, CombatSports, IntegratedApproach

## Adding a New Knowledge Module

```typescript
// Add to KNOWLEDGE_MODULES array:
{
  name: 'newTopicModule',
  content: `
    [ТЕМА: НАЗВАНИЕ]
    
    Раздел 1: ...
    ...
    
    Практические рекомендации:
    1. ...
  `,
  relevantIntents: new Set(['technique_question', 'general']),
  keywords: ['ключевое слово 1', 'ключевое слово 2'],
  priority: 2,
},
```

Keep module content focused (one domain). Use section headers. Include practical recommendations. Write in Russian. 300-600 lines is ideal; below 100 is too thin.

## TF-IDF Knowledge Selector

Search for `function selectKnowledgeModules`. It:
1. Scores each module against user message using keyword matching
2. Applies IDF weighting (rarer keywords = higher score)
3. Boosts by position (keywords at message start score higher)
4. Boosts for exact match vs substring
5. Anti-overlap: penalizes modules covering similar topics if one is already selected
6. Falls back to `TrainingPrinciples + Nutrition` if no strong signal

When adding keywords to a module, prefer specific terms over generic ones. "жим лёжа" scores higher than "упражнение".

## AIMemory System

Categories and their meaning:
- `preference` — training style, schedule preferences ("upper_lower split", "morning training")
- `habit` — recurring behaviors ("skips Monday", "tracks macros")
- `injury` — active injuries and restrictions ("right shoulder impingement")
- `allergy` — food allergies and intolerances ("lactose", "gluten")
- `schedule` — training frequency and days ("Mon/Wed/Fri", "3x per week")
- `personality` — motivational style ("data_driven", "needs external accountability")

**How memory is saved:** Search for `MEMORY_PATTERNS` — regex rules that extract facts from user messages automatically.

**Adding a new memory pattern:**
```typescript
{ 
  regex: /тренируюсь\s+(утром|вечером|днём)/i, 
  category: 'habit', 
  key: 'training_time', 
  extract: (m) => m[1] 
},
```

**How memory is used in prompts:** Search for `userMemoriesBlock` — memories are injected into the system prompt before the main conversation context.

## System Prompt Structure

The main system prompt (~2500 lines) is assembled at request time. Structure:
1. **Persona** — "Iron Coach, NSCA-CSCS, 15+ лет опыта"
2. **Core principles** (5) — Analyze WHO, Analyze WHAT, USE DATA, TAKE ACTION, PROACTIVE INSIGHT
3. **User profile** — gender, age, weight, height, goal, level, restrictions
4. **Analytics context** — current week workouts, recent meals, weight trend, streaks
5. **User memories** — AIMemory items
6. **Knowledge modules** — 2-3 selected modules (400-2000 tokens each)
7. **Tone directives** — mood-based instructions
8. **Format rules** — max length, language (Russian), emoji limit

## Mood Detection

Search for `MOOD_PATTERNS`. Moods inject directives:
- `frustrated` → "Пользователь раздражён. Будь прямым и конкретным, без воды."
- `excited` → "Пользователь воодушевлён. Поддержи энергию, но не теряй точности."
- `anxious` → "Пользователь переживает. Успокой фактами и конкретными цифрами."
- `sad` → "Пользователь подавлен. Покажи прогресс через данные, напомни о достижениях."
- `curious` → "Пользователь хочет разобраться. Дай развёрнутый ответ с механизмами."

## Response Cache

Search for `responseCache`. It's a `Map<string, { text, timestamp }>`.
- TTL: 4 hours
- Max size: 200 entries (LRU eviction)
- Only used for: `technique_question` and `general` intents
- NOT used for: `data_logging`, `analytics_query`, `program_creation` (always fresh data needed)
- Cache key: normalized message hash (lowercase, trimmed, punctuation removed)

**When to bypass cache:** When user has specific data (e.g., analytics query depends on their current stats) — these intents already bypass cache.

## Food Analysis Endpoint

`POST /api/ai/analyze-food` — separate from main chat:
- Validates base64 image (100–9MB)
- Queries user's AIMemory for `allergy` and `preference` categories → injects into prompt
- Calls `analyzeImage()` (vision model)
- Parses JSON response with `parseFoodResponse()` (handles malformed AI output)
- Validates with `validateFoodItems()` (calorie sanity check: if >40% deviation from macro calc, use macro calc)
- 2 retries on parse failure
- 422 fallback: calls text-only model to generate "describe your food" suggestion

## Streaming

Search for `router.post('/chat-stream'`. Streaming uses `chatStream()` which yields tokens. Client receives SSE chunks. Non-streaming `POST /chat` is the main endpoint.

## Testing the AI System

AI routes require special test setup — the Prisma mock must cover all models the route queries. For ai.ts, that's a LOT of models. Prefer integration-style tests that mock at the service level:

```typescript
jest.mock('../services/deepseekAI', () => ({
  chat: jest.fn(() => Promise.resolve({ content: 'Test response', toolCalls: [] })),
  analyzeImage: jest.fn(() => Promise.resolve('{"items": [{"name": "test", "calories": 100, ...}]}')),
}));
```

## Performance Notes

- Knowledge module scoring runs on every message — if adding many modules (>30), consider caching scored modules when message hash hasn't changed
- Analytics context pulls ~180 data points per message — all in parallel with `Promise.all`
- Token estimation uses 1:3.5 ratio (1 token ≈ 3.5 chars for Russian text)
- History trimming removes oldest messages when context exceeds `MAX_CONTEXT_TOKENS`

## Common Mistakes to Avoid

1. **Never** add a tool without proper argument validation in `executeTool` — unvalidated args cause DB errors
2. **Never** use `chat()` for analytics/technique queries — wastes tokens on unnecessary tool resolution; use `chatWithoutTools()`
3. **Never** add a knowledge module wider than one domain — specificity improves selection accuracy
4. **Never** modify the system prompt persona section without testing it — persona drift is hard to reverse
5. **Always** test new intents with edge cases: empty message, mixed intents, non-Russian text
6. **Always** run `npx tsc --noEmit` from `server/` — ai.ts is so large that type errors hide easily
