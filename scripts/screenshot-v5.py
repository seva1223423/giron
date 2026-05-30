"""Render V5 clean-rebuild mockup to PNG via full-page+crop approach."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
import io

URL = "http://localhost:8765/v5.html"
OUT_DIR = Path("docs/design/variants/v5")

LABELS = ["1-journal", "2-schedule", "3-grid"]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 1600}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(300)

        phones = page.locator(".phone")
        assert phones.count() == 3
        for i in range(3):
            phone = phones.nth(i)
            phone.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            box = phone.bounding_box()
            png_bytes = page.screenshot(full_page=False)
            img = Image.open(io.BytesIO(png_bytes))
            x = int(box["x"] * 2)
            y = int(box["y"] * 2)
            w = int(box["width"] * 2)
            h = int(box["height"] * 2)
            # tight crop, no extra margin (phone has its own border-radius)
            crop = img.crop((x, y, x + w, y + h))
            out = OUT_DIR / f"{LABELS[i]}.png"
            crop.save(out)
            print(f"  saved {out}  ({w}x{h})")
        browser.close()


if __name__ == "__main__":
    main()
