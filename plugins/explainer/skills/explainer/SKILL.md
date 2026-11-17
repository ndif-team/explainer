---
name: explainer
description: "Build a step-by-step explainer page for a topic: a click-through walkthrough that starts from what the reader already knows, adds one idea per step, and shows each idea with the diagram, table, code listing or animation that fits it. Use when the user runs /explainer <topic>, or asks for an explainer, a walkthrough, or a visual or animated explanation of a codebase, a system, a paper, a concept or their own results, for a team or any other reader. The skill asks a few questions, proposes an outline to approve, writes one self-contained HTML file from a shared template, and checks every step in a headless browser. Not for slide decks to present from, reference documentation, or an answer that fits in a chat reply."
---

# explainer

An explainer is one HTML page that a reader clicks through. A short caption sits
on the left and one picture on the right, and each click adds one idea. The
arguments after `/explainer` are the topic.

You write one file, `steps.js`. A shared engine supplies the page, the controls
and the look, and two scripts build and check the result.

## What a good explainer does

- **Starts where the reader stands.** The first picture is something they already
  know. Everything after changes that picture.
- **Adds one idea per step**, in an order where each needs only the ones before it.
  No step uses a term that an earlier step has not shown.
- **Shows the mechanism.** A diagram when parts connect, an animation when
  something happens in order, a table when things are compared, a listing when the
  reader will read or type code. The caption is one or two sentences.
- **Invents nothing.** Every claim comes from a source you read. A made-up value
  that illustrates a point is labelled as an example.
- **Moves only when the reader moves it.**

## Process

Do these in order. Do not write `steps.js` before the outline is approved.

1. **Look first.** Skim what the request points at (the repository, the paper, the
   notes) for a few minutes, enough to ask useful questions.

2. **Ask.** In one round, with your best guess offered for each. Use the agent's
   question tool if it has one. Skip anything the request already answers.
   - Who is the reader, and what do they already know about this?
   - What two or three things should they understand at the end?
   - What should you read, and is there anything you may run?
   - What should stay out: details to skip, anything private?

3. **Research.** Read the sources properly and collect the facts the takeaways
   need, each with where it came from.

   | Topic | Ground it in |
   | --- | --- |
   | A codebase or system | The code and its config, read at the commit in front of you. Run it when that is cheap. Docs are a guide, the code decides. |
   | A paper | The paper's own text and figures. Quote its numbers; do not re-derive them. |
   | A concept | What you know, checked against one primary source. Say which. |
   | The user's results or notes | Only what they gave you. Numbers stay exactly as given. |

   Tell the user about anything you could not verify. Leave it off the page.

4. **Outline.** Plan the steps with [planning the steps](references/steps.md), then
   show the user the list: one line per step, with its heading and what the picture
   shows. Ask them to approve or change it.

5. **Build.** Write the visuals and steps with [visuals](references/visuals.md).

   ```bash
   mkdir -p explainers/<slug>
   cp assets/starter.js explainers/<slug>/steps.js      # then replace its contents
   python scripts/build.py explainers/<slug>
   ```

   `assets/` and `scripts/` are in this skill's directory. Put `explainers/` in the
   user's project unless they name another place. `<slug>` is a short lowercase
   name with hyphens.

6. **Check.**

   ```bash
   python scripts/check.py explainers/<slug>
   ```

   It rebuilds, runs every step's animation, and reports script errors, text that
   overlaps or leaves the drawing, captions that are too long, and animations that
   end on the wrong frame. Fix every error and every warning. Then open the
   screenshots it names and look at each step: the script cannot see a label
   sitting on a line, a crowded picture, or one that does not show what its
   caption says. Without a browser the script says it skipped; tell the user.

7. **Hand over.** Give the path of `explainers/<slug>/<slug>.html`, a complete page
   that opens in any browser. If you have a tool that publishes HTML artifacts,
   publish `explainers/<slug>/<slug>.artifact.html` with it and give the link too.
   Then say, briefly: which values on the page are examples, what you could not
   verify, and what you left out.

8. **Revise.** Edit `steps.js`, rebuild, and re-check the steps you touched
   (`--steps 4,9-11`). Publish to the same link. Make a second directory only when
   the user wants to keep the old version beside the new one.

The page is one file and easy to forward. Keep secrets and private names off it
unless the user asked for them to be there.

## Files

```text
explainers/<slug>/steps.js               the content: the only file you write
explainers/<slug>/<slug>.html            built: the page to open or share
explainers/<slug>/<slug>.artifact.html   built: the same page, for an artifact tool
explainers/<slug>/check/                 screenshots from the last check; safe to delete
```

## Guides

| Read | Before |
| --- | --- |
| [Planning the steps](references/steps.md): finding the reader's starting point, ordering ideas, writing captions, the outline to show | step 4 |
| [Visuals](references/visuals.md): which visual a step needs, the drawing API, animation, tables and listings | step 5 |
