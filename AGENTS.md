# Working in this repository

One agent skill, `explainer`. The README is for people who install it; this file
is for whoever edits it.

## Layout

```text
.claude-plugin/marketplace.json           the one plugin; Claude Code and Codex both read it
plugins/explainer/
├── .claude-plugin/plugin.json
└── skills/explainer/
    ├── SKILL.md                          read whenever the skill loads: the process
    ├── references/*.md                   opened at the step that needs them
    ├── assets/engine.js, engine.css      the page every explainer shares
    ├── assets/starter.js                 what a new steps.js is copied from
    └── scripts/build.py, check.py        tools the agent runs
examples/<slug>/                          explainers made with the skill: steps.js and the built page
```

## The split

- **`steps.js` holds an explainer's content. The engine holds none.** Anything
  about one topic stays out of `assets/`.
- **The engine stays small.** It is the frame, navigation, timing, three kinds of
  visual and the checks. Before adding a helper, check that two different
  explainers need it; a recipe in `references/visuals.md` is usually enough.
- **The look is one house style.** Colours are the variables at the top of
  `engine.css`, defined for light and dark. A new colour is a new variable in all
  three blocks.
- **The page never moves by itself** and never writes its own address. Navigation
  state lives in the page.

## SKILL.md and the guides

- `description` is what an agent selects on. Keep it under 1,024 characters, as a
  double-quoted YAML string. The frontmatter holds `name` and `description` only.
- The body is the process, in order. Depth goes in a guide under `references/`,
  and every guide is listed in the table at the end of SKILL.md.
- Every code block in a guide is code that was built and checked. After changing
  one, put it in a scratch `steps.js` and run `scripts/check.py` on it.
- Describe the current design only. Nothing about one machine: no host names,
  personal paths or environment names.

## Examples

An example is made by running the skill, on a public topic, and is committed as
`examples/<slug>/steps.js` with its built pages. Private checkpoints, unreleased
work and internal names stay out of this repository.

## Before pushing

```bash
python plugins/explainer/skills/explainer/scripts/check.py <a directory holding a copy of assets/starter.js as steps.js>
claude plugin validate .
```

The first must report no errors and no warnings. The second checks the
marketplace, the manifest and the frontmatter; its "No version specified" warning
is expected, because `plugin.json` has no `version` so that every commit reaches
users.
