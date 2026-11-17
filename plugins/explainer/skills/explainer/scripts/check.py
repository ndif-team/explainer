#!/usr/bin/env python3
"""Check a built explainer in a headless browser.

    python check.py explainers/<slug>            every step
    python check.py explainers/<slug> --steps 4,9-11

Rebuilds the page, then for every step:

  - runs its animation instantly and reports any script error,
  - reports an animation that ends on a different picture than the step's resting frame,
  - reports text that overlaps other text or runs outside the drawing, and captions that are too long,
  - saves a screenshot of the resting frame to <dir>/check/step-NN.png (and sheets of three, if Pillow is installed).

The automatic checks cannot see a label sitting on a line or an unclear picture: look at the screenshots.
Needs Chrome or Chromium. Set EXPLAINER_CHROME to its path if it is not found. Exit code 1 means errors.
"""

import argparse
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import build  # noqa: E402

WINDOW = "1280,720"


def find_chrome() -> str | None:
    if os.environ.get("EXPLAINER_CHROME"):
        return os.environ["EXPLAINER_CHROME"]
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome", "microsoft-edge"):
        if shutil.which(name):
            return shutil.which(name)
    home = Path.home()
    patterns = [
        home / ".cache/ms-playwright/chromium-*/chrome-linux*/chrome",
        home / "Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    ]
    for pattern in patterns:
        found = sorted(glob.glob(str(pattern)))
        if found:
            return found[-1]
    return None


def chrome(binary: str, url: str, *flags: str, budget: int = 5000) -> str:
    profile = tempfile.mkdtemp(prefix="explainer-chrome-")
    try:
        result = subprocess.run(
            [binary, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", f"--window-size={WINDOW}",
             f"--user-data-dir={profile}", f"--virtual-time-budget={budget}", *flags, url],
            capture_output=True, text=True, timeout=120,
        )
        return result.stdout
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def attribute(dom: str, name: str) -> str | None:
    tag = re.search(r"<html[^>]*>", dom)
    match = re.search(rf'{name}="([^"]*)"', tag.group(0)) if tag else None
    return html.unescape(match.group(1)) if match else None


def parse_steps(text: str, count: int) -> list[int]:
    chosen = set()
    for part in text.split(","):
        first, _, last = part.partition("-")
        chosen.update(range(int(first), int(last or first) + 1))
    return [n for n in sorted(chosen) if 1 <= n <= count]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--steps", help="which steps, such as 4,9-11 (default: all)")
    args = parser.parse_args()

    page = build(args.directory)
    errors = 0
    if shutil.which("node"):
        for script in (args.directory / "steps.js",):
            syntax = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True)
            if syntax.returncode:
                print(f"ERROR  {script.name} does not parse:\n{syntax.stderr.strip()}")
                return 1

    binary = find_chrome()
    if not binary:
        print("SKIPPED the browser checks: no Chrome or Chromium found. Set EXPLAINER_CHROME to its path.")
        return 0
    url = page.resolve().as_uri()
    first = chrome(binary, f"{url}#step-1-still", "--dump-dom")
    count = attribute(first, "data-explainer-steps")
    if count is None:
        print("ERROR  the page did not start:", attribute(first, "data-explainer-error") or "no steps were registered")
        return 1
    wanted = parse_steps(args.steps, int(count)) if args.steps else list(range(1, int(count) + 1))

    shots = args.directory / "check"
    shots.mkdir(exist_ok=True)
    if not args.steps:
        for old in shots.glob("*.png"):
            old.unlink()

    def check(n: int):
        dom = chrome(binary, f"{url}#step-{n}-check", "--dump-dom")
        shot = shots / f"step-{n:02d}.png"
        chrome(binary, f"{url}#step-{n}-still", f"--screenshot={shot}", budget=3000)
        error = attribute(dom, "data-explainer-error")
        if attribute(dom, "data-explainer-done") is None and not error:
            error = "the check did not finish"
        return n, error, json.loads(attribute(dom, "data-explainer-lint") or "[]"), shot

    warnings = 0
    with ThreadPoolExecutor(max_workers=min(6, os.cpu_count() or 2)) as pool:
        results = sorted(pool.map(check, wanted))
    for n, error, problems, _ in results:
        if error:
            errors += 1
            print(f"step {n:>2}  ERROR  {error}")
        for problem in problems:
            warnings += 1
            print(f"step {n:>2}  WARN   {problem}")

    sheets = []
    try:
        from PIL import Image

        files = [shot for _, _, _, shot in results if shot.is_file()]
        for old in shots.glob("sheet-*.png"):
            old.unlink()
        for k in range(0, len(files), 3):
            images = [Image.open(f).convert("RGB") for f in files[k:k + 3]]
            images = [im.resize((1100, im.height * 1100 // im.width)) for im in images]
            sheet = Image.new("RGB", (1100, sum(im.height for im in images)), "white")
            y = 0
            for im in images:
                sheet.paste(im, (0, y))
                y += im.height
            sheets.append(shots / f"sheet-{k // 3 + 1:02d}.png")
            sheet.save(sheets[-1])
    except ImportError:
        pass

    print(f"{page.name}: checked {len(results)} of {count} steps, {errors} errors, {warnings} warnings")
    if sheets:
        print(f"look at the resting frames: {shots}/sheet-01.png to sheet-{len(sheets):02d}.png (three steps each)")
    else:
        print(f"look at the resting frames: {shots}/step-NN.png")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
