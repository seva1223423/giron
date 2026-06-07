#!/usr/bin/env python3
"""
theme-codemod-fix-imports.py — second pass that fixes imports left
broken by theme-codemod.py.

A file is "broken" if:
  - it calls useThemeColors() in the body
  - but useThemeColors is not in any import

For each broken file we look at the existing import of '...store...' or
'.../useThemeStore' and:
  (a) replace useThemeStore → useThemeColors if useThemeStore is not
      referenced anywhere else in the file
  (b) append useThemeColors to the same import braces if useThemeStore is
      still used (some other hook reaches into the store directly)
  (c) if no store import exists at all, add `import { useThemeColors }
      from '<best guess>';` after the last top-level import (rare — only
      happens if codemod swapped a body that used a re-export elsewhere).
"""
import re
from pathlib import Path

SRC = Path(r"C:/Users/sevka/Desktop/1223/work/iron-gym/src")

STORE_IMPORT = re.compile(
    r"import\s*\{\s*([^}]+?)\s*\}\s*from\s*['\"]((?:\.{1,2}/)+(?:[\w\-/]+/)?store(?:/useThemeStore)?)['\"]"
)


def fix_file(path: Path) -> str | None:
    try:
        original = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, PermissionError):
        return None

    if "useThemeColors" not in original:
        return None
    # already imported anywhere?
    if re.search(r"import[^;]*\buseThemeColors\b", original):
        return None

    uses_store_in_body = bool(
        re.search(r"\buseThemeStore\b\s*[\(<]", original)
    )

    changed = False

    def repl(m):
        nonlocal changed
        names_raw = m.group(1)
        path_str = m.group(2)
        names = [n.strip() for n in names_raw.split(",") if n.strip()]
        if "useThemeColors" in names:
            return m.group(0)
        if "useThemeStore" in names:
            if not uses_store_in_body:
                # case (a): swap
                names = [
                    "useThemeColors" if n == "useThemeStore" else n
                    for n in names
                ]
            else:
                # case (b): append
                names.append("useThemeColors")
            changed = True
            return f"import {{ {', '.join(names)} }} from '{path_str}'"
        return m.group(0)

    new_content = STORE_IMPORT.sub(repl, original)

    if not changed:
        # case (c): no store import found. Inject one. We use the same
        # relative depth as any other import from the store folder, if
        # one exists; otherwise compute from path.
        # For simplicity: look for ANY 'from .../store' style import.
        other = re.search(
            r"from\s*['\"]((?:\.{1,2}/)+(?:[\w\-/]+/)?store(?:/useThemeStore)?)['\"]",
            new_content,
        )
        if other:
            store_path = other.group(1)
        else:
            # Compute: src/foo/bar/X.tsx → ../../store/useThemeStore
            depth = len(path.relative_to(SRC).parts) - 1
            store_path = "../" * depth + "store/useThemeStore"
        # Insert after the last top-level import
        import_lines = list(re.finditer(r"^import .*$", new_content, re.M))
        if import_lines:
            last = import_lines[-1]
            insertion = f"\nimport {{ useThemeColors }} from '{store_path}';"
            new_content = (
                new_content[: last.end()] + insertion + new_content[last.end():]
            )
            changed = True

    if not changed:
        return None

    path.write_text(new_content, encoding="utf-8")
    return f"  fixed  {path.relative_to(SRC)}"


def main():
    changed = []
    for ext in ("*.tsx", "*.ts"):
        for path in SRC.rglob(ext):
            if "node_modules" in path.parts or path.name.endswith(".d.ts"):
                continue
            result = fix_file(path)
            if result:
                changed.append(result)

    print(f"Files fixed: {len(changed)}")
    for line in changed[:20]:
        print(line)
    if len(changed) > 20:
        print(f"... and {len(changed) - 20} more")


if __name__ == "__main__":
    main()
