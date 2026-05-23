#!/usr/bin/env python3
"""
split-knowledge-helpers.py — split the 73K-line knowledgeHelpers.ts
into topic files under src/ai/knowledge-topics/.

Strategy:
  1. Parse knowledgeHelpers.ts top-level decls (functions, consts,
     types, interfaces, enums).
  2. Classify each by name into one of N topics (regex against the
     declared symbol name).
  3. Write per-topic files preserving the original header imports.
  4. Rewrite knowledgeHelpers.ts as a barrel that re-exports from
     every topic file, so existing callers (`import { X } from
     '../ai/knowledgeHelpers'`) keep resolving without changes.

Conservative classification — unknown names go into `misc.ts` rather
than getting force-fit into a tangentially-related topic.

Idempotent: re-running rewrites the topic files from the same input.
After the first successful run, knowledgeHelpers.ts is the barrel —
re-running this script would have nothing to split. Safe by accident.
"""

from __future__ import annotations
import re
import sys
from pathlib import Path
from collections import defaultdict

SERVER = Path(r"C:/Users/sevka/Desktop/1223/work/iron-gym/server")
SRC = SERVER / "src/ai/knowledgeHelpers.ts"
OUT_DIR = SERVER / "src/ai/knowledge-topics"

# Topic regex — matched against the DECL NAME (function/const/etc).
# Order matters: first match wins, so list more specific topics first.
TOPIC_RULES: list[tuple[str, re.Pattern]] = [
    ("womens",       re.compile(r"women|female|menstrual|pregnan|menopaus|estrogen|ovulat|menarch", re.I)),
    ("youth",        re.compile(r"youth|kid|teen|child|adolesc|junior", re.I)),
    ("senior",       re.compile(r"senior|elderly|aging|geriatric", re.I)),
    ("sleep",        re.compile(r"sleep|hrv|rem|nap|insomnia|circadian|dream|snore|melaton", re.I)),
    ("supplements",  re.compile(r"supplement|creatine|vitamin|electrolyte|caffeine|coffee|bcaa|omega|magnesium|zinc|iron|protein.*powder|whey|casein|nootropic|adaptogen|preworkout|collagen|fish.*oil|probioti", re.I)),
    ("nutrition",    re.compile(r"nutrition|meal|calor|protein|carb|fat|food|water|hydration|diet|macro|fiber|sugar|salt|alcohol|fasting|keto|vegan|vegetarian|bulk|cut|deficit|surplus|recipe|cook|kitchen|grocer", re.I)),
    ("cardio",       re.compile(r"cardio|endur|run|cycl|hiit|aerob|vo2|interval|jogging|swim|rowing|elliptical|treadmill|metabol", re.I)),
    ("injury",       re.compile(r"injur|mobility|posture|joint|pain|rehab|strain|sprain|tear|tendon|sciat|hernia|impinge|shoulder|knee.*pain|back.*pain|wrist|elbow|ankle|hip.*pain|neck|lumbar|cervical|orthop", re.I)),
    ("mindset",      re.compile(r"mental|mindset|motiv|habit|anxiety|stress|burnout|focus|discipline|consistent|adherence|mood|depress|panic|conf(idence|ession)|self.*esteem|gratitude|mindful|meditation", re.I)),
    ("recovery",     re.compile(r"recovery|deload|fatigue|overtrain|massage|foam.*roll|stretch|cooldown|active.*rest|sauna|cold|ice|heat", re.I)),
    ("physiology",   re.compile(r"physiol|fascia|fiber|nerve|metabol|atp|glycogen|lactate|hormone|testosterone|cortisol|insulin|growth.*hormone|epoc|emg|biomech|kinematic", re.I)),
    ("equipment",    re.compile(r"equipment|band|kettlebell|machine|barbell|dumbbell|cable|trx|sled|rope|chain|mat|ball|foam.*roll|home.*gym|garage.*gym", re.I)),
    ("training",     re.compile(r"workout|train|exercise|rep|set|weight|periodiz|technique|tempo|superset|warmup|lift|press|squat|deadlift|pull|push|bench|row|curl|extension|fly|raise|crunch|plank|burpee|lunge|split|program|routine|progression|overload|plateau|rpe|rir|1rm|hypertrophy|powerlifting|crossfit|olympic|calisthenic|bodyweight|strength", re.I)),
    ("safety",       re.compile(r"safety|medical|contraindic|warning|caution|risk|emergenc|injury.*prevent", re.I)),
    ("progression",  re.compile(r"beginner|intermed|advanced|expert|level|grade|tier|standard", re.I)),
    ("performance",  re.compile(r"perform|sport|athlet|competit|marathon|tournament|fight|combat|boxing|mma|football|basket|soccer|tennis", re.I)),
    ("gamification", re.compile(r"gamific|streak|badge|achievement|milestone|reward|leaderboard|celebrat|congratul|pr.*record", re.I)),
    ("analytics",    re.compile(r"analy[sz]e|estimat|calculat|comput|measur|assess|evaluat|track|monitor|trend|chart|graph", re.I)),
    ("context",      re.compile(r"^(?:build|detect|infer|generate)(?:Context|Directive|Tip|Hint|Note|Reminder)", re.I)),
]
DEFAULT_TOPIC = "misc"


def find_decls(lines: list[str]) -> list[tuple[int, int, str, str]]:
    """Find every top-level decl. Returns (start, end, name, kind)."""
    out: list[tuple[int, int, str, str]] = []
    i = 0
    decl_re = re.compile(
        r"^(?:export\s+)?(function|const|let|var|type|interface|enum|class|abstract\s+class)\s+([A-Za-z_][\w]*)"
    )
    while i < len(lines):
        m = decl_re.match(lines[i])
        if not m:
            i += 1
            continue
        kind = m.group(1).split()[-1]  # "abstract class" → "class"
        name = m.group(2)
        start = i
        if lines[i].rstrip().endswith(";"):
            out.append((start, start, name, kind))
            i += 1
            continue
        # Multi-line — scan to closing brace at column 0
        end = start + 1
        while end < len(lines):
            l = lines[end]
            if l == "}" or l == "};" or l == "} as const;":
                break
            end += 1
        if end >= len(lines):
            out.append((start, start, name, kind))
            i += 1
            continue
        out.append((start, end, name, kind))
        i = end + 1
    return out


def attach_comment(lines: list[str], start: int) -> int:
    j = start - 1
    if j < 0 or not lines[j].rstrip().endswith("*/"):
        return start
    k = j
    while k >= 0:
        if lines[k].lstrip().startswith("/**"):
            return k
        k -= 1
    return start


def classify(name: str) -> str:
    for topic, pattern in TOPIC_RULES:
        if pattern.search(name):
            return topic
    return DEFAULT_TOPIC


HEADER_TEMPLATE = '''/**
 * knowledge-topics/{topic}.ts — auto-split from knowledgeHelpers.ts
 * (audit R-2026-05-22 Tier 1 item 4).
 *
 * Every decl here was originally inline in routes/ai.ts, then bulk-
 * extracted to knowledgeHelpers.ts, and now grouped by topic via name
 * regex. Logic byte-identical to the original.
 *
 * To re-split: run `python scripts/split-knowledge-helpers.py` from
 * the server/ directory. The barrel `../knowledgeHelpers.ts` re-exports
 * every topic file so callers don't need to change imports.
 */
import {{ logger }} from '../../utils/logger';
import {{ sanitizeForPrompt }} from '../../utils/inputSanitizer';
import type {{ DeepSeekMessage }} from '../../services/deepseekAI';
import type {{ GamificationData }} from '../../routes/ai';

'''


def main() -> None:
    if not SRC.exists():
        print(f"Source not found: {SRC}")
        sys.exit(1)
    content = SRC.read_text(encoding="utf-8")
    lines = content.split("\n")
    decls = find_decls(lines)
    print(f"Top-level decls in knowledgeHelpers.ts: {len(decls)}")

    # Group by topic. Each entry: list of (chunk_start, chunk_end).
    by_topic: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
    for (start, end, name, _kind) in decls:
        topic = classify(name)
        chunk_start = attach_comment(lines, start)
        by_topic[topic].append((chunk_start, end, name))

    print(f"\nDistribution across {len(by_topic)} topics:")
    for topic, entries in sorted(by_topic.items(), key=lambda x: -len(x[1])):
        print(f"  {topic:15s} {len(entries):5d} decls")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Write each topic file. Track which line indices are covered.
    all_covered: set[int] = set()
    written_files: list[str] = []
    for topic, entries in by_topic.items():
        chunks = []
        for (cs, ce, _name) in entries:
            chunks.append("\n".join(lines[cs : ce + 1]))
            for k in range(cs, ce + 1):
                all_covered.add(k)
        topic_file = OUT_DIR / f"{topic}.ts"
        topic_file.write_text(
            HEADER_TEMPLATE.format(topic=topic) + "\n".join(chunks) + "\n",
            encoding="utf-8",
        )
        written_files.append(topic)

    # Rewrite knowledgeHelpers.ts as a barrel.
    barrel_lines = [
        "/**",
        " * knowledgeHelpers.ts — barrel for the topic-split knowledge layer.",
        " *",
        " * The actual decls live in `./knowledge-topics/<topic>.ts`. This file",
        " * just re-exports them so existing callers",
        " *   `import { X } from '../ai/knowledgeHelpers'`",
        " * keep resolving without per-call-site rewrites.",
        " *",
        " * Audit R-2026-05-22 Tier 1 item 4: split this barrel was originally",
        " * 73 410 lines of inline prose; now navigation jumps directly to the",
        " * topic file.",
        " */",
        "",
    ]
    for topic in sorted(written_files):
        barrel_lines.append(f"export * from './knowledge-topics/{topic}';")
    barrel_lines.append("")

    SRC.write_text("\n".join(barrel_lines), encoding="utf-8")

    # Sanity: lines not covered should only be header/imports/blanks/comments.
    uncovered = [
        (i, l) for i, l in enumerate(lines) if i not in all_covered
    ]
    non_trivial_uncovered = [
        (i, l) for (i, l) in uncovered
        if l.strip()
        and not l.lstrip().startswith(("//", "*", "/*"))
        and not l.startswith("import ")
        and not l.startswith("export ")
    ]
    if non_trivial_uncovered:
        print(f"\nWARN: {len(non_trivial_uncovered)} non-trivial lines uncovered (first 10):")
        for (i, l) in non_trivial_uncovered[:10]:
            print(f"  L{i+1}: {l[:80]}")

    print(f"\nWrote {len(written_files)} topic files in {OUT_DIR}")
    print(f"Barrel knowledgeHelpers.ts now {sum(1 for _ in SRC.open('r', encoding='utf-8'))} lines")


if __name__ == "__main__":
    main()
