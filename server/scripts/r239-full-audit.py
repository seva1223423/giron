"""Round-239 full catalog audit. Reports:
1. Hand-written + generator counts (total catalog size)
2. Goal × Meal-Type matrix (where are gaps?)
3. High-protein coverage per cell
4. Allergen variety (vegan/lactose-free/gluten-free counts)
5. Quality of step explanations (avg length, no-time-no-temp)
6. Duplicate name detection across hand-written and generators
7. KBJU sanity: gain ≥500 kcal? weight-loss ≤400 kcal?
"""
from __future__ import annotations
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

src = open('prisma/seed-recipes.ts', encoding='utf-8').read()

# ─── Parse hand-written recipes (one block each) ─────────────────────────────
hw_body_match = re.search(r"const RECIPES: SeedRecipe\[\] = \[(.+?)\n\];\n", src, re.DOTALL)
assert hw_body_match
hw_body = hw_body_match.group(1)

# A more forgiving pattern for the whole recipe block — id...next id sentinel.
block_re = re.compile(
    r"\{\s*\n?\s*id:\s*'(crecipe[a-z0-9]+)',\s*"
    r"name:\s*'([^']+)',[\s\S]*?"
    r"ingredients:\s*\[([\s\S]*?)\],[\s\S]*?"
    r"steps:\s*\[([\s\S]*?)\],[\s\S]*?"
    r"tags:\s*\[([^\]]+)\][\s\S]*?"
    r"allergens:\s*\[([^\]]*)\]",
)

hand_written = []
for m in block_re.finditer(hw_body):
    rid, name, ings_raw, steps_raw, tags_raw, allergens_raw = m.groups()
    tags = [t.strip().strip("'\"") for t in tags_raw.split(',') if t.strip()]
    allergens = [a.strip().strip("'\"") for a in allergens_raw.split(',') if a.strip()]
    steps = re.findall(r"[`']([^`']+)[`']", steps_raw)
    # Compute calories from ingredients
    calories = sum(int(c) for c in re.findall(r"calories:\s*(\d+)", ings_raw))
    protein = sum(float(p) for p in re.findall(r"protein:\s*([\d.]+)", ings_raw))
    hand_written.append({
        'id': rid, 'name': name, 'tags': tags, 'allergens': allergens,
        'steps_count': len(steps), 'calories': calories, 'protein': protein,
    })

print(f'═══════════════════════════════════════════════════════════════════════')
print(f'  ROUND-239 CATALOG AUDIT')
print(f'═══════════════════════════════════════════════════════════════════════')
print(f'\n■ TOTALS')
print(f'  Hand-written recipes: {len(hand_written)}')

# Estimate generator output by counting their loops + caps
# (Approximate — the generator loops have `if (GENERATED.length >= N) break;`
# caps that we can't simulate precisely without running JS.)
gen_estimates = [
    ('1. Овсянки × фрукты × молоко', 50),
    ('2. Овсянки с орехами', 15),
    ('3. Каши × крупы × фрукты', 30),
    ('4. Омлеты × начинки', 40),
    ('5. Творожные завтраки', 30),
    ('6. Смузи', 50),
    ('7. Белковые шейки', 25),
    ('8. Белковые обеды/ужины', 120),
    ('9. Салаты', 50),
    ('10. Боулы', 80),
    ('11. Лаваши/wraps', 30),
    ('12. Паста', 30),
    ('13. Супы', 30),
    ('14. Рагу', 25),
    ('15. Запечённые', 30),
    ('16. Тосты', 30),
    ('17. Фрукты+орехи', 30),
    ('18. Йогурт чаши', 30),
    ('19. Шарики', 10),
    ('20. Плов', 15),
    ('21. Котлеты', 25),
    ('22. Блины и сырники', 15),
    ('23. Хумус', 10),
]
gen_total = sum(n for _, n in gen_estimates)
print(f'  Generated (template-driven, estimated): ~{gen_total}')
print(f'  Catalog total (estimated):          ~{len(hand_written) + gen_total}')

# ─── Hand-written matrix: goal × meal ─────────────────────────────────────────
GOALS = ['weight-loss', 'maintain', 'gain']
MEALS = ['breakfast', 'lunch', 'dinner', 'snack']

matrix = defaultdict(lambda: defaultdict(list))
hp_matrix = defaultdict(lambda: defaultdict(int))
notag_meal = []
notag_goal = []
for r in hand_written:
    g = next((t for t in r['tags'] if t in GOALS), None)
    m = next((t for t in r['tags'] if t in MEALS), None)
    if not g: notag_goal.append(r['name'])
    if not m: notag_meal.append(r['name'])
    if g and m:
        matrix[g][m].append(r)
        if 'high-protein' in r['tags']:
            hp_matrix[g][m] += 1

print(f'\n■ HAND-WRITTEN — Goal × Meal matrix (★ = high-protein)')
print(f'  {"":15} {"breakfast":>11} {"lunch":>8} {"dinner":>8} {"snack":>8} {"total":>7}')
for g in GOALS:
    row = []
    total_g = 0
    for m in MEALS:
        n = len(matrix[g][m])
        hp = hp_matrix[g][m]
        cell = f'{n}(★{hp})' if hp else f'{n}'
        row.append(f'{cell:>11}')
        total_g += n
    print(f'  {g:15} {row[0]:>11} {row[1]:>8} {row[2]:>8} {row[3]:>8} {total_g:>7}')

# Per cell totals
totals_meal = {m: sum(len(matrix[g][m]) for g in GOALS) for m in MEALS}
total_all = sum(totals_meal.values())
print(f'  {"TOTAL":15} {totals_meal["breakfast"]:>11} {totals_meal["lunch"]:>8} {totals_meal["dinner"]:>8} {totals_meal["snack"]:>8} {total_all:>7}')

# ─── Gaps: thin cells (n < 5) ─────────────────────────────────────────────────
print(f'\n■ GAPS — cells with <5 hand-written recipes')
for g in GOALS:
    for m in MEALS:
        n = len(matrix[g][m])
        if n < 5:
            print(f'  ◇ {g} × {m}: only {n}')

# ─── Quality of steps ─────────────────────────────────────────────────────────
short = [r for r in hand_written if r['steps_count'] <= 2]
print(f'\n■ STEP QUALITY')
print(f'  ≤2 steps:  {len(short)}')
print(f'  3-4 steps: {sum(1 for r in hand_written if 3 <= r["steps_count"] <= 4)}')
print(f'  5+ steps:  {sum(1 for r in hand_written if r["steps_count"] >= 5)}')
print(f'  Avg:       {sum(r["steps_count"] for r in hand_written)/len(hand_written):.1f}')

# ─── KBJU sanity ──────────────────────────────────────────────────────────────
print(f'\n■ KBJU SANITY')
gain_low_cal = [r for r in hand_written if 'gain' in r['tags'] and r['calories'] < 400]
wl_high_cal = [r for r in hand_written if 'weight-loss' in r['tags'] and r['calories'] > 500]
hp_low_protein = [r for r in hand_written if 'high-protein' in r['tags'] and r['protein'] < 20]
print(f'  Tagged "gain" but <400 kcal:        {len(gain_low_cal)}')
for r in gain_low_cal[:5]: print(f'    - {r["name"]} ({r["calories"]} kcal)')
print(f'  Tagged "weight-loss" but >500 kcal: {len(wl_high_cal)}')
for r in wl_high_cal[:5]: print(f'    - {r["name"]} ({r["calories"]} kcal)')
print(f'  Tagged "high-protein" but <20g:     {len(hp_low_protein)}')
for r in hp_low_protein[:5]: print(f'    - {r["name"]} ({r["protein"]:.1f}g protein)')

# ─── Duplicate names (within hand-written) ────────────────────────────────────
print(f'\n■ DUPLICATE NAMES')
names = defaultdict(list)
for r in hand_written:
    names[r['name']].append(r['id'])
dupes = {n: ids for n, ids in names.items() if len(ids) > 1}
if dupes:
    for n, ids in dupes.items():
        print(f'  ◆ "{n}" → {ids}')
else:
    print(f'  None.')

# ─── Allergen coverage (free-from options) ────────────────────────────────────
print(f'\n■ ALLERGEN-FREE OPTIONS')
gluten_free = sum(1 for r in hand_written if 'gluten' not in r['allergens'])
lactose_free = sum(1 for r in hand_written if 'lactose' not in r['allergens'])
eggs_free = sum(1 for r in hand_written if 'eggs' not in r['allergens'])
no_allergen = sum(1 for r in hand_written if not r['allergens'])
print(f'  Gluten-free:  {gluten_free} ({round(100*gluten_free/len(hand_written))}%)')
print(f'  Lactose-free: {lactose_free} ({round(100*lactose_free/len(hand_written))}%)')
print(f'  Egg-free:     {eggs_free} ({round(100*eggs_free/len(hand_written))}%)')
print(f'  Allergen-free entirely: {no_allergen} ({round(100*no_allergen/len(hand_written))}%)')

# ─── Tag hygiene ──────────────────────────────────────────────────────────────
print(f'\n■ TAG HYGIENE')
print(f'  Recipes without goal-tag:   {len(notag_goal)}')
for n in notag_goal[:5]: print(f'    - {n}')
print(f'  Recipes without meal-tag:   {len(notag_meal)}')
for n in notag_meal[:5]: print(f'    - {n}')
