#!/usr/bin/env python3
"""
theme-codemod.py — replace `const { colors } = useThemeStore()` with
`const colors = useThemeColors()` across src/.

Only touches the PURE case: destructure of `colors` alone. Files that
also destructure other fields (`{ colors, applyAutoTheme }`) are left
alone — they still need useThemeStore for the other field.

Import handling: after the swap, if useThemeStore has no remaining
usage in the file, the import is converted to useThemeColors.

Idempotent. Safe to re-run.
"""
import re
import sys
from pathlib import Path

SRC = Path(r"C:/Users/sevka/Desktop/1223/work/iron-gym/src")

# pure-destructure case (only `colors`, optional whitespace)
PURE_DESTRUCTURE = re.compile(r"const\s*\{\s*colors\s*\}\s*=\s*useThemeStore\(\)")

# import patterns
IMPORT_FROM_STORE = re.compile(
    r"import\s*\{\s*([^}]+?)\s*\}\s*from\s*'(\.{1,2}/(?:[\w\-/]+/)?store(?:/useThemeStore)?)'"
)


def update_import_block(content: str) -> str:
    """If useThemeStore is no longer used after the swap, swap the import
    to useThemeColors. If it's still used (other hooks), add useThemeColors
    alongside if missing."""
    uses_store_elsewhere = bool(re.search(r"\buseThemeStore\b", content))
    uses_colors_hook = bool(re.search(r"\buseThemeColors\b", content))

    if not uses_store_elsewhere:
        # nothing to do
        return content

    # find import blocks that mention useThemeStore
    def repl(m):
        names_raw = m.group(1)
        path = m.group(2)
        names = [n.strip() for n in names_raw.split(",") if n.strip()]
        # if useThemeColors already present, no change
        if "useThemeColors" in names:
            return m.group(0)
        # add useThemeColors if file uses it
        if uses_colors_hook:
            if "useThemeStore" in names:
                # keep useThemeStore (still used elsewhere) and add useThemeColors
                names.append("useThemeColors")
            else:
                names.append("useThemeColors")
            new = ", ".join(names)
            return f"import {{ {new} }} from '{path}'"
        return m.group(0)

    return IMPORT_FROM_STORE.sub(repl, content)


def process_file(path: Path) -> str | None:
    """Returns short summary if file changed, else None."""
    try:
        original = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, PermissionError):
        return None

    if "useThemeStore" not in original:
        return None

    # do the body replacement first
    new_content, n_swaps = PURE_DESTRUCTURE.subn(
        "const colors = useThemeColors()", original
    )

    if n_swaps == 0:
        return None

    # then fix imports based on the new body
    new_content = update_import_block(new_content)

    if new_content == original:
        return None

    path.write_text(new_content, encoding="utf-8")
    return f"  {n_swaps}x  {path.relative_to(SRC)}"


def main():
    changed = []
    for path in SRC.rglob("*.tsx"):
        if "node_modules" in path.parts:
            continue
        result = process_file(path)
        if result:
            changed.append(result)
    for path in SRC.rglob("*.ts"):
        if "node_modules" in path.parts or path.name.endswith(".d.ts"):
            continue
        result = process_file(path)
        if result:
            changed.append(result)

    print(f"Files changed: {len(changed)}")
    for line in changed[:20]:
        print(line)
    if len(changed) > 20:
        print(f"... and {len(changed) - 20} more")


if __name__ == "__main__":
    main()
