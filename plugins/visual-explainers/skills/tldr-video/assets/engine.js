/* tldr-video engine.
 *
 * Everything on screen is a pure function of time: seek(t) resets every tween
 * (latest first, so the earliest tween's initial state wins) and then re-applies
 * the ones that have started (earliest first). That makes frame-by-frame capture
 * deterministic and lets the preview player scrub freely.
 *
 * Stage is a fixed 1280x720 coordinate space. All x/y/w/h are in stage pixels.
 */
(function () {
  'use strict';

  const W = 1280, H = 720;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const EASE = {
    linear: (p) => p,
    in: (p) => p * p * p,
    out: (p) => 1 - Math.pow(1 - p, 3),
    inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    back: (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  };

  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function place(e, o) {
    if (o.x != null) e.style.left = o.x + 'px';
    if (o.y != null) e.style.top = o.y + 'px';
    if (o.w != null) e.style.width = o.w + 'px';
    if (o.h != null) e.style.height = o.h + 'px';
    return e;
  }
  function fmt(v, o) {
    const d = o.decimals != null ? o.decimals : 0;
    let s = v.toFixed(d);
    if (o.commas) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (o.prefix || '') + s + (o.suffix || '');
  }

  class Scene {
    constructor(def, index) {
      this.def = def;
      this.index = index;
      this.duration = def.duration;
      this.tweens = [];
      this.root = h('div', 'scene');
      this.capY = null;
    }

    /* ---------- core ---------- */

    // update(p, t): p = eased progress 0..1, t = scene-local seconds.
    // Must set its properties for ANY p, including 0 (that's the reset state).
    tween({ at = 0, dur = 0.4, ease = 'out', update }) {
      const fn = typeof ease === 'function' ? ease : EASE[ease] || EASE.out;
      this.tweens.push({
        at,
        reset: (t) => update(0, t),
        apply: (t) => update(fn(dur <= 0 ? 1 : clamp01((t - at) / dur)), t),
      });
    }
    custom(o) { this.tween(Object.assign({ ease: 'linear' }, o)); }

    // Toggle a class during [at, until).
    cls(el, name, at, until = Infinity) {
      this.tweens.push({
        at,
        reset: () => el.classList.remove(name),
        apply: (t) => el.classList.toggle(name, t < until),
      });
      return el;
    }

    // Entrance. enter: 'rise' (default) | 'fade' | 'pop' | 'none'
    show(el, { at = 0, dur = 0.35, enter = 'rise' } = {}) {
      if (enter === 'none') { this.tween({ at, dur: 0, update: (p) => { el.style.opacity = p; } }); return el; }
      this.tween({
        at, dur, ease: enter === 'pop' ? 'back' : 'out',
        update: (p) => {
          el.style.opacity = clamp01(p * 1.4);
          if (enter === 'rise') el.style.translate = `0 ${(1 - p) * 10}px`;
          if (enter === 'pop') el.style.scale = String(0.85 + 0.15 * p);
        },
      });
      return el;
    }
    hide(el, { at, dur = 0.3 } = {}) {
      this.tween({ at, dur, update: (p) => { el.style.opacity = 1 - p; } });
      return el;
    }
    // Dim to a lower opacity (e.g. de-emphasise the "old way" while the new one plays).
    dim(el, { at, dur = 0.3, to = 0.3 } = {}) {
      this.tween({ at, dur, update: (p) => { el.style.opacity = 1 - (1 - to) * p; } });
      return el;
    }
    move(el, { at, dur = 0.6, from, to, ease = 'inOut' }) {
      this.tween({ at, dur, ease, update: (p) => {
        el.style.left = from[0] + (to[0] - from[0]) * p + 'px';
        el.style.top = from[1] + (to[1] - from[1]) * p + 'px';
      } });
      return el;
    }

    // Raw positioned element. html may be a string or a Node.
    el(html, o = {}) {
      const e = h('div', 'el ' + (o.cls || ''));
      if (html instanceof Node) e.appendChild(html); else if (html != null) e.innerHTML = html;
      place(e, o);
      (o.parent || this.root).appendChild(e);
      if (o.at != null) this.show(e, { at: o.at, enter: o.enter, dur: o.enterDur });
      return e;
    }

    /* ---------- text ---------- */

    // cls: t-label | t-note | t-body | t-big | t-huge (+ c-red, c-gray, ...). Inline <span class="hl"> works.
    text(str, o = {}) { return this.el(str, Object.assign({ cls: 't-body' }, o, { cls: o.cls || 't-body' })); }
    note(str, o = {}) { return this.el(str, Object.assign({}, o, { cls: 't-note ' + (o.cls || '') })); }
    label(str, o = {}) { return this.el(str, Object.assign({}, o, { cls: 't-label ' + (o.cls || '') })); }

    // Stream text into `target` word-by-word (LLM style) or char-by-char (typing).
    // Layout is reserved up front, so nothing reflows while it streams.
    type(target, str, { at = 0, dur = 2, by = 'word', cursor = true, hl = true, mark = false, keepCursor = false, ease = 'linear' } = {}) {
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
      const parts = by === 'char' ? Array.from(str) : str.split(/(?<=\s)/);
      const toks = parts.map((w) => { const s = h('span', mark ? 'tok mark' : 'tok'); s.textContent = w; target.appendChild(s); return s; });
      const cur = cursor ? target.appendChild(h('span', 'cursor')) : null;
      if (cur) { cur.style.position = 'absolute'; cur.style.margin = '0'; }
      this.tween({ at, dur, ease, update: (p, t) => {
        const n = Math.round(p * toks.length);
        toks.forEach((s, i) => {
          s.style.visibility = i < n ? '' : 'hidden';
          s.classList.toggle('new', hl && p < 1 && i === n - 1);
        });
        if (!cur) return;
        const started = t >= at, done = p >= 1;
        const blinkOn = Math.floor(t * 2.5) % 2 === 0;
        cur.style.display = started && (!done || (keepCursor && blinkOn)) ? '' : 'none';
        const last = toks[Math.max(0, n - 1)];
        if (n === 0) { cur.style.left = toks[0].offsetLeft + 'px'; cur.style.top = toks[0].offsetTop + 3 + 'px'; }
        else {
          const trail = /\s$/.test(last.textContent) ? 8 : 0;
          cur.style.left = last.offsetLeft + last.offsetWidth - trail + 4 + 'px';
          cur.style.top = last.offsetTop + 3 + 'px';
        }
        cur.style.height = (last.offsetHeight || 24) - 6 + 'px';
      } });
      return toks;
    }

    /* ---------- wireframe pieces ---------- */

    // Window-style box. Returns the box element; box.body is the content area.
    box(o = {}) {
      const e = this.el(null, Object.assign({}, o, { cls: 'box ' + (o.cls || ''), enter: o.enter || 'pop' }));
      if (o.title) {
        const bar = h('div', 'box-bar');
        bar.appendChild(h('span', 'box-title', o.title));
        if (o.sub) bar.appendChild(h('span', 'box-sub', o.sub));
        e.appendChild(bar);
      }
      e.body = h('div', 'box-body ' + (o.bodyCls || ''), o.body != null ? o.body : '');
      e.appendChild(e.body);
      return e;
    }

    // Line that draws from -> to, with an optional labelled packet travelling along it.
    connector({ from, to, at = 0, dur = 0.45, packet, packetAt, packetDur = 0.9, arrow = false, dashed = false }) {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const line = h('div', 'conn-line');
      line.style.cssText = `left:${from[0]}px;top:${from[1] - 1}px;width:${len - (arrow ? 8 : 0)}px;rotate:${ang}deg;`;
      if (dashed) line.style.background = 'repeating-linear-gradient(90deg,var(--line) 0 7px,transparent 7px 13px)';
      this.root.appendChild(line);
      let head = null;
      if (arrow) {
        head = h('div', 'conn-head');
        head.style.cssText = `left:${to[0] - 10}px;top:${to[1] - 6}px;rotate:${ang}deg;transform-origin:100% 50%;`;
        this.root.appendChild(head);
      }
      this.tween({ at, dur, ease: 'inOut', update: (p) => {
        line.style.transform = `scaleX(${p})`;
        if (head) head.style.opacity = p >= 1 ? 1 : 0;
      } });
      if (packet) {
        const pk = h('div', 'conn-packet', packet);
        this.root.appendChild(pk);
        this.tween({ at: packetAt != null ? packetAt : at + dur, dur: packetDur, ease: 'inOut', update: (p) => {
          pk.style.left = from[0] + dx * p + 'px';
          pk.style.top = from[1] + dy * p + 'px';
          pk.style.opacity = p <= 0 || p >= 1 ? 0 : 1;
        } });
      }
      return line;
    }

    // Ticking number, e.g. a stopwatch. verdict: 'bad' | 'good' tints it once it lands.
    counter(o) {
      const e = this.el('', Object.assign({}, o, { cls: 'counter ' + (o.cls || ''), enter: o.enter || 'fade' }));
      const from = o.from || 0, d = Object.assign({ decimals: 1, suffix: 's' }, o);
      const start = o.countAt != null ? o.countAt : o.at || 0;
      this.tween({ at: start, dur: o.dur != null ? o.dur : 2, ease: o.ease || 'linear', update: (p) => {
        e.textContent = fmt(from + (o.to - from) * p, d);
        if (o.verdict) e.classList.toggle(o.verdict, p >= 1);
      } });
      return e;
    }

    // Labelled rows with score bars. items: [{label, value}], pick: index that wins.
    bars({ x, y, items, at = 0, stagger = 0.12, fillAt, dur = 0.5, pick, chipW = 120, rowH = 50, gap = 18, trackW = 210, max = 1, decimals = 2, suffix = '', parent }) {
      const fa = fillAt != null ? fillAt : at + items.length * stagger + 0.4;
      return items.map((it, i) => {
        const row = h('div', 'bar-row');
        row.style.cssText = `left:${x}px;top:${y + i * (rowH + gap)}px;height:${rowH}px;`;
        const chip = h('div', 'chip', it.label); chip.style.width = chipW + 'px';
        const track = h('div', 'bar-track'); track.style.width = trackW + 'px';
        const fill = h('div', 'bar-fill'); track.appendChild(fill);
        const val = h('div', 'bar-val');
        row.append(chip, track, val);
        (parent || this.root).appendChild(row);
        this.show(row, { at: at + i * stagger });
        const fi = it.fillAt != null ? it.fillAt : fa;
        this.tween({ at: fi, dur, ease: 'out', update: (p) => {
          fill.style.width = (it.value / max) * 100 * p + '%';
          val.textContent = p > 0 ? fmt(it.value * p, { decimals, suffix }) : '';
        } });
        if (pick === i) { this.cls(chip, 'on', fi + dur + 0.1); this.cls(fill, 'on', fi + dur + 0.1); }
        return { row, chip, fill, val };
      });
    }

    // Column (or row) of option chips. Returns the chip elements; light one up with s.cls(chip,'on',at,until).
    chips({ x, y, items, at = 0, stagger = 0.1, w = 150, h: ch = 46, gap = 14, dir = 'col' }) {
      return items.map((label, i) => {
        const c = this.el(label, { cls: 'chip', x: dir === 'col' ? x : x + i * (w + gap), y: dir === 'col' ? y + i * (ch + gap) : y, w, h: ch });
        this.show(c, { at: at + i * stagger });
        return c;
      });
    }

    // Row of process steps joined by arrows. Returns step elements.
    steps({ x, y, items, at = 0, stagger = 0.45, w = 190, h: sh = 64, gap = 56 }) {
      return items.map((label, i) => {
        const sx = x + i * (w + gap);
        const st = this.el(label, { cls: 'step', x: sx, y, w, h: sh });
        this.show(st, { at: at + i * stagger, enter: 'pop' });
        if (i < items.length - 1) this.connector({ from: [sx + w, y + sh / 2], to: [sx + w + gap, y + sh / 2], at: at + i * stagger + 0.2, dur: 0.3, arrow: true });
        return st;
      });
    }

    // Titled list. tone: 'good' (+ markers) | 'bad' (- markers, struck through) | 'plain'
    list({ x, y, title, tone = 'plain', items, at = 0, stagger = 0.4, strike, marker, fadeLast = false }) {
      const wrap = this.el(null, { x, y });
      if (title) { const tt = h('div', 'lst-title ' + tone, title); wrap.appendChild(tt); this.show(tt, { at, enter: 'pop' }); }
      const doStrike = strike != null ? strike : tone === 'bad';
      const mk = marker || (tone === 'good' ? '+' : tone === 'bad' ? '-' : '·');
      const rows = items.map((txt, i) => {
        const r = h('div', 'lst-item ' + tone, `<span class="mk">${mk}</span><span class="txt">${txt}</span>`);
        wrap.appendChild(r);
        const t0 = at + 0.35 + i * stagger;
        this.show(r, { at: t0 });
        if (doStrike) {
          const sl = h('div', 'strike'); r.appendChild(sl);
          this.tween({ at: t0 + 0.25, dur: 0.3, update: (p) => { sl.style.transform = `scaleX(${p})`; } });
        }
        return r;
      });
      if (fadeLast && rows.length) rows[rows.length - 1].style.filter = 'opacity(.45)';
      wrap.rows = rows;
      return wrap;
    }

    // Big number + label.
    stat(o) {
      const e = this.el(null, Object.assign({}, o, { enter: o.enter || 'rise' }));
      const v = h('div', 'stat-val ' + (o.valCls || '')), l = h('div', 'stat-label', o.label || '');
      e.append(v, l);
      if (typeof o.value === 'number') {
        const from = o.from || 0;
        this.tween({ at: o.at || 0, dur: o.dur != null ? o.dur : 1.2, ease: 'out', update: (p) => { v.innerHTML = fmt(from + (o.value - from) * p, o); } });
      } else v.innerHTML = o.value;
      return e;
    }

    // Scene closer: one plain line + one highlighted punchline, bottom-left.
    caption(str, { at }) { const e = h('div', 'cap', str); this.root.appendChild(e); this.show(e, { at }); return e; }
    punch(str, { at, dur = 0.45 }) {
      const e = h('div', 'punch', str); this.root.appendChild(e);
      this.tween({ at, dur, ease: 'out', update: (p) => { e.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`; } });
      return e;
    }

    /* ---------- custom drawing ---------- */

    // Absolutely positioned <svg> in stage coords (viewBox == its own w/h).
    svg({ x = 0, y = 0, w = W, h: sh = H, at, enter } = {}) {
      const NS = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', `0 0 ${w} ${sh}`);
      s.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${sh}px;overflow:visible;`;
      s.add = (tag, attrs = {}) => {
        const n = document.createElementNS(NS, tag);
        const base = tag === 'text' ? { 'font-family': 'JB Mono', 'font-weight': 700, 'font-size': 16, fill: '#1f1f1f' }
          : { fill: 'none', stroke: '#2a2a2a', 'stroke-width': 2 };
        Object.entries(Object.assign(base, attrs)).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); });
        s.appendChild(n); return n;
      };
      this.root.appendChild(s);
      if (at != null) this.show(s, { at, enter: enter || 'fade' });
      return s;
    }
    // Stroke-draw an SVG path/line/polyline.
    draw(node, { at = 0, dur = 0.8, ease = 'inOut' } = {}) {
      const len = node.getTotalLength ? node.getTotalLength() : 1000;
      node.style.strokeDasharray = len;
      this.tween({ at, dur, ease, update: (p) => { node.style.strokeDashoffset = len * (1 - p); } });
      return node;
    }

    /* ---------- internals ---------- */

    _mount(stage, total) {
      const d = this.def;
      const head = h('div', 'sc-head');
      head.append(h('span', 'sc-num', String(this.index + 1).padStart(2, '0')), h('span', 'sc-title', d.title));
      const rule = h('div', 'sc-rule');
      this.root.append(head, rule);
      stage.appendChild(this.root);
      rule.style.width = Math.max(200, head.offsetWidth) + 'px';
      this.tween({ at: 0, dur: 0.5, update: (p) => { head.style.opacity = 0.18 + 0.82 * p; } });
      this.tween({ at: 0.1, dur: 0.6, ease: 'inOut', update: (p) => { rule.style.transform = `scaleX(${0.0001 + p})`; } });
      d.build(this);
      // stable sort by start time
      this.tweens.forEach((tw, i) => { tw.i = i; });
      this.tweens.sort((a, b) => a.at - b.at || a.i - b.i);
      this.isLast = this.index === total - 1;
    }
    _seek(t) {
      for (let i = this.tweens.length - 1; i >= 0; i--) this.tweens[i].reset(t);
      for (const tw of this.tweens) if (t >= tw.at) tw.apply(t);
      const fadeOut = this.isLast ? 1 : clamp01((this.duration - t) / 0.3);
      this.root.style.opacity = Math.min(clamp01(t / 0.25 + 0.001), fadeOut);
    }
  }

  async function video(def) {
    const render = /[?&]render=1/.test(location.search);
    document.body.classList.toggle('render', render);
    const stage = document.getElementById('stage') || document.body.appendChild(Object.assign(h('div'), { id: 'stage' }));
    await Promise.all([400, 500, 700, 800].map((w) => document.fonts.load(`${w} 20px "JB Mono"`)));
    await document.fonts.ready;

    ['tl', 'tr', 'bl', 'br'].forEach((c) => stage.appendChild(h('div', 'fr-tick ' + c)));
    stage.appendChild(h('div', 'fr-border'));
    if (def.source) stage.appendChild(h('div', 'fr-source', `SOURCE: <b>${def.source}</b>`));

    const scenes = def.scenes.map((sd, i) => new Scene(sd, i));
    let acc = 0;
    scenes.forEach((s) => { s.start = acc; acc += s.duration; s._mount(stage, scenes.length); });
    const duration = acc;

    function seek(t) {
      t = Math.max(0, Math.min(duration - 1e-6, t));
      scenes.forEach((s) => {
        const on = t >= s.start && t < s.start + s.duration;
        s.root.style.visibility = on ? '' : 'hidden';
        if (on) s._seek(t - s.start);
      });
      return t;
    }

    // Layout lint, used by render.js --stills. Coordinates are only valid at scale 1 (render mode).
    function lint() {
      const out = [];
      const safe = { l: 40, t: 40, r: W - 40, b: H - 40 };
      scenes.forEach((s) => {
        seek(s.start + s.duration - 0.35);
        const tag = `scene ${s.index + 1} "${s.def.title}"`;
        const lows = [...s.root.querySelectorAll('.cap, .punch')].map((e) => e.getBoundingClientRect());
        const floor = lows.length ? Math.min(...lows.map((r) => r.top)) : safe.b - 30;
        s.root.querySelectorAll('.el, .bar-row, .cap, .punch, .sc-head, svg').forEach((e) => {
          if (getComputedStyle(e).opacity === '0') return;
          const r = e.getBoundingClientRect();
          if (!r.width || !r.height) return;
          const name = (e.className.baseVal != null ? 'svg' : e.className) + ' "' + (e.textContent || '').trim().slice(0, 28) + '"';
          if (r.left < safe.l || r.top < safe.t || r.right > safe.r || r.bottom > safe.b)
            out.push(`${tag}: ${name} leaves the frame (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)})`);
          const isLow = e.classList.contains('cap') || e.classList.contains('punch');
          if (!isLow && e.tagName !== 'svg' && e.parentNode === s.root && r.bottom > floor - 4 && lows.length)
            out.push(`${tag}: ${name} (bottom ${Math.round(r.bottom)}) collides with the caption zone (starts ${Math.round(floor)})`);
        });
        s.root.querySelectorAll('.box').forEach((b) => {
          const br = b.getBoundingClientRect();
          const seen = new Set();
          b.querySelectorAll('.el, .tok, .bar-row').forEach((k) => {
            const r = k.getBoundingClientRect();
            const owner = k.classList.contains('tok') ? k.parentNode : k;
            if (seen.has(owner)) return;
            if (!r.width || !(r.right > br.right - 4 || r.bottom > br.bottom - 4 || r.left < br.left)) return;
            seen.add(owner);
            out.push(`${tag}: "${(owner.textContent || '').trim().slice(0, 28)}" spills out of box "${(b.querySelector('.box-title') || b).textContent.trim().slice(0, 20)}"`);
          });
          if (b.style.height && b.scrollHeight > b.clientHeight + 2) out.push(`${tag}: box "${(b.textContent || '').trim().slice(0, 24)}" content overflows its height`);
        });
        s.root.querySelectorAll('.box-bar, .chip, .step').forEach((b) => {
          if (b.scrollWidth > b.clientWidth + 2) out.push(`${tag}: "${b.textContent.trim().slice(0, 24)}" is too wide for its container`);
        });
      });
      const words = scenes.map((s) => (s.root.textContent || '').trim().split(/\s+/).length);
      words.forEach((n, i) => { if (n > 70) out.push(`scene ${i + 1}: ${n} words on screen — too dense, cut text`); });
      return out;
    }

    window.__tldr = {
      duration, fps: def.fps || 30, seek, lint,
      scenes: scenes.map((s) => ({ title: s.def.title, start: s.start, duration: s.duration })),
    };
    seek(0);
    if (!render) player(stage, scenes, duration, seek);
    window.__ready = true;
  }

  // Live preview: fit-to-window, play/pause (space), scrub, ←/→ jump scenes, ?t=12 to start at 12s.
  function player(stage, scenes, duration, seek) {
    const bar = h('div', null, '<button id="pp">pause</button><span id="tc"></span><input id="sc" type="range" min="0" step="0.01"><span id="sn"></span>');
    bar.id = 'player'; document.body.appendChild(bar);
    const pp = bar.querySelector('#pp'), tc = bar.querySelector('#tc'), sc = bar.querySelector('#sc'), sn = bar.querySelector('#sn');
    sc.max = duration;
    const fit = () => { const k = Math.min(innerWidth / W, (innerHeight - 46) / H); stage.style.transform = `scale(${k})`; };
    addEventListener('resize', fit); fit();
    let t = parseFloat((location.search.match(/[?&]t=([\d.]+)/) || [])[1]) || 0, playing = true, last = performance.now();
    const paint = () => {
      seek(t); sc.value = t; tc.textContent = t.toFixed(1) + ' / ' + duration.toFixed(1) + 's';
      const cur = scenes.filter((s) => t >= s.start).pop(); sn.textContent = `scene ${cur.index + 1}/${scenes.length} · local ${(t - cur.start).toFixed(1)}s`;
    };
    const loop = (now) => { if (playing) { t += (now - last) / 1000; if (t >= duration) t = 0; paint(); } last = now; requestAnimationFrame(loop); };
    const toggle = () => { playing = !playing; pp.textContent = playing ? 'pause' : 'play'; };
    pp.onclick = toggle;
    sc.oninput = () => { t = parseFloat(sc.value); paint(); };
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      const cur = scenes.filter((s) => t >= s.start).pop();
      if (e.code === 'ArrowRight') { t = Math.min(duration - 0.01, cur.start + cur.duration); paint(); }
      if (e.code === 'ArrowLeft') { t = t - cur.start > 1 ? cur.start : Math.max(0, (scenes[cur.index - 1] || cur).start); paint(); }
    });
    requestAnimationFrame(loop);
  }

  window.TLDR = { video, EASE, W, H };
})();
