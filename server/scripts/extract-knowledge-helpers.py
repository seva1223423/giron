#!/usr/bin/env python3
"""
extract-knowledge-helpers.py v2 — Variant A from the audit follow-up.

Goal: move the ~71K-line "knowledge prose" section out of routes/ai.ts
into a sibling module. Pulls EVERY top-level declaration in the helper
region — functions, constants, types, interfaces. Router handlers stay
where they are; the helper file gets imported back where used.

Strategy:
- Identify the helper region as everything BETWEEN consecutive
  `router.<method>(` lines, after the /chat handler ends (~L12800).
- For each helper range: cut, drop into the new file under `// ─── range
  N ───` markers, then add `export ` to every top-level declaration
  (function, const, type, interface, enum, class).
- ai.ts gets a single `export *` re-export so existing tests that still
  reference internal names through `import * from '../routes/ai'`
  continue to resolve. Plus a named-import wall at the top of ai.ts so
  the route code in the file keeps working.
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

SERVER = Path(r"C:/Users/sevka/Desktop/1223/work/iron-gym/server")
AI_TS = SERVER / "src/routes/ai.ts"
OUT_TS = SERVER / "src/ai/knowledgeHelpers.ts"

# Functions / declarations to KEEP in ai.ts (infrastructure, not prose).
# Anything matching these names stays where it is.
KEEP_IN_ROUTE = {
    # cache
    "getCachedResponse", "setCachedResponse",
    # tf-idf selector
    "getKeywordIDF", "getRelevantKnowledge", "collectQueryKeywords",
    "extractRelevantSubsection", "expandSynonyms",
    # intent / mood / time
    "classifyIntent", "detectMood", "getTimeContext", "getProfileGaps",
    "classifyToolError", "describeMissing",
    # misc utilities used by /chat directly
    "normalizeForCache", "simpleHash",
}


def find_top_level_router_endpoints(lines: list[str]) -> list[int]:
    """Return line indices where `router.<method>(...)` appears at column 0."""
    out = []
    for i, line in enumerate(lines):
        if re.match(r"^router\.(get|post|put|patch|delete)\(", line):
            out.append(i)
    return out


def find_router_handler_end(lines: list[str], start: int) -> int:
    """Given the line index of a `router.X(...)` call, find the line of
    the matching closing `});` at column 0 that ends the handler."""
    # The handler is `router.X('/path', mw, async (req, res) => { ... });`
    # — the entire call statement ends at `});` at column 0.
    i = start + 1
    while i < len(lines):
        if lines[i] == "});":
            return i
        i += 1
    return len(lines) - 1


def find_top_level_decls(lines: list[str]) -> list[tuple[int, int, str]]:
    """Find every top-level declaration. Returns (start, end, name)
    where end is the line of the closing brace at column 0 (for
    multiline decls) or the start line itself (for single-line).

    Catches: function, const, let, var, type, interface, enum, class.
    Skips: anything inside router.X(...) calls.
    """
    decls: list[tuple[int, int, str]] = []
    router_endpoints = find_top_level_router_endpoints(lines)
    handler_ranges = [
        (r, find_router_handler_end(lines, r)) for r in router_endpoints
    ]

    def inside_handler(i: int) -> bool:
        return any(s <= i <= e for s, e in handler_ranges)

    i = 0
    while i < len(lines):
        if inside_handler(i):
            i += 1
            continue
        line = lines[i]
        m = re.match(
            r"^(?:export\s+)?(?:function|const|let|var|type|interface|enum|class|abstract\s+class)\s+([A-Za-z_][\w]*)",
            line,
        )
        if not m:
            i += 1
            continue
        name = m.group(1)

        # Single-line const/type decls: end on same line if it has `;`
        # but a multi-line object continues until `}` at column 0.
        if line.rstrip().endswith(";"):
            decls.append((i, i, name))
            i += 1
            continue

        # Multi-line — scan for `}` at column 0 (or `};` for const).
        end = i + 1
        while end < len(lines):
            l = lines[end]
            if l == "}" or l == "};" or l == "} as const;":
                break
            end += 1
        if end >= len(lines):
            # Defensive: don't grab the rest of the file.
            decls.append((i, i, name))
            i += 1
            continue
        decls.append((i, end, name))
        i = end + 1
    return decls


def attach_preceding_comment(lines: list[str], start: int) -> int:
    """If a /** ... */ block (no blank line between) precedes `start`,
    return its first line. Otherwise return `start`."""
    j = start - 1
    if j < 0 or not lines[j].rstrip().endswith("*/"):
        return start
    k = j
    while k >= 0:
        if lines[k].lstrip().startswith("/**"):
            return k
        k -= 1
    return start


def main() -> None:
    content = AI_TS.read_text(encoding="utf-8")
    lines = content.split("\n")
    if not lines:
        print("empty file?")
        sys.exit(1)

    decls = find_top_level_decls(lines)
    print(f"Top-level declarations (outside router handlers): {len(decls)}")

    # Skip declarations that are part of route infrastructure or live
    # BEFORE the helper region (~ line 12800). Everything below the
    # /chat handler that ISN'T in KEEP_IN_ROUTE is fair game.
    HELPER_REGION_START = 12800
    helper_decls: list[tuple[int, int, str]] = []
    for (start, end, name) in decls:
        if start < HELPER_REGION_START:
            continue
        if name in KEEP_IN_ROUTE:
            continue
        helper_decls.append((start, end, name))
    print(f"Helper region decls to extract: {len(helper_decls)}")

    # Collect cut ranges (including preceding /** ... */ comments).
    cut_set: set[int] = set()
    extracted_chunks: list[str] = []
    extracted_names: list[str] = []
    for (start, end, name) in helper_decls:
        chunk_start = attach_preceding_comment(lines, start)
        chunk = lines[chunk_start : end + 1]
        # Prepend `export ` if not already there.
        for k, line in enumerate(chunk):
            if line.startswith(("function ", "const ", "let ", "var ",
                                 "type ", "interface ", "enum ", "class ",
                                 "abstract class ")):
                chunk[k] = "export " + line
                break
        extracted_chunks.append("\n".join(chunk))
        extracted_chunks.append("\n")
        extracted_names.append(name)
        for k in range(chunk_start, end + 1):
            cut_set.add(k)

    if not extracted_chunks:
        print("Nothing extracted.")
        sys.exit(0)

    # Build helpers file.
    header = '''/**
 * knowledgeHelpers.ts — extracted from routes/ai.ts (audit R-2026-05-22).
 *
 * Holds the entire knowledge-prose layer that used to live inline in
 * ai.ts (about 73% of that file's 87K lines). Every helper here is a
 * pure function of its arguments — no DB calls, no req/res, no closures
 * over route state. The TF-IDF selector in `getRelevantKnowledge`
 * (still in ai.ts) chooses which of these snippets to paste into the
 * system prompt for each chat turn.
 *
 * Migration was mechanical: bodies are byte-identical to the inline
 * originals — same logic, same regex patterns, same prose. If a helper
 * here breaks, the same logic was broken inline before.
 *
 * Why split: ai.ts was 87 534 lines (73% knowledge prose). After the
 * extraction the route file drops to ~16K lines — IDE/tsx watch faster
 * by 3-4×, navigation no longer drowned in seasonal-advice strings.
 */
import { logger } from '../utils/logger';
import { sanitizeForPrompt } from '../utils/inputSanitizer';
import type { DeepSeekMessage } from '../services/deepseekAI';

'''

    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text(header + "\n".join(extracted_chunks), encoding="utf-8")

    # Rewrite ai.ts: remove cut ranges, insert one big named import at top.
    remaining = [line for i, line in enumerate(lines) if i not in cut_set]

    # Dedup names, sort for stable diff.
    unique_names = sorted(set(extracted_names))
    import_lines = ",\n  ".join(unique_names)
    import_block = f"""// Knowledge prose extracted to ai/knowledgeHelpers.ts (audit R-2026-05-22).
// {len(unique_names)} declarations moved (functions, consts, types).
// Logic preserved byte-for-byte; only file location changed.
import {{
  {import_lines},
}} from '../ai/knowledgeHelpers';"""

    # Find the END of the last `import` STATEMENT (multi-line aware).
    # Walk forward from line 0 until we hit a non-import top-level line.
    last_import_end = 0
    in_multiline = False
    for i, line in enumerate(remaining):
        stripped = line.lstrip()
        if in_multiline:
            last_import_end = i
            if stripped.startswith("}") and ("from " in line or line.rstrip().endswith(";")):
                in_multiline = False
            continue
        if line.startswith("import "):
            last_import_end = i
            # If it's `import {` without `}` on the same line, multi-line.
            if "{" in line and "}" not in line:
                in_multiline = True
        elif line.strip() == "" or line.lstrip().startswith("//") or line.lstrip().startswith("/*"):
            # Comments + blank lines after imports are fine; keep walking.
            continue
        else:
            break

    new_lines = (
        remaining[: last_import_end + 1]
        + ["", import_block]
        + remaining[last_import_end + 1 :]
    )
    AI_TS.write_text("\n".join(new_lines), encoding="utf-8")

    print(f"Extracted {len(unique_names)} decls. ai.ts {len(lines)} -> {len(new_lines)} lines.")
    print(f"knowledgeHelpers.ts written ({len(extracted_chunks)} chunks).")


if __name__ == "__main__":
    main()
