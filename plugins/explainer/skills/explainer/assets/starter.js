// @title Name Of The Explainer
// @description One sentence on what the page explains and for whom.

// Read ../references/visuals.md before writing visuals and ../references/steps.md before writing steps.
(function () {
  'use strict';
  var E = Explainer, S = E.S, show = E.show, cls = E.cls, sleep = E.sleep, tween = E.tween;

  // One visual per picture. A visual is drawn once and moved between named states.
  var pipeline = E.svg(function (svg, kit) {
    var boxes = ['input', 'model', 'output'].map(function (name, i) {
      var g = S('g', { 'class': 'fade' }, svg);
      S('rect', { x: 140 + i * 260, y: 190, width: 160, height: 60, rx: 6, 'class': 'box' }, g);
      S('text', { x: 220 + i * 260, y: 225, 'text-anchor': 'middle' }, g, name);
      return g;
    });
    var arrows = [0, 1].map(function (i) {
      return S('path', { d: 'M' + (302 + i * 260) + ' 220 H' + (398 + i * 260), 'class': 'wire fade', 'marker-end': kit.arrow() }, svg);
    });

    var STATES = { input: 1, all: 3 };            // how many boxes exist in each state
    function apply(state) {
      var count = STATES[state];
      if (count == null) throw new Error('unknown state "' + state + '"');
      boxes.forEach(function (g, i) { show(g, i < count); cls(g, 'glow', false); });
      arrows.forEach(function (a, i) { show(a, i + 1 < count); });
    }
    return {
      apply: apply,
      play: {
        all: async function (alive) {              // ends on the frame apply('all') draws
          apply('input');
          for (var i = 1; i < 3; i++) {
            if (!(await sleep(500, alive))) return;
            show(arrows[i - 1], true); show(boxes[i], true);
          }
        }
      }
    };
  });

  E.start({
    name: 'Name Of The Explainer',
    steps: [
      { scene: 'Start', visual: pipeline, state: 'all', still: true,
        heading: 'Name of the explainer',
        body: 'One sentence on what the reader will understand at the end.',
        note: 'Press Next to begin.' },
      { scene: 'First idea', visual: pipeline, state: 'input',
        heading: 'A heading that states the point of the step',
        body: 'One or two sentences. One new idea.' },
      { scene: 'First idea', visual: pipeline, state: 'all',
        heading: 'The next point',
        body: 'What the picture now shows that it did not show before.' }
    ]
  });
})();
