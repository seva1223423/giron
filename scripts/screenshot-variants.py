"""Render Workouts panel mockup variants to PNG via Playwright.

Visits localhost:8765 (assumes preview_start design-server is running),
scrolls each .variant element into view, captures it as PNG.

Output: docs/design/variants/v1/screen-{1|2|3}-{a|b|c}.png

Run: python scripts/screenshot-variants.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://localhost:8765/index.html"
OUT_DIR = Path("docs/design/variants/v1")

# (screen_number, variant_index) -> filename suffix
LABELS = [
    (1, 0, "1a-journal"),
    (1, 1, "1b-tabs"),
    (1, 2, "1c-feed"),
    (2, 0, "2a-wizard"),
    (2, 1, "2b-onepage"),
    (2, 2, "2c-schedule"),
    (3, 0, "3a-list"),
    (3, 1, "3b-grid"),
    (3, 2, "3c-body"),
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 1200}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle")

        # Each Screen <section> contains 3 .variant elements
        sections = page.locator("section.section")
        assert sections.count() == 3, f"Expected 3 sections, got {sections.count()}"

        for screen_idx in range(3):
            variants = sections.nth(screen_idx).locator(".variant")
            assert variants.count() == 3, f"Section {screen_idx} has {variants.count()} variants"
            for variant_idx in range(3):
                target = variants.nth(variant_idx)
                label = LABELS[screen_idx * 3 + variant_idx][2]
                out = OUT_DIR / f"{label}.png"
                target.scroll_into_view_if_needed()
                page.wait_for_timeout(150)
                target.screenshot(path=str(out))
                print(f"  saved {out}")

        browser.close()


if __name__ == "__main__":
    main()
