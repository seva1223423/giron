"""Render V4 sticky-CTA-fix mockup to PNG."""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://localhost:8765/v4.html"
OUT_DIR = Path("docs/design/variants/v4")

LABELS = ["1-journal", "2-schedule", "3-grid"]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 1200}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle")

        variants = page.locator(".variant")
        assert variants.count() == 3, f"Expected 3 variants, got {variants.count()}"
        for i in range(3):
            target = variants.nth(i)
            out = OUT_DIR / f"{LABELS[i]}.png"
            target.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            target.screenshot(path=str(out))
            print(f"  saved {out}")
        browser.close()


if __name__ == "__main__":
    main()
