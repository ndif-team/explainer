# explainer

An agent skill that turns a topic into a step-by-step explainer: one HTML page a
reader clicks through, where each click adds one idea and shows it with a diagram,
a table, a code listing or an animation.

```text
/explainer how our request queue works, for a new engineer on the team
```

It works on a codebase or system, a paper, a general concept, or your own results
and notes.

## What happens when you run it

1. The agent skims what you pointed it at and asks up to four questions: who the
   reader is and what they already know, the two or three things they should
   understand at the end, what to read, and what to leave out.
2. It reads the sources and shows you an outline: one line per step, with the
   point of the step and what the picture will show. You approve it or change it.
3. It writes the page, then checks every step in a headless browser: script
   errors, overlapping text, captions that run long, and animations that end on
   the wrong frame. It looks at a screenshot of every step.
4. You get `explainers/<name>/<name>.html`, one self-contained file that opens in
   any browser. In Claude Code it is also published as a private artifact link.

The pages follow a few rules. They start from something the reader already knows.
They add one idea per step and show a thing before using its name. Every claim
comes from a source the agent read, and example values are labelled as examples.
The page moves only when the reader clicks.

## Install

### Claude Code

```text
/plugin marketplace add ndif-team/explainer
/plugin install explainer@ndif-explainer
```

A plugin's skill carries the plugin's name, so the full command is
`/explainer:explainer <topic>`: type `/explainer` and pick it from the menu. Asking
for "an explainer of ..." in plain words loads the skill too.

### OpenAI Codex

```bash
codex plugin marketplace add ndif-team/explainer
codex plugin add explainer@ndif-explainer
```

### Other agents

[`npx skills`](https://github.com/vercel-labs/skills) installs the skill into
Cursor, GitHub Copilot, Gemini CLI, OpenCode and others. Installed this way in
Claude Code, the command is plain `/explainer <topic>`:

```bash
npx skills add ndif-team/explainer
```

To install by hand, copy `plugins/explainer/skills/explainer` into the directory
your agent reads skills from.

### Requirements

- Python 3.10 or later, to build the page. No packages needed.
- Chrome or Chromium, for the checks. Without one the page is still built and the
  agent tells you the checks were skipped. Set `EXPLAINER_CHROME` if the browser
  is somewhere unusual.
- Optional: Node, for a syntax check; Pillow, to group the screenshots.

### Updating

Every commit to this repository is a new version of the plugin.

- Claude Code: `/plugin marketplace update ndif-explainer`, or turn on auto-update
  for the marketplace under `/plugin`.
- Codex: `codex plugin marketplace upgrade`.
- `npx skills`: `npx skills update`.

## What is in the skill

```text
plugins/explainer/skills/explainer/
├── SKILL.md              the process the agent follows
├── references/steps.md   how to order ideas and write captions
├── references/visuals.md which visual a step needs, and how to draw it
├── assets/engine.js      the page: navigation, timing, drawing helpers
├── assets/engine.css     the look, in light and dark
├── assets/starter.js     the file an explainer starts from
└── scripts/              build.py makes the page, check.py tests it
```

An explainer's own content is one file, `steps.js`. `build.py` joins it with the
engine into a single HTML file, so every explainer shares one look and a fix to
the engine reaches all of them at their next build.

## License

MIT. See [LICENSE](LICENSE).
