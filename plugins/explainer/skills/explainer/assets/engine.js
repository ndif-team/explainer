/* The explainer engine: the page frame, navigation, timing and drawing helpers.
   It is the same for every explainer. An explainer's own content lives in its steps.js. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A link may open on a step: #step-7. The page reads this once and never writes it, so only the reader moves it.
  // #step-7-still shows the resting frame with no animation; #step-7-check is what scripts/check.py loads.
  var opened = /^#step-(\d+)(?:-(still|check))?$/.exec(window.location.hash || '');
  var mode = opened ? opened[2] || 'play' : 'play';
  var fast = mode === 'check';   // animations finish at once, so a check runs their code and sees their last frame
  var root = document.documentElement;
  if (mode !== 'play') root.classList.add('ex-static');

  // ------------------------------------------------------------------------------------------ elements
  function S(tag, attrs, parent, text) {
    var node = document.createElementNS(NS, tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function H(tag, attrs, parent, text) {
    var node = document.createElement(tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function show(node, on) { node.classList.toggle('off', !on); }     // fades in and out; pair with class "fade"
  function vis(node, on) { node.toggleAttribute('hidden', !on); }    // appears and disappears at once (works on SVG too)
  function cls(node, name, on) { node.classList.toggle(name, !!on); }
  // Text with `backticks` becomes text with code spans.
  function rich(node, text) {
    node.textContent = '';
    String(text == null ? '' : text).split('`').forEach(function (part, i) {
      if (!part) return;
      if (i % 2) H('code', {}, node, part); else node.appendChild(document.createTextNode(part));
    });
  }

  // ------------------------------------------------------------------------------------------ the page frame
  var app = H('div', { 'class': 'ex-app' }, document.body);
  var top = H('div', { 'class': 'ex-top' }, app);
  var nameEl = H('span', {}, top);
  H('span', {}, top, 'Next, → or a click on a diagram moves on');
  var frame = H('main', { 'class': 'ex-frame' }, app);
  var caption = H('div', { 'class': 'ex-caption' }, frame);
  var labelEl = H('span', { 'class': 'ex-label' }, caption);
  var headingEl = H('h1', { id: 'ex-heading' }, caption);
  var bodyEl = H('p', {}, caption);
  var noteEl = H('p', { 'class': 'ex-note' }, caption);
  var stage = H('div', { 'class': 'ex-stage' }, frame);
  var controls = H('div', { 'class': 'ex-controls' }, app);
  var backBtn = H('button', { 'class': 'ex-btn', type: 'button', id: 'ex-back' }, controls, 'Back');
  var dotsEl = H('div', { 'class': 'ex-dots' }, controls);
  var countEl = H('span', { 'class': 'ex-count' }, controls);
  var replayBtn = H('button', { 'class': 'ex-btn', type: 'button', id: 'ex-replay' }, controls, 'Replay');
  var nextBtn = H('button', { 'class': 'ex-btn primary', type: 'button', id: 'ex-next' }, controls, 'Next');

  // A script error is shown on the page and recorded for scripts/check.py.
  function fail(message) {
    var seen = root.getAttribute('data-explainer-error');
    root.setAttribute('data-explainer-error', seen ? seen + ' | ' + message : message);
    H('div', { 'class': 'ex-error' }, caption, 'Script error: ' + message);
  }
  window.addEventListener('error', function (event) { fail(event.message || String(event.error)); });
  window.addEventListener('unhandledrejection', function (event) {
    fail(event.reason && event.reason.message ? event.reason.message : String(event.reason));
  });

  // ------------------------------------------------------------------------------------------ timing
  // Every step owns a token. Moving on makes the old step's token false, and its animation stops quietly.
  var runId = 0;
  function begin() { var id = ++runId; return function () { return id === runId; }; }
  function sleep(ms, alive) {
    if (fast) return Promise.resolve(alive());
    return new Promise(function (resolve) { setTimeout(function () { resolve(alive()); }, ms); });
  }
  // Calls fn(t) with t from 0 to 1 over ms. Resolves true when it ran to the end, false when the reader moved on.
  function tween(ms, alive, fn, linear) {
    if (fast) { if (alive()) fn(1); return Promise.resolve(alive()); }
    return new Promise(function (resolve) {
      var began = null;
      function tick(now) {
        if (!alive()) { resolve(false); return; }
        if (began === null) began = now;
        var t = Math.min(1, (now - began) / ms);
        fn(linear ? t : (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2));
        if (t < 1) requestAnimationFrame(tick); else resolve(true);
      }
      requestAnimationFrame(tick);
    });
  }

  // ------------------------------------------------------------------------------------------ visuals
  // A visual is drawn once and then moved between named states. It provides:
  //   apply(state)   draw the finished frame of that state, at once
  //   play           optional: { state: async function (alive) }, how the frame comes about. It must end on the
  //                  frame apply(state) draws. Await sleep() and tween() and return when either resolves false.
  var visuals = [];
  function register(el, clickable, made) {
    if (!made || typeof made.apply !== 'function') throw new Error('a visual must return { apply(state), play }');
    var visual = { el: el, clickable: clickable, apply: made.apply, play: made.play || {} };
    vis(el, false);
    stage.appendChild(el);
    visuals.push(visual);
    return visual;
  }

  // A drawing. build(svg, kit) creates the elements and returns { apply, play }.
  // kit.arrow(kind) is a marker-end value; kind is '', 'muted', 'a' or 'b', matching the wire classes.
  function svg(build, options) {
    var id = 'ex' + (visuals.length + 1);
    var el = S('svg', { viewBox: (options && options.viewBox) || '0 0 960 460', role: 'img', 'aria-labelledby': 'ex-heading' });
    var defs = S('defs', {}, el);
    ['', 'muted', 'a', 'b'].forEach(function (kind) {
      var marker = S('marker', { id: id + '-arr' + (kind ? '-' + kind : ''), viewBox: '0 0 10 10', refX: 9, refY: 5,
                                 markerUnits: 'userSpaceOnUse', markerWidth: 9, markerHeight: 9, orient: 'auto-start-reverse' }, defs);
      S('path', { d: 'M0 0 L10 5 L0 10 z', 'class': 'arr' + (kind ? '-' + kind : '') }, marker);
    });
    var kit = { arrow: function (kind) { return 'url(#' + id + '-arr' + (kind ? '-' + kind : '') + ')'; } };
    return register(el, true, build(el, kit));
  }

  // Free-form HTML. build(panel) creates the content and returns { apply, play }.
  function html(build) {
    var panel = H('div', { 'class': 'ex-panel' });
    return register(panel, false, build(panel));
  }

  function listed(value, count) {     // undefined: all; a number n: the first n; a list: those
    if (value == null) return function () { return true; };
    if (typeof value === 'number') return function (i) { return i < value; };
    return function (i) { return value.indexOf(i) >= 0; };
  }
  function litOneByOne(spec, render) {
    return function (state, alive) {
      var lit = (spec.states[state].lit || []).slice(), shown = [];
      render(state, shown);
      return (async function () {
        for (var i = 0; i < lit.length; i++) {
          if (!(await sleep(380, alive))) return;
          shown.push(lit[i]);
          render(state, shown);
        }
      })();
    };
  }
  function known(spec, state) {
    if (!spec.states || !spec.states[state]) throw new Error('unknown state "' + state + '"');
    return spec.states[state];
  }

  // A table. spec: { title, columns: ['Name', { label: 'Size', align: 'right' }], rows: [[...], ...],
  //                  states: { name: { rows: 3 or [0, 2] (which rows exist yet), lit: [1] (which are highlighted) } } }
  function table(spec) {
    var panel = H('div', { 'class': 'ex-panel' });
    if (spec.title) H('p', { 'class': 'ex-panel-title' }, panel, spec.title);
    var el = H('table', { 'class': 'ex-table' }, panel);
    var head = H('tr', {}, H('thead', {}, el));
    var aligns = spec.columns.map(function (column) {
      var align = typeof column === 'object' && column.align === 'right' ? 'right' : '';
      H('th', align ? { 'class': align } : {}, head, typeof column === 'object' ? column.label : column);
      return align;
    });
    var body = H('tbody', {}, el);
    var rows = spec.rows.map(function (cells) {
      var tr = H('tr', {}, body);
      cells.forEach(function (cell, c) { rich(H('td', aligns[c] ? { 'class': aligns[c] } : {}, tr), cell); });
      return tr;
    });
    function render(state, lit) {
      var exists = listed(known(spec, state).rows);
      rows.forEach(function (tr, i) {
        tr.hidden = !exists(i);
        cls(tr, 'lit', lit.indexOf(i) >= 0);
        cls(tr, 'dim', lit.length > 0 && lit.indexOf(i) < 0);
      });
    }
    return register(panel, false, {
      apply: function (state) { render(state, known(spec, state).lit || []); },
      play: litOneByOne(spec, render)
    });
  }

  // A listing. spec: { title, text, states: { name: { lit: [2, [5, 8]] (lines, counted from 1), show: [1, 20] } } }
  function code(spec) {
    var panel = H('div', { 'class': 'ex-panel' });
    if (spec.title) H('p', { 'class': 'ex-panel-title' }, panel, spec.title);
    var pre = H('pre', { 'class': 'ex-code' }, panel);
    var lines = spec.text.replace(/\n$/, '').split('\n').map(function (text) { return H('span', { 'class': 'ex-line' }, pre, text); });
    function inRanges(ranges, n) {
      return ranges.some(function (r) { return typeof r === 'number' ? r === n : n >= r[0] && n <= r[1]; });
    }
    function render(state, lit) {
      var st = known(spec, state), first = null;
      lines.forEach(function (line, i) {
        var n = i + 1, on = inRanges(lit, n);
        line.hidden = !!st.show && !(n >= st.show[0] && n <= st.show[1]);
        cls(line, 'lit', on);
        cls(line, 'dim', lit.length > 0 && !on);
        if (on && first === null) first = line;
      });
      if (first && first.offsetTop + first.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = first.offsetTop - 40;
    }
    return register(panel, false, {
      apply: function (state) { render(state, known(spec, state).lit || []); },
      play: litOneByOne(spec, render)
    });
  }

  // ------------------------------------------------------------------------------------------ steps
  var steps = [], current = 0, problems = [];

  // The drawing as text, without what cannot be seen: hidden parts, and differences smaller than a pixel.
  function snapshot(el) {
    var copy = el.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll('[hidden], .off'), function (node) {
      node.textContent = '';
      Array.prototype.slice.call(node.attributes).forEach(function (a) { if (a.name !== 'hidden') node.removeAttribute(a.name); });
    });
    return copy.outerHTML.replace(/ (class|style)=""/g, '')
      .replace(/-?\d+\.\d+/g, function (n) { return Math.abs(+n) < 2 ? (+n).toFixed(1) : String(Math.round(+n)); });
  }
  function enter(step, animate, alive) {
    var visual = step.visual;
    visual.apply(step.state);
    var play = typeof visual.play === 'function' ? visual.play.bind(null, step.state) : visual.play[step.state];
    if (!animate || !play) return Promise.resolve();
    var resting = fast ? snapshot(visual.el) : null;
    return Promise.resolve(play(alive)).then(function () {
      if (!alive()) return;
      var last = fast ? snapshot(visual.el) : null;
      visual.apply(step.state);       // the animation always settles on the resting frame
      if (!fast) return;
      if (snapshot(visual.el) !== resting) {
        problems.push('after the animation, apply("' + step.state + '") no longer draws the resting frame: apply must set everything play changes');
      } else if (last !== resting) {
        problems.push('the animation does not end on the frame apply("' + step.state + '") draws, so it will jump at the end');
      }
    });
  }

  function go(index, animate) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    var step = steps[current], alive = begin();
    visuals.forEach(function (visual) { vis(visual.el, visual === step.visual); });
    cls(stage, 'clickable', step.visual.clickable);
    var done = enter(step, animate && !step.still && !reduced && mode !== 'still', alive);

    var scene = steps.filter(function (other) { return other.scene === step.scene; });
    labelEl.textContent = step.scene + (scene.length > 1 ? ' · ' + (scene.indexOf(step) + 1) + '/' + scene.length : '');
    rich(headingEl, step.heading);
    rich(bodyEl, step.body);
    rich(noteEl, step.note); noteEl.hidden = !step.note;
    caption.classList.remove('in'); void caption.offsetWidth; caption.classList.add('in');

    Array.prototype.forEach.call(dotsEl.children, function (dot, i) {
      cls(dot, 'done', i < current); cls(dot, 'cur', i === current);
      if (i === current) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
    });
    countEl.textContent = (current + 1) + ' / ' + steps.length;
    backBtn.disabled = current === 0;
    replayBtn.disabled = !!step.still;
    nextBtn.textContent = current === steps.length - 1 ? 'Start over' : 'Next';
    return done;
  }
  function forward() { go(current === steps.length - 1 ? 0 : current + 1, true); }

  nextBtn.addEventListener('click', forward);
  backBtn.addEventListener('click', function () { go(current - 1, true); });
  replayBtn.addEventListener('click', function () { go(current, true); });
  stage.addEventListener('click', function () { if (steps.length && steps[current].visual.clickable) forward(); });
  document.addEventListener('keydown', function (event) {
    if (!steps.length || event.altKey || event.ctrlKey || event.metaKey) return;
    var onButton = event.target && event.target.closest && event.target.closest('button');
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || (event.key === ' ' && !onButton)) { event.preventDefault(); forward(); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(current - 1, true); }
    else if (event.key === 'Home') { event.preventDefault(); go(0, true); }
    else if (event.key === 'End') { event.preventDefault(); go(steps.length - 1, true); }
  });

  // ------------------------------------------------------------------------------------------ checks, for scripts/check.py
  var LIMITS = { heading: 64, body: 300, note: 210 };
  function seen(node, stop) {
    if (!node.getClientRects().length) return false;
    for (var n = node; n && n !== stop.parentNode; n = n.parentNode) {
      if (parseFloat(getComputedStyle(n).opacity) < 0.05) return false;
    }
    return true;
  }
  function inspect(step) {
    ['heading', 'body', 'note'].forEach(function (part) {
      var length = (step[part] || '').length;
      if (length > LIMITS[part]) problems.push('the ' + part + ' is ' + length + ' characters; keep it under ' + LIMITS[part]);
    });
    if (root.scrollHeight > window.innerHeight + 1) problems.push('the step is taller than the window: shorten the caption');
    var el = step.visual.el;
    if (el.tagName.toLowerCase() !== 'svg') return;
    var frameBox = el.getBoundingClientRect();
    var texts = Array.prototype.filter.call(el.querySelectorAll('text'), function (t) { return t.textContent.trim() && seen(t, el); })
      .map(function (t) { return { text: t.textContent.trim(), box: t.getBoundingClientRect() }; });
    texts.forEach(function (t) {
      if (t.box.left < frameBox.left - 1 || t.box.right > frameBox.right + 1 || t.box.top < frameBox.top - 1 || t.box.bottom > frameBox.bottom + 1) {
        problems.push('"' + t.text + '" runs outside the drawing');
      }
    });
    for (var i = 0; i < texts.length; i++) {
      for (var j = i + 1; j < texts.length; j++) {
        var a = texts[i].box, b = texts[j].box;
        var w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0 && h > 0 && w * h > 0.2 * Math.min(a.width * a.height, b.width * b.height)) {
          problems.push('"' + texts[i].text + '" overlaps "' + texts[j].text + '"');
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ start
  // config: { name, steps: [{ scene, visual, state, heading, body, note, still }] }
  function start(config) {
    steps = config.steps || [];
    if (!steps.length) throw new Error('Explainer.start needs steps');
    steps.forEach(function (step, i) {
      ['scene', 'visual', 'state', 'heading', 'body'].forEach(function (field) {
        if (step[field] == null) throw new Error('step ' + (i + 1) + ' has no ' + field);
      });
      if (visuals.indexOf(step.visual) < 0) throw new Error('step ' + (i + 1) + ': visual is not one made by Explainer.svg, table, code or html');
      var dot = H('button', { 'class': 'ex-dot' + (i > 0 && steps[i - 1].scene !== step.scene ? ' first' : ''), type: 'button',
                              id: 'ex-dot-' + (i + 1), 'aria-label': 'Step ' + (i + 1) + ': ' + step.heading, title: step.heading }, dotsEl);
      dot.addEventListener('click', function () { go(i, true); });
    });
    H('strong', {}, nameEl, config.name || document.title);
    root.setAttribute('data-explainer-steps', steps.length);

    var first = opened ? parseInt(opened[1], 10) - 1 : 0;
    var hot = window.claude && window.claude.hot;      // keeps the reader's place when a published page is updated
    function boot(data) { return go(data && typeof data.step === 'number' ? data.step : first, true); }
    if (mode !== 'check') {
      if (hot && hot.snapshot) hot.snapshot(function () { return { step: current }; });
      if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
      return;
    }
    // Timers, not animation frames: a headless browser that only prints the page draws no frames.
    var fonts = new Promise(function (resolve) {
      setTimeout(resolve, 1500);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(resolve);
    });
    boot({}).then(function () { return fonts; }).then(function () {
      setTimeout(function () {
        try { inspect(steps[current]); } catch (error) { fail(error.message); }
        root.setAttribute('data-explainer-lint', JSON.stringify(problems));
        root.setAttribute('data-explainer-done', '1');
      }, 50);
    });
  }

  window.Explainer = {
    S: S, H: H, show: show, vis: vis, cls: cls, rich: rich,
    sleep: sleep, tween: tween, reduced: reduced,
    svg: svg, html: html, table: table, code: code,
    start: start
  };
})();
