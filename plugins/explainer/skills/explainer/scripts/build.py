#!/usr/bin/env python3
"""Build an explainer: its steps.js plus the engine become one self-contained page.

    python build.py explainers/<slug>

Reads <dir>/steps.js, and <dir>/extra.css if there is one. The first lines of steps.js name the page:

    // @title Looped Transformers
    // @description One sentence on what the page explains.

Writes two files into <dir>:

    <slug>.html            a complete page: open it in a browser, host it, or send it
    <slug>.artifact.html   the same page without the outer document, which is the form the Claude Artifact tool takes
"""

import html
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
FONTS = (
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500'
    '&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600&display=swap">'
)


def directive(source: str, name: str) -> str | None:
    match = re.search(rf"^//\s*@{name}\s+(.+?)\s*$", source, re.M)
    return match.group(1) if match else None


def inline_script(source: str) -> str:
    return source.replace("</script", "<\\/script")


def build(directory: Path) -> Path:
    steps_path = directory / "steps.js"
    if not steps_path.is_file():
        sys.exit(f"{steps_path} not found. Start from assets/starter.js.")
    steps = steps_path.read_text()
    title = directive(steps, "title")
    if not title:
        sys.exit(f"{steps_path}: add a first line `// @title <the page's name>`")
    description = directive(steps, "description") or ""

    css = (ASSETS / "engine.css").read_text()
    extra = directory / "extra.css"
    if extra.is_file():
        css += "\n" + extra.read_text()
    head = f"<title>{html.escape(title)}</title>\n"
    if description:
        head += f'<meta name="description" content="{html.escape(description, quote=True)}">\n'
    body = (
        f"{FONTS}\n<style>\n{css}</style>\n"
        f"<script>\n{inline_script((ASSETS / 'engine.js').read_text())}</script>\n"
        f"<script>\n{inline_script(steps)}</script>\n"
    )

    slug = directory.resolve().name
    page = directory / f"{slug}.html"
    page.write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f"{head}</head>\n<body>\n{body}</body>\n</html>\n"
    )
    artifact = directory / f"{slug}.artifact.html"
    artifact.write_text(f'{head}<meta name="claude:viewport-fit-sides" content="cover">\n{body}')
    print(f"built {page} ({page.stat().st_size // 1024} KB) and {artifact.name}")
    return page


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(Path(sys.argv[1]))
