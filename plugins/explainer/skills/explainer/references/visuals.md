# Visuals

## Which visual a step needs

Choose by what the step claims.

| The step says | Show |
| --- | --- |
| How parts connect, or what flows where | A diagram: boxes and labelled arrows |
| Something happens in order or over time | That diagram, animated: a marker travelling, parts appearing in order, a counter |
| How one thing differs from another | The same picture with the one changed part in the second accent |
| What a quantity is made of | Bars or cells drawn to scale, with the number on them |
| A rule or formula | The rule in words on the drawing, beside values that satisfy it |
| Several things compared on the same attributes | A table, with the row in question lit |
| What the reader will read in a file or type | A listing, with the lines in question lit |
| A name for something already on screen | The previous picture, with that part lit |

- **Reuse a visual.** When the picture changes by one thing, the reader keeps
  their place. Twenty steps usually need four to seven visuals, each with several
  states.
- **Animate only what happens in order or over time**, and make the motion be the
  mechanism the caption states. A step with nothing to animate has no animation.
- **The resting frame stands alone.** Every animation ends on it. A reader who
  arrives by Back, with motion turned off, or through a screenshot sees only that
  frame, so it must show the step's point without the motion.
- **Label arrows** with what moves along them. Put a meaning on the mark it
  belongs to; use a legend only for an encoding that repeats.
- **Three colours.** Ink for structure. The first accent (`a`, blue) for what the
  step is about. The second (`b`, orange) for what it is contrasted with. Each
  accent keeps one meaning for the whole explainer.
- **Short labels in the drawing.** Sentences belong in the caption.
- **Mark example values** on the drawing or in the note.

## steps.js

```js
// @title How a KV Cache Works
// @description One sentence on what the page explains.
(function () {
  'use strict';
  var E = Explainer, S = E.S, show = E.show, cls = E.cls, sleep = E.sleep, tween = E.tween;

  var tokens = E.svg(function (svg, kit) { /* create elements */ return { apply: apply, play: { cached: play } }; });
  var cost = E.table({ columns: [...], rows: [...], states: {...} });

  E.start({ name: 'How a KV cache works', steps: [
    { scene: 'Start', visual: tokens, state: 'cached', still: true,
      heading: 'How a KV cache works', body: 'One sentence.', note: 'Press Next to begin.' },
    { scene: 'The cache', visual: tokens, state: 'cached',
      heading: 'A new token computes only itself', body: 'One or two sentences.' }
  ] });
})();
```

`@title` is the page's name. A step names a visual and one of its states;
`still: true` shows the state without animating. Backticks in a heading, body,
note or table cell become code.

## Drawings: `E.svg(build)`

`build(svg, kit)` creates every element once and returns two things:

- `apply(state)` draws the finished frame of a state. It must set everything a
  state or an animation can change, because it runs after any other state.
- `play[state]`, optional, is an `async function (alive)` that shows how that frame
  comes about. It must end on the frame `apply(state)` draws.

```js
var tokens = E.svg(function (svg, kit) {
  var cells = [];
  for (var i = 0; i < 6; i++) {
    var g = S('g', {}, svg);
    S('rect', { x: 120 + i * 40, y: 200, width: 32, height: 36, rx: 3, 'class': 'box-quiet' }, g);
    S('text', { x: 136 + i * 40, y: 223, 'text-anchor': 'middle', 'class': 'num' }, g, String(i));
    cells.push(g);
  }
  var read = S('path', { d: 'M336 190 C336 140, 136 140, 136 190', 'class': 'wire-a fade', 'marker-end': kit.arrow('a') }, svg);
  var marker = S('circle', { r: 6, 'class': 'dot-a', hidden: '' }, svg);

  var STATES = { plain: { read: false }, cached: { read: true } };
  function apply(state) {
    var st = STATES[state];
    if (!st) throw new Error('unknown state "' + state + '"');
    show(read, st.read);
    E.vis(marker, false);
    cells.forEach(function (g, j) { cls(g, 'hot', st.read && j === 5); });
  }
  async function play(alive) {
    for (var i = 0; i < 6; i++) {                       // each token is computed in turn
      cells.forEach(function (g, j) { cls(g, 'hot', j === i); });
      if (!(await sleep(220, alive))) return;
    }
    var length = read.getTotalLength();                 // then the newest one reads back
    E.vis(marker, true);
    await tween(600, alive, function (t) {
      var p = read.getPointAtLength(length * t);
      marker.setAttribute('cx', p.x); marker.setAttribute('cy', p.y);
    });
    E.vis(marker, false);
  }
  return { apply: apply, play: { cached: play } };
});
```

- The drawing is 960 by 460 units. Keep 40 units clear at the edges. Later
  elements draw over earlier ones.
- `S(tag, attributes, parent, text)` makes an SVG element.
- `show(node, on)` fades a node with class `fade`. `E.vis(node, on)` hides it at
  once. `cls(node, name, on)` toggles a class.
- `sleep(ms, alive)` and `tween(ms, alive, fn, linear)` resolve to `false` when the
  reader has moved on. Return when they do. `tween` calls `fn(t)` with `t` from 0
  to 1, eased unless `linear` is true: ease growth, keep travel linear.
- Measure (`getTotalLength`, `getBBox`) inside `apply` or `play`. While `build`
  runs the drawing is not on screen and measures as zero.
- A beat is 300 to 600 ms. A step's whole animation stays under about six seconds.

### Classes

| For | Classes |
| --- | --- |
| Text | default 13px; `small`, `num` (mono), `big` (a headline number), `strong`, `muted`, `t-a`, `t-b`, `on-ink` (on a dark fill) |
| Boxes | `box`, `box-quiet` (thin grey edge), `box-a`, `box-b`, `box-ink` (solid dark), `group` (dashed outline around parts), `track` (the empty part of a bar) |
| Fills | `fill-ink`, `fill-a`, `fill-b`, `fill-quiet`; `dot-a`, `dot-b` (a marker that travels) |
| Lines | `wire`, `wire-muted`, `wire-a`, `wire-b`, with `'marker-end': kit.arrow()`, `kit.arrow('muted')`, `kit.arrow('a')`, `kit.arrow('b')` |
| States | `fade` with `show()`; `dim` (30% opacity); on a `<g>`: `hot` (solid accent, the active one), `glow` (soft accent) |

For a colour the classes lack, add `explainers/<slug>/extra.css` and use the page's
variables (`var(--a)`, `var(--ink)`, `var(--line)`), which change with the theme.
Never write a literal colour.

## Tables: `E.table(spec)`

```js
var cost = E.table({
  title: 'Work to produce token 1,001',
  columns: ['', { label: 'Tokens run through the layers', align: 'right' }, { label: 'Rows attention reads', align: 'right' }],
  rows: [['Without a cache', '1,000', '1,000'], ['With a cache', '1', '1,000']],
  states: { without: { rows: 1, lit: [0] }, both: { lit: [1] } }
});
```

In a state, `rows` says which rows exist yet (a count, or a list of indexes;
default all) and `lit` which rows are highlighted. Lit rows appear one at a time.

## Listings: `E.code(spec)`

```js
var trace = E.code({
  title: 'Reading one layer with nnsight',
  text: 'model = TransformersModel("openai-community/gpt2", task="text-generation", dispatch=True)\n' +
        '\n' +
        'with model.trace("The Eiffel Tower is in the city of"):\n' +
        '    resid = model.transformer.h[5].output.save()\n',
  states: { whole: {}, save: { lit: [4] }, trace: { lit: [[3, 4]] } }
});
```

Lines count from 1. `lit` takes line numbers and `[from, to]` ranges; `show: [from,
to]` limits which lines exist. Use real code that runs, and keep a listing under
about 25 lines.

`E.html(function (panel) { ... return { apply, play }; })` is for anything else.

## What the check sees and what it does not

`scripts/check.py` reports script errors, unknown states, text over text, text
outside the drawing, long captions, a step taller than the window, and an
animation that does not end on its resting frame. Look at the screenshots for
the rest: a label on a line, a crowded drawing, uneven gaps, a picture that does
not show what the caption says.
