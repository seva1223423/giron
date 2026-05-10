"""Print all 23 generator step templates for round-238 quality pass."""
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

src = open('prisma/seed-recipes.ts', encoding='utf-8').read()
gen_section = src[src.find('GENERATED.push'):]
headers = [(m.start(), m.group(1), m.group(2)) for m in re.finditer(r"//\s*(\d+)\.\s*([^\n]+)\n", gen_section)]
positions = [m.start() for m in re.finditer(r"\bGENERATED\.push\s*\(\s*\{", gen_section)]

seen = set()
for pos in positions:
    h = max((h for h in headers if h[0] < pos), default=None, key=lambda x: x[0])
    if not h:
        continue
    num = h[1]
    if num in seen:
        continue
    seen.add(num)
    block_end = gen_section.find('});', pos)
    block = gen_section[pos:block_end + 3]
    sm = re.search(r"steps:\s*\[([\s\S]*?)\]", block)
    if not sm:
        continue
    raw = sm.group(1)
    items = re.findall(r"[`']([^`']+)[`']", raw)
    print(f'\n=== Gen {num}: {h[2].strip()}')
    for s in items:
        print(f'   - {s}')
