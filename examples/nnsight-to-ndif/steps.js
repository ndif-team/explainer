// @title How NDIF Serves White-Box Inference
// @description A step-by-step walk from a few lines of nnsight on your laptop to a large model's internals coming back from NDIF.

// Sources: the NDIF server's docs/concepts (request-lifecycle, queue-and-scheduling, deployments-and-eviction)
// and the nnsight skill's remote guide. The two listings were run as written, the second with remote="local".
(function () {
  'use strict';
  var E = Explainer, S = E.S, show = E.show, vis = E.vis, cls = E.cls, sleep = E.sleep, tween = E.tween;

  function label(parent, x, y, text, klass, anchor) {
    return S('text', { x: x, y: y, 'class': klass || '', 'text-anchor': anchor || 'start' }, parent, text);
  }
  // A box with one or two centred lines; the second line is small.
  function boxed(parent, x, y, w, h, klass, lines) {
    var g = S('g', { 'class': 'fade' }, parent);
    S('rect', { x: x, y: y, width: w, height: h, rx: 6, 'class': klass }, g);
    var first = y + h / 2 + 4.5 - (lines.length - 1) * 8.5;
    lines.forEach(function (line, i) { label(g, x + w / 2, first + i * 17, line, i ? 'small muted' : '', 'middle'); });
    return g;
  }
  function at(g, p) { g.setAttribute('transform', 'translate(' + p[0] + ' ' + p[1] + ')'); }
  function travel(g, from, to, ms, alive) {
    return tween(ms, alive, function (t) { at(g, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]); });
  }
  function along(dot, path, ms, alive) {
    var length = path.getTotalLength();
    vis(dot, true);
    return tween(ms, alive, function (t) {
      var p = path.getPointAtLength(length * t);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    }, true).then(function (ok) { vis(dot, false); return ok; });
  }

  // ============================================================== a model you cannot see into, one you can, and an outline
  var access = E.svg(function (svg, kit) {
    label(svg, 120, 228, 'prompt', '', 'middle');
    S('path', { d: 'M160 223 H246', 'class': 'wire', 'marker-end': kit.arrow() }, svg);
    S('path', { d: 'M714 223 H800', 'class': 'wire', 'marker-end': kit.arrow() }, svg);
    label(svg, 846, 228, 'text', '', 'middle');
    var title = label(svg, 480, 136, '', 'small muted', 'middle');
    var shell = S('rect', { x: 250, y: 148, width: 460, height: 150, rx: 8 }, svg);
    var closedText = label(svg, 480, 228, 'the model', 'strong on-ink fade', 'middle');
    var cells = [];
    for (var i = 0; i < 6; i++) {
      var g = S('g', { 'class': 'fade' }, svg);
      cells.push({ g: g, rect: S('rect', { x: 274 + i * 72, y: 193, width: 56, height: 60, rx: 4 }, g),
                   text: label(g, 302 + i * 72, 227, '', 'num', 'middle') });
    }
    var hook = S('g', { 'class': 'fade' }, svg);
    S('path', { d: 'M518 255 V328', 'class': 'wire-a', 'marker-end': kit.arrow('a') }, hook);
    S('rect', { x: 408, y: 332, width: 220, height: 40, rx: 6, 'class': 'box-a' }, hook);
    label(hook, 518, 357, 'your code reads this layer', '', 'middle');
    var noWeights = label(svg, 480, 332, '0 GB of weights on your machine', 'small muted fade', 'middle');
    var dot = S('circle', { r: 6, cy: 223, 'class': 'dot-a', hidden: '' }, svg);

    var STATES = {
      closed:  { title: 'a hosted model', shell: 'box-ink', cells: null },
      open:    { title: 'your GPU, with the weights loaded', shell: 'group', cells: 'box-ink', hook: true },
      outline: { title: 'your machine, with no weights loaded', shell: 'group', cells: 'group', bare: true }
    };
    function apply(state) {
      var st = STATES[state];
      if (!st) throw new Error('unknown state "' + state + '"');
      title.textContent = st.title;
      shell.setAttribute('class', st.shell);
      show(closedText, !st.cells);
      cells.forEach(function (cell, i) {
        show(cell.g, !!st.cells); cls(cell.g, 'hot', false);
        cell.rect.setAttribute('class', st.cells || 'group');
        cell.text.textContent = st.bare ? 'h[' + i + ']' : 'layer ' + i;
        cell.text.setAttribute('class', st.bare ? 'num' : 'num on-ink');
      });
      show(hook, !!st.hook); show(noWeights, !!st.bare);
      vis(dot, false);
    }
    return { apply: apply, play: {
      closed: async function (alive) {                  // the prompt goes in and text comes out; nothing between is visible
        vis(dot, true);
        await tween(1800, alive, function (t) {
          var x = 160 + 640 * t;
          dot.setAttribute('cx', x); vis(dot, x < 250 || x > 710);
        }, true);
        vis(dot, false);
      },
      open: async function (alive) {
        show(hook, false);
        for (var i = 0; i < 6; i++) {
          cells.forEach(function (cell, j) { cls(cell.g, 'hot', j === i); });
          if (i === 3) show(hook, true);
          if (!(await sleep(i === 3 ? 900 : 320, alive))) return;
        }
        cells.forEach(function (cell) { cls(cell.g, 'hot', false); });
      },
      outline: async function (alive) {                 // the weights drain; the names stay
        show(noWeights, false);
        cells.forEach(function (cell, i) { cell.rect.setAttribute('class', 'box-ink'); cell.text.textContent = 'layer ' + i; cell.text.setAttribute('class', 'num on-ink'); });
        if (!(await sleep(500, alive))) return;
        for (var i = 0; i < 6; i++) {
          cells[i].rect.setAttribute('class', 'group'); cells[i].text.textContent = 'h[' + i + ']'; cells[i].text.setAttribute('class', 'num');
          if (!(await sleep(220, alive))) return;
        }
        show(noWeights, true);
      }
    } };
  });

  // ============================================================== the weights against a GPU, to scale
  var size = E.svg(function (svg) {
    var PX = 4.4;                                         // pixels per GB
    label(svg, 250, 112, '70.6 billion weights × 2 bytes each', 'small muted');
    var bars = [['Llama-3.1-70B, its weights', 141, 'fill-a'], ['an 80 GB GPU', 80, 'fill-ink'], ['a 24 GB GPU', 24, 'fill-ink']].map(function (row, i) {
      var y = 132 + i * 78;
      label(svg, 234, y + 23, row[0], '', 'end');
      return { rect: S('rect', { x: 250, y: y, width: row[1] * PX, height: 36, rx: 3, 'class': row[2] }, svg),
               text: label(svg, 260 + row[1] * PX, y + 23, row[1] + ' GB', 'strong fade'), full: row[1] * PX };
    });
    function apply(state) {
      if (state !== 'bars') throw new Error('unknown state "' + state + '"');
      bars.forEach(function (bar) { bar.rect.setAttribute('width', bar.full); show(bar.text, true); });
    }
    return { apply: apply, play: { bars: async function (alive) {
      bars.forEach(function (bar) { bar.rect.setAttribute('width', 0); show(bar.text, false); });
      for (var i = 0; i < bars.length; i++) {
        var bar = bars[i];
        if (!(await tween(300 + bar.full * 1.4, alive, function (t) { bar.rect.setAttribute('width', bar.full * t); }))) return;
        show(bar.text, true);
        if (!(await sleep(250, alive))) return;
      }
    } } };
  });

  // ============================================================== the two listings
  var localCode = E.code({
    title: 'nnsight, on a model small enough to run on your own GPU',
    text: 'from nnsight import TransformersModel\n' +
          '\n' +
          'model = TransformersModel("openai-community/gpt2", task="text-generation", dispatch=True)\n' +
          'prompt = "The Eiffel Tower is in the city of"\n' +
          '\n' +
          'with model.trace(prompt):\n' +
          '    resid = model.transformer.h[5].output.save()\n' +
          '\n' +
          'print(resid.shape)        # torch.Size([1, 10, 768])\n',
    states: { trace: { lit: [[6, 7]] } }
  });
  var remoteCode = E.code({
    title: 'The same trace, sent to NDIF',
    text: '# no dispatch=True, so no weights are loaded on this machine\n' +
          'model = TransformersModel("openai-community/gpt2", task="text-generation")\n' +
          '\n' +
          'with model.trace(prompt, remote=True):\n' +
          '    resid = model.transformer.h[5].output.save()\n',
    states: { remote: { lit: [4] } }
  });

  // ============================================================== your line taking turns with the forward pass
  var turns = E.svg(function (svg, kit) {
    var where = label(svg, 150, 132, '', 'small muted');
    label(svg, 98, 172, 'prompt', 'small', 'end');
    S('path', { d: 'M104 168 H146', 'class': 'wire', 'marker-end': kit.arrow() }, svg);
    var cells = [];
    for (var i = 0; i < 12; i++) {
      var g = S('g', {}, svg);
      S('rect', { x: 150 + i * 56, y: 150, width: 44, height: 36, rx: 3, 'class': 'box-quiet' }, g);
      label(g, 172 + i * 56, 172, String(i), 'num', 'middle');
      cells.push(g);
    }
    S('path', { d: 'M814 168 H850', 'class': 'wire', 'marker-end': kit.arrow() }, svg);
    label(svg, 858, 172, 'next token', 'small');
    var down = S('path', { d: 'M446 190 V290', 'class': 'wire-b fade', 'marker-end': kit.arrow('b') }, svg);
    var downLabel = label(svg, 436, 244, 'layer 5’s output', 'small t-b fade', 'end');
    var up = S('path', { d: 'M458 292 V192', 'class': 'wire fade', 'marker-end': kit.arrow() }, svg);
    var upLabel = label(svg, 468, 244, 'then the model carries on', 'small muted fade');
    var card = S('g', {}, svg);
    S('rect', { x: 290, y: 296, width: 324, height: 40, rx: 6, 'class': 'box' }, card);
    label(card, 452, 320, 'resid = model.transformer.h[5].output.save()', 'num', 'middle');
    var cardLabel = label(svg, 452, 358, '', 'small muted', 'middle');

    var STATES = {
      local:  { where: 'the model’s forward pass, on your GPU', card: 'your line' },
      server: { where: 'the model’s forward pass, on NDIF’s GPUs', card: 'your line, unpacked from the request' }
    };
    function apply(state) {
      var st = STATES[state];
      if (!st) throw new Error('unknown state "' + state + '"');
      where.textContent = st.where; cardLabel.textContent = st.card;
      cells.forEach(function (g, i) { cls(g, 'hot', false); cls(g, 'glow', i === 5); });
      [down, downLabel, up, upLabel].forEach(function (node) { show(node, true); });
      cls(card, 'glow', false);
    }
    async function play(alive) {
      [down, downLabel, up, upLabel].forEach(function (node) { show(node, false); });
      cells.forEach(function (g) { cls(g, 'glow', false); });
      for (var i = 0; i <= 5; i++) {
        cells.forEach(function (g, j) { cls(g, 'hot', j === i); });
        if (!(await sleep(260, alive))) return;
      }
      cls(cells[5], 'hot', false); cls(cells[5], 'glow', true);          // the model waits at layer 5
      show(down, true); show(downLabel, true);
      if (!(await sleep(600, alive))) return;
      cls(card, 'glow', true);                                           // your line runs
      if (!(await sleep(900, alive))) return;
      cls(card, 'glow', false);
      show(up, true); show(upLabel, true);
      if (!(await sleep(400, alive))) return;
      for (var k = 6; k < 12; k++) {
        cells.forEach(function (g, j) { cls(g, 'hot', j === k); });
        if (!(await sleep(220, alive))) return;
      }
      cells.forEach(function (g) { cls(g, 'hot', false); });
    }
    return { apply: apply, play: { local: play, server: play } };
  });

  // ============================================================== what goes into a request
  var pack = E.svg(function (svg, kit) {
    label(svg, 40, 190, 'your trace', 'small muted');
    S('rect', { x: 40, y: 198, width: 262, height: 58, rx: 6, 'class': 'box-quiet' }, svg);
    label(svg, 50, 221, 'with model.trace(prompt, remote=True):', 'num');
    label(svg, 50, 240, '    resid = ….h[5].output.save()', 'num');
    var parts = [['the source of your lines', 'resid = ….h[5].output.save()'],
                 ['the outside values they use', 'prompt = "The Eiffel Tower is in…"'],
                 ['the name of the model', 'openai-community/gpt2']].map(function (part, i) {
      var y = 104 + i * 92, g = S('g', { 'class': 'fade' }, svg);
      S('path', { d: 'M304 227 C340 227, 340 ' + (y + 28) + ', 376 ' + (y + 28), 'class': 'wire-muted' }, g);
      S('rect', { x: 380, y: y, width: 290, height: 56, rx: 6, 'class': 'box' }, g);
      label(g, 396, y + 23, part[0]);
      label(g, 396, y + 42, part[1], 'num muted');
      S('path', { d: 'M672 ' + (y + 28) + ' C706 ' + (y + 28) + ', 706 227, 738 227', 'class': 'wire-a', 'marker-end': kit.arrow('a') }, g);
      return g;
    });
    var request = S('g', { 'class': 'fade' }, svg);
    S('rect', { x: 742, y: 190, width: 170, height: 74, rx: 6, 'class': 'box-a' }, request);
    label(request, 827, 223, 'the request', 'strong', 'middle');
    label(request, 827, 242, 'sent to NDIF', 'small', 'middle');
    var weights = S('g', { 'class': 'fade' }, svg);
    S('rect', { x: 380, y: 384, width: 290, height: 40, rx: 6, 'class': 'group' }, weights);
    label(weights, 525, 409, 'the weights are never in a request', 'small muted', 'middle');
    var all = parts.concat([request, weights]);
    function apply(state) {
      if (state !== 'packed') throw new Error('unknown state "' + state + '"');
      all.forEach(function (g) { show(g, true); });
    }
    return { apply: apply, play: { packed: async function (alive) {
      all.forEach(function (g) { show(g, false); });
      for (var i = 0; i < all.length; i++) {
        if (!(await sleep(i < 3 ? 550 : 700, alive))) return;
        show(all[i], true);
      }
    } } };
  });

  // ============================================================== the system: your machine, the front door, the lines, the copies
  var sys = E.svg(function (svg, kit) {
    // your machine
    S('rect', { x: 30, y: 150, width: 170, height: 170, rx: 8, 'class': 'box' }, svg);
    label(svg, 115, 338, 'your machine', 'small muted', 'middle');
    S('rect', { x: 44, y: 164, width: 142, height: 46, rx: 4, 'class': 'box-quiet' }, svg);
    label(svg, 52, 183, 'with model.trace(…):', 'num');
    label(svg, 52, 199, '    resid = ….save()', 'num');
    var residBox = S('rect', { x: 44, y: 222, width: 142, height: 30, rx: 4 }, svg);
    var residText = label(svg, 115, 241, '', 'num', 'middle');
    var statusBox = S('g', {}, svg);                  // hidden while there is no status to show
    label(statusBox, 44, 270, 'status', 'small muted');
    S('rect', { x: 44, y: 276, width: 142, height: 30, rx: 4, 'class': 'track' }, statusBox);
    var statusText = label(statusBox, 115, 295, '', 'num strong', 'middle');
    function status(text) { statusText.textContent = text; vis(statusBox, !!text); }

    // NDIF
    var P = {};
    P.ndif = S('g', { 'class': 'fade' }, svg);
    S('rect', { x: 246, y: 100, width: 690, height: 300, rx: 10, 'class': 'group' }, P.ndif);
    label(P.ndif, 262, 123, 'NDIF', 'strong');
    function wire(d, kind) { return S('path', { d: d, 'class': (kind ? 'wire-' + kind : 'wire') + ' fade', 'marker-end': kit.arrow(kind) }, svg); }
    P.wIn = wire('M202 235 H268');
    P.door = boxed(svg, 270, 205, 90, 60, 'box', ['front door']);
    P.doorNote = label(svg, 315, 284, 'checks your key', 'small muted fade', 'middle');
    P.wDoorQueue = wire('M362 235 H376');
    P.queue = S('g', { 'class': 'fade' }, svg);
    S('rect', { x: 378, y: 222, width: 80, height: 26, rx: 4, 'class': 'track' }, P.queue);
    label(P.queue, 418, 214, 'queue', 'small muted', 'middle');
    P.wQueueRouter = wire('M460 235 H476');
    P.router = boxed(svg, 478, 213, 64, 44, 'box', ['router']);
    P.wRouterA = wire('M544 229 C556 229, 550 172, 560 172');
    P.wRouterB = wire('M544 241 C556 241, 550 342, 560 342');
    P.lineA = S('g', { 'class': 'fade' }, svg);
    S('rect', { x: 562, y: 159, width: 132, height: 26, rx: 4, 'class': 'track' }, P.lineA);
    label(P.lineA, 562, 151, 'line for Llama-3.1-70B', 'small muted');
    P.lineB = S('g', { 'class': 'fade' }, svg);
    S('rect', { x: 562, y: 329, width: 132, height: 26, rx: 4, 'class': 'track' }, P.lineB);
    label(P.lineB, 562, 321, 'line for another model', 'small muted');
    P.wA1 = wire('M696 172 C712 172, 712 158, 728 158');
    P.wA2 = wire('M696 172 C712 172, 712 222, 728 222');
    P.wB = wire('M696 342 H728');
    function copy(y, name, sub) {
      var g = S('g', { 'class': 'fade' }, svg);
      S('rect', { x: 730, y: y, width: 190, height: 52, rx: 6, 'class': 'box' }, g);
      label(g, 840, y + 23, name, '', 'middle');
      label(g, 840, y + 40, sub, 'small muted', 'middle');
      return g;
    }
    P.copyA1 = copy(132, 'Llama-3.1-70B', 'loaded on GPUs');
    P.copyA2 = copy(196, 'Llama-3.1-70B', 'a second copy');
    P.copyB = copy(316, 'another model', 'loaded on GPUs');
    P.waited = label(svg, 628, 204, 'oldest wait: over 30 s', 'small t-b fade', 'middle');
    P.direct = wire('M202 225 C420 225, 520 158, 728 158', 'a');
    P.directLabel = label(svg, 430, 190, 'your code', 'small t-a fade', 'middle');
    P.ret = wire('M825 130 V76 H115 V146', 'b');
    P.retLabel = label(svg, 470, 68, 'what you saved', 'small t-b fade', 'middle');
    P.c1 = label(svg, 115, 362, '1 · your code travels', 'small strong t-a fade', 'middle');
    P.c2 = label(svg, 825, 208, '2 · one loaded copy serves everyone', 'small strong t-a fade', 'middle');
    P.c3 = label(svg, 470, 68, '3 · only what you saved comes back', 'small strong t-b fade', 'middle');

    // requests
    function packet(klass) {
      var g = S('g', { 'class': 'fade' }, svg);
      S('rect', { x: -11, y: -9, width: 22, height: 18, rx: 3, 'class': klass }, g);
      return g;
    }
    var others = [0, 1, 2, 3, 4].map(function () { return packet('box-quiet'); });
    var mine = packet('fill-a');
    var dotA = S('circle', { r: 6, 'class': 'dot-a', hidden: '' }, svg);
    var dotB = S('circle', { r: 6, 'class': 'dot-b', hidden: '' }, svg);

    var OUT = [212, 235], DOOR = [315, 219], ROUTER = [510, 235];
    var Q = [[392, 235], [418, 235], [444, 235]];                         // the last is the front
    var A = [[578, 172], [608, 172], [638, 172], [668, 172]], B = [[578, 342], [608, 342], [638, 342], [668, 342]];
    var A1 = [746, 158], A2 = [746, 222], B1 = [746, 342];

    var DOOR_SET = ['ndif', 'wIn', 'door', 'doorNote', 'wDoorQueue', 'queue'];
    var LINES = DOOR_SET.concat(['wQueueRouter', 'router', 'wRouterA', 'wRouterB', 'lineA', 'lineB']);
    var SHARED = LINES.concat(['copyA1', 'copyB', 'wA1', 'wB']);
    var BACK = SHARED.concat(['ret', 'retLabel']);
    var STATES = {
      idea:    { on: ['ndif', 'copyA1', 'direct', 'directLabel', 'ret', 'retLabel'], status: '', saved: true, mine: null, others: [] },
      door:    { on: DOOR_SET, status: 'RECEIVED', mine: Q[0], others: [Q[2], Q[1]] },
      lines:   { on: LINES, status: 'QUEUED', mine: A[2], others: [A[3], B[3]] },
      shared:  { on: SHARED, status: 'QUEUED', mine: A[3], others: [A1, B1] },
      back:    { on: BACK, status: 'COMPLETED', saved: true, mine: A1, others: [null, B1, A[3]] },
      scale:   { on: SHARED.concat(['copyA2', 'wA2', 'waited']), status: 'COMPLETED', saved: true, mine: null, others: [A1, A[1], A2, A[3], A[2]] },
      whole:   { on: BACK, status: 'COMPLETED', saved: true, mine: A1, others: [null, B1, A[3], B[3]] },
      summary: { on: SHARED.concat(['ret', 'c1', 'c2', 'c3']), status: 'COMPLETED', saved: true, mine: A1, others: [null, B1, A[3], B[3]] }
    };
    function saved(on) {
      residBox.setAttribute('class', on ? 'box-b' : 'track');
      residText.textContent = on ? 'resid: a tensor' : 'resid';
    }
    function place(g, p) { show(g, !!p); if (p) at(g, p); }
    function apply(state) {
      var st = STATES[state];
      if (!st) throw new Error('unknown state "' + state + '"');
      for (var key in P) show(P[key], st.on.indexOf(key) >= 0);
      status(st.status); saved(!!st.saved);
      place(mine, st.mine);
      others.forEach(function (g, i) { place(g, st.others[i]); });
      vis(dotA, false); vis(dotB, false);
    }
    // your request, from your machine to the front of the shared queue
    async function toQueue(slot, alive) {
      status(''); show(mine, true); at(mine, OUT);
      if (!(await travel(mine, OUT, DOOR, 550, alive))) return false;
      if (!(await sleep(500, alive))) return false;                      // the key is checked
      if (!(await travel(mine, DOOR, slot, 450, alive))) return false;
      status('RECEIVED');
      return true;
    }
    async function answer(alive) {                                       // the saved value travels home
      show(P.ret, true);
      if (!(await along(dotB, P.ret, 1300, alive))) return false;
      saved(true); status('COMPLETED');
      return true;
    }
    return { apply: apply, play: {
      idea: async function (alive) {
        saved(false); show(P.ret, false); show(P.retLabel, false);
        if (!(await sleep(400, alive))) return;
        if (!(await along(dotA, P.direct, 1100, alive))) return;
        if (!(await sleep(500, alive))) return;
        show(P.retLabel, true);
        await answer(alive);
        status('');
      },
      door: async function (alive) {
        show(P.doorNote, false);
        if (!(await sleep(300, alive))) return;
        show(P.doorNote, true);
        await toQueue(Q[0], alive);
      },
      lines: async function (alive) {                                    // from the shared queue, each request goes to its model's line
        status('RECEIVED');
        at(others[0], Q[2]); at(others[1], Q[1]); at(mine, Q[0]);
        if (!(await sleep(700, alive))) return;
        var moves = [[others[0], Q[2], A[3]], [others[1], Q[1], B[3]], [mine, Q[0], A[2]]];
        for (var i = 0; i < moves.length; i++) {
          var m = moves[i];
          if (!(await travel(m[0], m[1], ROUTER, 380, alive))) return;
          if (!(await travel(m[0], ROUTER, m[2], 420, alive))) return;
        }
        status('QUEUED');
      },
      shared: async function (alive) {                                   // one at a time, in the order they arrived
        at(others[0], A[3]); at(others[1], B[3]); at(mine, A[2]);
        if (!(await sleep(700, alive))) return;
        if (!(await travel(others[0], A[3], A1, 450, alive))) return;
        if (!(await travel(mine, A[2], A[3], 350, alive))) return;
        await travel(others[1], B[3], B1, 450, alive);
      },
      back: async function (alive) {
        saved(false); status('RUNNING'); show(P.ret, false); show(others[2], false);
        if (!(await sleep(800, alive))) return;
        if (!(await answer(alive))) return;
        show(others[2], true);
      },
      scale: async function (alive) {                                    // a full line, then a second copy takes from it
        show(P.copyA2, false); show(P.wA2, false);
        at(others[2], A[3]); at(others[3], A[2]); at(others[4], A[1]); at(others[1], A[0]);
        if (!(await sleep(1100, alive))) return;
        show(P.copyA2, true); show(P.wA2, true);
        if (!(await sleep(700, alive))) return;
        if (!(await travel(others[2], A[3], A2, 450, alive))) return;
        await Promise.all([travel(others[3], A[2], A[3], 350, alive), travel(others[4], A[1], A[2], 350, alive),
                           travel(others[1], A[0], A[1], 350, alive)]);
      },
      whole: async function (alive) {                                    // the whole trip, once more
        saved(false); show(P.ret, false); show(others[2], false);
        if (!(await sleep(500, alive))) return;
        if (!(await toQueue(Q[2], alive))) return;
        if (!(await sleep(350, alive))) return;
        if (!(await travel(mine, Q[2], ROUTER, 380, alive))) return;
        if (!(await travel(mine, ROUTER, A[3], 420, alive))) return;
        status('QUEUED');
        if (!(await sleep(600, alive))) return;
        if (!(await travel(mine, A[3], A1, 450, alive))) return;
        status('RUNNING');
        if (!(await sleep(900, alive))) return;
        if (!(await answer(alive))) return;
        show(others[2], true);
      },
      summary: async function (alive) {
        [P.c1, P.c2, P.c3].forEach(function (c) { show(c, false); });
        var order = [P.c1, P.c2, P.c3];
        for (var i = 0; i < 3; i++) {
          if (!(await sleep(600, alive))) return;
          show(order[i], true);
        }
      }
    } };
  });

  // ============================================================== placing a model that is not loaded
  var gpus = E.svg(function (svg, kit) {
    var X0 = 400, PX = 5.25, ROWS = [100, 156, 212, 268], RAM = 350;      // 80 GB is 420 units wide
    label(svg, X0, 84, 'four GPUs with 80 GB each: an example cluster', 'small muted');
    ROWS.forEach(function (y, i) {
      label(svg, X0 - 12, y + 22, 'GPU ' + i, 'small', 'end');
      S('rect', { x: X0, y: y, width: 420, height: 34, rx: 4, 'class': 'track' }, svg);
    });
    var free = ROWS.map(function (y) { return label(svg, X0 + 430, y + 22, '', 'small muted fade'); });
    var ram = S('g', { 'class': 'fade' }, svg);
    label(ram, X0 - 12, RAM + 22, 'RAM', 'small', 'end');
    S('rect', { x: X0, y: RAM, width: 420, height: 34, rx: 4, 'class': 'track' }, ram);
    label(ram, X0 + 430, RAM + 22, 'not on a GPU', 'small muted');

    function segment(gb, klass) {
      var g = S('g', { 'class': 'fade' }, svg);
      S('rect', { x: 0, y: 0, width: gb * PX - 2, height: 34, rx: 4, 'class': klass }, g);
      return { g: g, text: label(g, (gb * PX - 2) / 2, 22, '', klass === 'box-a' ? 'small strong' : 'small', 'middle') };
    }
    function put(seg, row, startGb) { at(seg.g, [X0 + startGb * PX, row]); }
    var M = { P: segment(60, 'box-quiet'), Q: segment(50, 'box-quiet'), R: segment(30, 'box-quiet'), S: segment(25, 'box-quiet'),
              T: segment(45, 'box-quiet'), C: segment(18.9, 'box-a'), D: segment(70, 'box-a') };

    var ask = label(svg, 60, 150, '', '');
    var status = label(svg, 60, 172, '', 'num strong');
    boxed(svg, 60, 198, 190, 60, 'box', ['scheduler']);
    S('path', { d: 'M252 228 H342', 'class': 'wire', 'marker-end': kit.arrow() }, svg);
    var need = S('g', { 'class': 'fade' }, svg);
    label(need, 60, 300, 'model C needs', 'small muted');
    S('rect', { x: 60, y: 308, width: 16 * PX, height: 24, rx: 3, 'class': 'fill-a' }, need);
    S('rect', { x: 60 + 16 * PX + 2, y: 308, width: 2.9 * PX, height: 24, rx: 3, 'class': 'fill-quiet' }, need);
    label(need, 60, 352, '16 GB of weights + padding', 'small');
    label(need, 60, 369, '= 18.9 GB', 'small strong');
    var needD = label(svg, 60, 300, 'model D needs 70 GB, with padding', 'small fade');

    var STATES = {
      missing: { ask: 'a request for model C, which has no copy', status: 'PROVISIONING', free: [20, 30, 25, 35] },
      place:   { ask: 'a request for model C, which has no copy', status: 'DEPLOYING', free: [1, 30, 25, 35], C: true, need: true },
      evict:   { ask: 'later: a request for model D', status: 'DEPLOYING', C: true, D: true, needD: true, protect: true }
    };
    function apply(state) {
      var st = STATES[state];
      if (!st) throw new Error('unknown state "' + state + '"');
      ask.textContent = st.ask; status.textContent = st.status;
      put(M.P, ROWS[0], 0); put(M.Q, ROWS[1], 0); put(M.R, ROWS[2], 0); put(M.S, ROWS[2], 30);
      put(M.C, ROWS[0], 60); put(M.D, ROWS[3], 0);
      put(M.T, st.D ? RAM : ROWS[3], 0);
      M.P.text.textContent = st.protect ? 'P · pinned' : 'P';
      M.Q.text.textContent = st.protect ? 'Q · loaded 10 minutes ago' : 'Q';
      M.R.text.textContent = 'R'; M.S.text.textContent = 'S'; M.T.text.textContent = 'T';
      M.C.text.textContent = st.protect ? 'C · new' : 'C'; M.D.text.textContent = 'D';
      show(M.C.g, !!st.C); show(M.D.g, !!st.D); show(ram, !!st.D);
      show(need, !!st.need); show(needD, !!st.needD);
      free.forEach(function (text, i) { show(text, !!st.free); cls(text, 't-a', false); if (st.free) text.textContent = st.free[i] + ' GB free'; });
    }
    return { apply: apply, play: {
      missing: async function (alive) {
        status.textContent = '';
        if (!(await sleep(700, alive))) return;
        status.textContent = 'PROVISIONING';
      },
      place: async function (alive) {                                    // size it, look at each GPU, take the fullest one it fits on
        status.textContent = 'PROVISIONING'; show(M.C.g, false); show(need, false);
        free.forEach(function (text, i) { text.textContent = [20, 30, 25, 35][i] + ' GB free'; });
        if (!(await sleep(500, alive))) return;
        show(need, true);
        if (!(await sleep(900, alive))) return;
        for (var i = 3; i >= 0; i--) {
          free.forEach(function (text, j) { cls(text, 't-a', j === i); });
          if (!(await sleep(380, alive))) return;
        }
        if (!(await sleep(300, alive))) return;
        show(M.C.g, true); free[0].textContent = '1 GB free'; cls(free[0], 't-a', false);
        status.textContent = 'DEPLOYING';
      },
      evict: async function (alive) {                                    // T moves to RAM, D takes its GPU
        show(M.D.g, false); show(ram, false); put(M.T, ROWS[3], 0);
        if (!(await sleep(900, alive))) return;
        show(ram, true);
        if (!(await sleep(400, alive))) return;
        if (!(await tween(900, alive, function (t) { at(M.T.g, [X0, ROWS[3] + (RAM - ROWS[3]) * t]); }))) return;
        if (!(await sleep(300, alive))) return;
        show(M.D.g, true);
      }
    } };
  });

  // ============================================================== the three places a model's weights can be
  var levels = E.table({
    title: 'Where a model’s weights can be',
    columns: ['Where the weights are', 'NDIF’s name', 'Answers requests?', 'To start answering'],
    rows: [
      ['On the GPUs', '`HOT`', 'Yes', 'Nothing: it is already serving'],
      ['In the machine’s RAM', '`WARM`', 'No', 'Move the weights back onto a GPU'],
      ['On disk only', '`COLD`', 'No', 'Load the weights from disk']
    ],
    states: { all: { lit: [1] } }
  });

  // ============================================================== the steps
  E.start({ name: 'How NDIF serves white-box inference', steps: [
    { scene: 'Start', visual: sys, state: 'whole', still: true,
      heading: 'How NDIF serves white-box inference',
      body: 'What happens between writing a few lines of nnsight on your laptop and getting a large model’s internals back.',
      note: 'Press Next to begin.' },

    { scene: 'The problem', visual: access, state: 'closed',
      heading: 'A hosted model gives you only its output',
      body: 'You send a prompt and text comes back. Everything the model computed on the way stays inside the provider’s machine.' },
    { scene: 'The problem', visual: access, state: 'open',
      heading: 'To look inside, you run the model yourself',
      body: 'With the weights on your own GPU, every layer’s activations are yours to read or change. That access is what white-box means.' },
    { scene: 'The problem', visual: size, state: 'bars',
      heading: 'The models worth studying do not fit',
      body: 'Llama-3.1-70B has 70.6 billion weights. At 16 bits each that is 141 GB, before it has computed a single activation.',
      note: 'The bars are to scale.' },

    { scene: 'The idea', visual: sys, state: 'idea',
      heading: 'So send the experiment to the model',
      body: 'NDIF keeps the model loaded on its GPUs. Your code travels there and runs against the real weights. Only the values you asked for travel back.',
      note: 'The weights never move.' },

    { scene: 'An experiment', visual: localCode, state: 'trace',
      heading: 'An experiment is a few lines inside a trace',
      body: 'This is nnsight on a small model, run locally. The indented line reads what layer 5 computed for the prompt and marks it to keep.',
      note: '`save()` marks a value to keep after the trace ends.' },
    { scene: 'An experiment', visual: turns, state: 'local',
      heading: 'Those lines run in step with the model',
      body: 'The model starts its forward pass. At layer 5 it waits while your line runs on the real activations. Then it carries on.',
      note: 'Your line could also change the value before the model continues.' },
    { scene: 'An experiment', visual: access, state: 'outline',
      heading: 'On your machine the model is only an outline',
      body: 'For a remote run you load no weights. nnsight builds the model’s structure alone, so every layer has a name to write code against.',
      note: 'This is how a laptop can address a 70B model.' },
    { scene: 'An experiment', visual: remoteCode, state: 'remote',
      heading: '`remote=True` sends the trace',
      body: 'The lines inside the trace are the same. One new argument tells nnsight to ship them to NDIF and wait for the result.' },

    { scene: 'The trip', visual: pack, state: 'packed',
      heading: 'The trace is packed with what it uses',
      body: 'nnsight sends the source of your lines, the outside values they refer to, and the name of the model they are for.',
      note: 'The name is the model key: the model class, the repository, its revision and the task.' },
    { scene: 'The trip', visual: sys, state: 'door',
      heading: 'A front door checks it and puts it in line',
      body: 'The front door checks your API key and that your nnsight is recent enough, then drops the request into a queue. It never touches a GPU.',
      note: 'The front door is a FastAPI service and the queue is a Redis list. Your status is now `RECEIVED`.' },
    { scene: 'The trip', visual: sys, state: 'lines',
      heading: 'Each model has its own line',
      body: 'A router reads the model’s name on each request and moves it to that model’s line. A burst of requests for one model does not hold up another.',
      note: 'The router is NDIF’s dispatcher process. Your status is `QUEUED`, with your position in line.' },
    { scene: 'The trip', visual: sys, state: 'shared',
      heading: 'Everyone shares one loaded copy',
      body: 'Requests from different people wait in the same line. They run one at a time on the same copy of the model, in the order they arrived.',
      note: 'This is the saving: one copy of a 141 GB model serves every experiment on it.' },
    { scene: 'The trip', visual: turns, state: 'server',
      heading: 'Your code runs next to the weights',
      body: 'The copy unpacks your lines and runs them as your own GPU would: in step with its forward pass, on the real activations.',
      note: 'A copy is a process that holds the weights on GPUs: a Ray actor. Your status is `RUNNING`.' },
    { scene: 'The trip', visual: sys, state: 'back',
      heading: 'Only what you saved comes back',
      body: 'The values you marked with `save()` are sent to your machine and land in the variables you named. Every other activation is dropped.',
      note: 'Small results arrive on the open connection and large ones are fetched from object storage. Status: `COMPLETED`.' },
    { scene: 'The trip', visual: sys, state: 'scale',
      heading: 'A slow line gets a second copy',
      body: 'When the request that has waited longest has waited over 30 seconds, NDIF loads another copy of the model. Both copies take from the same line.',
      note: 'By default a model can grow to three copies.' },

    { scene: 'Cold starts', visual: gpus, state: 'missing',
      heading: 'A model that is not loaded is placed first',
      body: 'Your request names a model with no copy running. Before the request can join a line, NDIF has to find GPUs for the model and load it.',
      note: 'You see `PROVISIONING`, then `DEPLOYING`, then `QUEUED`.' },
    { scene: 'Cold starts', visual: gpus, state: 'place',
      heading: 'A scheduler sizes the model and picks GPUs',
      body: 'It reads the size of the weights from the checkpoint and adds room for activations. Then it takes the fullest GPU the model still fits on, which keeps empty GPUs free for large models.',
      note: 'The scheduler is NDIF’s controller. Default padding is 15% plus 500 MiB. The cluster here is an example.' },
    { scene: 'Cold starts', visual: gpus, state: 'evict',
      heading: 'With no room, another model makes way',
      body: 'The scheduler picks the GPU where the fewest models have to move, and moves them off it. It will not move a pinned model or, by default, one loaded less than an hour ago.',
      note: 'A request that was running on a moved copy goes back to the front of its line. Its owner sees no error.' },
    { scene: 'Cold starts', visual: levels, state: 'all',
      heading: 'A model can wait in three places',
      body: 'A model moved off the GPUs stays in the machine’s memory when there is room. From there it returns to a GPU without being read from disk again.' },

    { scene: 'The whole trip', visual: sys, state: 'whole',
      heading: 'One request, start to finish',
      body: 'Your lines are packed, checked at the front door, queued for their model, run in step with its forward pass, and answered with the values you saved.' },
    { scene: 'The whole trip', visual: sys, state: 'summary',
      heading: 'White-box access without holding the weights',
      body: 'You write the experiment as if the model were local. One loaded copy serves everyone who studies that model, and nobody downloads 141 GB to ask one question.' }
  ] });
})();
