#!/usr/bin/env python3
"""
fix-knowledge-topic-imports.py — second pass after split-knowledge-helpers.py.

The split classifies each decl by name pattern but doesn't track which
decls REFERENCE which. So if `analytics.ts` uses an interface declared
in `recovery.ts`, tsc will fail with "Cannot find name 'X'".

This script:
  1. Reads every topic file in src/ai/knowledge-topics/
  2. Builds a map: symbol name → topic file that declares it
  3. For each topic file, scans for identifiers it uses but doesn't
     declare locally
  4. Adds the necessary import statements at the top

Idempotent — safe to re-run.
"""

from __future__ import annotations
import re
import sys
from pathlib import Path
from collections import defaultdict

SERVER = Path(r"C:/Users/sevka/Desktop/1223/work/iron-gym/server")
TOPICS_DIR = SERVER / "src/ai/knowledge-topics"

DECL_RE = re.compile(
    r"^(?:export\s+)?(?:function|const|let|var|type|interface|enum|class|abstract\s+class)\s+([A-Za-z_][\w]*)",
    re.MULTILINE,
)
# Ignore TypeScript built-ins + RN/Node + already-imported third party
IGNORE = {
    # JS / DOM / Node
    "console", "Date", "Math", "Number", "String", "Boolean", "Array", "Object",
    "JSON", "Promise", "Map", "Set", "Error", "RegExp", "Symbol", "BigInt",
    "Buffer", "process", "global", "require", "module", "exports", "__dirname",
    "__filename", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "Infinity", "NaN", "undefined", "null", "true", "false",
    "Record", "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude",
    "Extract", "ReturnType", "Parameters", "Awaited", "NonNullable",
    "ConstructorParameters", "InstanceType", "ThisType", "ReadonlyArray",
    "Iterable", "Iterator", "IterableIterator", "Generator", "GeneratorFunction",
    "AsyncGenerator", "AsyncIterable", "AsyncIterator", "AsyncIterableIterator",
    "Function", "ArrayBuffer", "Uint8Array", "TextEncoder", "TextDecoder",
    "URL", "URLSearchParams", "Response", "Request", "Headers", "Blob", "FormData",
    "AbortController", "AbortSignal", "Event", "EventTarget",
    # Already imported in topic header
    "logger", "sanitizeForPrompt", "DeepSeekMessage", "GamificationData",
    # TS keywords
    "as", "is", "any", "void", "never", "unknown", "this", "in", "of",
    "typeof", "keyof", "instanceof", "new", "return", "if", "else", "for",
    "while", "do", "switch", "case", "default", "break", "continue", "throw",
    "try", "catch", "finally", "function", "const", "let", "var", "type",
    "interface", "enum", "class", "extends", "implements", "import", "from",
    "export", "namespace", "module", "declare", "abstract", "static", "public",
    "private", "protected", "readonly", "async", "await", "yield",
}


def find_local_decls(content: str) -> set[str]:
    return {m.group(1) for m in DECL_RE.finditer(content)}


def find_used_identifiers(content: str) -> set[str]:
    """Loose identifier scan — any word-boundaried token that looks like
    a TypeScript identifier. False positives don't hurt; they get
    filtered against IGNORE + local + the symbol map.

    Skip string stripping entirely: template literals span lines in
    knowledge-prose helpers, and trying to mask them out without a
    real parser ends up eating function signatures in between (DOTALL
    is too greedy for our case). Worst case: an identifier-shaped
    word inside prose triggers an extra import — false positive
    that's harmless because TS tree-shakes unused named imports."""
    # Strip comments only — those don't span unpredictably.
    no_comments = re.sub(r"//.*$", "", content, flags=re.MULTILINE)
    no_comments = re.sub(r"/\*[\s\S]*?\*/", "", no_comments)
    return {m.group(0) for m in re.finditer(r"\b[A-Z][A-Za-z_][\w]*\b", no_comments)} \
        | {m.group(0) for m in re.finditer(r"\b[a-z][A-Za-z_][\w]*\b", no_comments)}


def main() -> None:
    if not TOPICS_DIR.exists():
        print(f"Topics dir not found: {TOPICS_DIR}")
        sys.exit(1)

    files = sorted(TOPICS_DIR.glob("*.ts"))
    # Build symbol → topic map
    symbol_topic: dict[str, str] = {}
    file_content: dict[str, str] = {}
    file_decls: dict[str, set[str]] = {}
    for f in files:
        topic = f.stem
        content = f.read_text(encoding="utf-8")
        file_content[topic] = content
        decls = find_local_decls(content)
        file_decls[topic] = decls
        for d in decls:
            if d in symbol_topic:
                # Duplicate — shouldn't happen after a clean split. Warn but keep first.
                print(f"WARN: duplicate decl {d} in {topic} (also in {symbol_topic[d]})")
            else:
                symbol_topic[d] = topic

    # For each file, find undefined identifiers + group by source topic.
    for topic in files:
        topic_name = topic.stem
        content = file_content[topic_name]
        used = find_used_identifiers(content)
        local = file_decls[topic_name]
        # Subtract: locals, ignore list, anything imported already
        existing_imports = set()
        for m in re.finditer(r"import\s*(?:type\s*)?\{([^}]*)\}", content):
            for name in m.group(1).split(","):
                clean = name.strip().split(" as ")[0].strip()
                if clean:
                    existing_imports.add(clean)
        missing = used - local - IGNORE - existing_imports
        # Group by source topic
        to_import: dict[str, set[str]] = defaultdict(set)
        for sym in missing:
            if sym in symbol_topic and symbol_topic[sym] != topic_name:
                to_import[symbol_topic[sym]].add(sym)
        if not to_import:
            continue

        # Build import lines, insert after existing imports
        import_block = []
        for source_topic, syms in sorted(to_import.items()):
            sorted_syms = sorted(syms)
            import_block.append(
                f"import {{ {', '.join(sorted_syms)} }} from './{source_topic}';"
            )

        # Find where to insert: after the last `import` line in the file
        lines = content.split("\n")
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import_idx = i
        if last_import_idx == -1:
            # No imports yet — insert after header comment
            for i, line in enumerate(lines):
                if line.strip() == "" or line.startswith("/*") or line.startswith(" *") or line.startswith("*/") or line.startswith("//"):
                    continue
                last_import_idx = i - 1
                break

        new_lines = (
            lines[: last_import_idx + 1]
            + ["", "// Cross-topic imports (auto-added by fix-knowledge-topic-imports.py):"]
            + import_block
            + lines[last_import_idx + 1 :]
        )
        topic.write_text("\n".join(new_lines), encoding="utf-8")
        total_syms = sum(len(s) for s in to_import.values())
        print(f"  {topic_name}: +{total_syms} imports from {len(to_import)} topics")

    print("\nDone.")


if __name__ == "__main__":
    main()
