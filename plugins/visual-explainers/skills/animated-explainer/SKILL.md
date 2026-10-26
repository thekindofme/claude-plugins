---
name: animated-explainer
description: Explain ONE thing — a concept, an investigation result, a proposed plan, an architecture, an algorithm, a data flow — using a single self-contained HTML page built almost entirely from ANIMATED diagrams. The animation is the explanation: it shows flow of data/information, sequence of steps, or how a system transforms state, so the idea lands fast. A lean, motion-first artifact, NOT a document site. Use when the user says "explain this with animation", "show me how X works visually", "animate this flow/plan/architecture", "make an animated diagram of …", or "walk me through X visually". Deliberately lightweight — do NOT use the heavyweight interactive-html-report skill for these.
---

# animated-explainer

Build a **single self-contained `.html` file** that explains one idea using **animated diagrams** and almost nothing else. The motion carries the meaning — data tokens travelling along edges, steps lighting up in sequence, a value transforming — so the reader *groks* the idea instead of reading paragraphs about it. This is a **high-bandwidth, low-prose** communication channel.

The point is **NOT to look pretty.** The point is to make a concept, an investigation finding, or a proposed plan **easy to understand fast**. Every animation must encode information. If a motion doesn't help the reader understand, cut it.

## This is the LEAN skill — do not reach for interactive-html-report

When this skill is invoked, **do not** use `[[interactive-html-report]]`. They are different tools:

| | **animated-explainer** (this) | interactive-html-report |
| --- | --- | --- |
| Goal | explain ONE idea via motion | turn a corpus into a navigable site |
| Length | one screen, a handful of steps | many chapters, scroll-deep |
| Prose | captions only | full progressive-disclosure text |
| Has | a stage + transport controls | sidebar nav, search, glossary, lens, filterable tables, pan/zoom modal |
| Output | one inlined `.html` | a `site/` folder |

If the user actually wants a full report/site/glossary/search → that's the other skill. If they want to *understand something* through animation → stay here.

## When to use

- "Explain how the background poller misclassifies a run — animate it."
- "Show me the proposed architecture as an animated flow."
- "Walk me through this algorithm visually."
- "Make an animated diagram of how a request flows through the gateway."
- "I don't get this — explain it to me with moving diagrams."

The source is usually **something already in the session** (an investigation you just did, a plan you proposed, a concept the user asked about). You don't need external inputs — you synthesise the explanation yourself, then encode it as an animated, stepped diagram.

## Not this skill when…

This skill explains ONE idea through motion. Pick a sibling when that's not the job:
- **a plan / findings / decision fork to review, annotate, or decide on** → a review-oriented page or doc, not an animation;
- **a large multi-chapter corpus needing nav / search / glossary** → [[interactive-html-report]] (the heavyweight one — see the table above);
- **a plain markdown reply would carry it** → just write that.
Sharing the built page (hosting it somewhere others can open it) is distribution after building, not an alternative.

## Core principles (hard requirements)

1. **Animation = meaning.** Motion shows one of: *flow* (data/info/control moving between parts), *sequence* (steps happening in order), or *transformation* (a value/state changing). No ambient motion, no decorative bounce/parallax/spin. One reader question per page: "which way does this read, and what happens?"
2. **Minimal text.** The visual explains; words only label and caption. One short caption per step (≤ ~140 chars). Node labels are 1–4 words. No paragraphs on the stage. If you're tempted to write a paragraph, it belongs in your chat reply, not the page.
3. **Stepped, reader-paced.** The explanation is a sequence of **steps/scenes**. The reader drives: prev / play-pause / next / restart, a clickable step indicator, and keyboard (← → space). Autoplay is allowed but must be pausable and must not loop forever silently.
4. **Build up, don't dump.** Reveal complexity progressively — each step adds or highlights one thing. The final step shows the whole picture. Starting with everything on-screen defeats the purpose.
5. **Self-contained & `file://` safe.** ONE `.html` file. All CSS + JS inlined. Any library via UMD CDN only (no ES-module CDN — it CORS-blocks under `file://`). No `fetch()` of sibling files, no build step, no framework.
6. **Honest motion.** Don't animate a flow that doesn't happen, or imply an order that isn't real. The animation is a claim about how the system behaves — keep it accurate to your investigation/plan.
7. **Respect `prefers-reduced-motion`.** Under reduce: tokens park statically at the target (no looping glide), marching-ants stop — but stepping still works so the explanation is fully usable without motion.

## Artifact anatomy

```
┌───────────────────────────────────────────────┐
│  Title — one line, what this explains          │
│                                                 │
│        ┌─────────  STAGE  ─────────┐            │   ← the animated diagram (SVG)
│        │   nodes light up,         │            │     lives here, full width
│        │   tokens travel edges     │            │
│        └───────────────────────────┘            │
│                                                 │
│  “Caption for the current step.”                │   ← one line, changes per step
│                                                 │
│  ◀   ⏸/▶   ▶▶   ↺     ● ● ○ ○ ○   Step 2/5      │   ← transport + step dots
└───────────────────────────────────────────────┘
```

- **Stage** — a hand-authored inline `<svg>` (preferred for full motion control) OR Mermaid (UMD) when a stock flowchart is enough. SVG wins when you need tokens travelling along paths or staged morphs.
- **Caption** — single line tied to the current step. This is where the words go.
- **Transport** — prev, play/pause, next, restart. **Step dots** are clickable (jump to step). A `Step n/N` readout.
- **Keyboard** — `←`/`→` step, `Space` play/pause. Always wire these.

Keep it to ONE stage and ONE flow vocabulary per page. If the idea genuinely needs two unrelated diagrams, prefer two steps over two stages.

## Animation techniques — toolbox (cheapest first)

1. **Staged reveal / highlight (the workhorse).** Each step toggles `.active` / `.done` / dimmed classes on nodes and edges. Elements from earlier steps stay `.done` (muted), the current step's elements are `.active` (highlighted), everything else is dim. This alone explains most sequences and architectures. Pure CSS transitions on opacity/stroke/fill.
2. **Travelling token along a path** (shows data/info *flowing*). A small `<circle>` glides along an edge `<path>` using `path.getPointAtLength()` driven by `requestAnimationFrame`. **The token LOOPS while the step is shown** — glide source→target, brief gap, repeat — so the flow keeps moving the whole time the reader is parked on that step (it doesn't fire once and stop). Start the loops on step-enter, stop them on step-leave. This is the single most effective "flow of data" device — use it on the edges that matter.
3. **Marching-ants edge** (shows active direction, near-free). `stroke-dasharray` + a CSS keyframe animating `stroke-dashoffset`. Seamless only if the offset distance equals the dash period (e.g. `dasharray: 6 6` → offset `-12`). For Mermaid flowcharts the edge selector is `path.flowchart-link`.
4. **Value transform** (shows something *changing*): count-up a number, swap a label, morph a bar's height/width, move a marker along a scale. Use when the point is a quantity or state changing over the steps.
5. **Focus pull** — dim the whole diagram except the subsystem the current step is about. Good for "now zoom your attention here" without an actual zoom.

Pick the *fewest* techniques that carry the meaning. A page that only uses #1 + #2 is often perfect.

## Starter scaffold

Adapt this — it's a working baseline, not a fixed template. Hand-authored SVG stage + a tiny step engine + transport. Inline everything into one file.

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>How X works</title>
<style>
  :root{--bg:#0f1115;--ink:#e8e8ea;--muted:#8a8f98;--line:#3a3f4b;
        --active:#4ea1ff;--done:#5b6472;--accent:#ffce5c;--ok:#3fd07f;}
  *{box-sizing:border-box} html,body{margin:0}
  body{background:var(--bg);color:var(--ink);
       font:16px/1.5 'Inter',system-ui,-apple-system,sans-serif;
       display:flex;flex-direction:column;align-items:center;min-height:100vh;gap:18px;padding:32px}
  h1{font-size:20px;font-weight:600;margin:0;letter-spacing:-.01em}
  .stage{width:min(960px,92vw)}
  svg{width:100%;height:auto;display:block}
  /* --- node / edge state machine --- */
  .node{opacity:.28;transition:opacity .35s ease}
  .node.done{opacity:.5}
  .node.active{opacity:1}
  .node .box{fill:#1a1e27;stroke:var(--line);stroke-width:1.5;transition:stroke .35s,fill .35s}
  .node.active .box{stroke:var(--active);fill:#16202e}
  .node text{fill:var(--ink);font-size:13px;font-weight:500}
  .edge{stroke:var(--line);stroke-width:2;fill:none;opacity:.3;transition:opacity .35s,stroke .35s}
  .edge.done{opacity:.45;stroke:var(--done)}
  .edge.active{opacity:1;stroke:var(--active)}
  /* marching ants only on active edges */
  .edge.active.flow{stroke-dasharray:6 6;animation:ants .6s linear infinite}
  @keyframes ants{to{stroke-dashoffset:-12}}
  .token{fill:var(--accent);filter:drop-shadow(0 0 4px var(--accent))}
  .caption{min-height:2.6em;max-width:760px;text-align:center;color:var(--ink);font-size:17px}
  .bar{display:flex;align-items:center;gap:14px}
  button{background:#1a1e27;color:var(--ink);border:1px solid var(--line);
         border-radius:8px;padding:8px 12px;font-size:15px;cursor:pointer}
  button:hover{border-color:var(--active)}
  .dots{display:flex;gap:8px}
  .dot{width:10px;height:10px;border-radius:50%;background:#2a2f3a;border:none;padding:0;cursor:pointer}
  .dot.on{background:var(--active)}
  .readout{color:var(--muted);font-variant-numeric:tabular-nums;min-width:64px;text-align:right}
  @media (prefers-reduced-motion: reduce){.edge.active.flow{animation:none}}
</style></head>
<body>
  <h1>How a request flows through the gateway</h1>

  <div class="stage">
    <svg viewBox="0 0 960 320">
      <!-- edges first (under nodes). data-edge id; add class="flow" to get marching ants -->
      <path class="edge flow" data-edge="a-b" d="M180,90 H360"></path>
      <path class="edge flow" data-edge="b-c" d="M520,90 H700"></path>
      <!-- nodes: a <g class="node" data-node="id"> with a .box rect + centered text -->
      <g class="node" data-node="a"><rect class="box" x="60" y="60" width="120" height="60" rx="10"></rect><text x="120" y="95" text-anchor="middle">Client</text></g>
      <g class="node" data-node="b"><rect class="box" x="360" y="60" width="160" height="60" rx="10"></rect><text x="440" y="95" text-anchor="middle">Gateway</text></g>
      <g class="node" data-node="c"><rect class="box" x="700" y="60" width="160" height="60" rx="10"></rect><text x="780" y="95" text-anchor="middle">Lambda</text></g>
    </svg>
  </div>

  <div class="caption" id="cap"></div>

  <div class="bar">
    <button id="prev" aria-label="Previous step">◀</button>
    <button id="play" aria-label="Play / pause">▶</button>
    <button id="next" aria-label="Next step">▶▶</button>
    <button id="restart" aria-label="Restart">↺</button>
    <div class="dots" id="dots"></div>
    <div class="readout" id="readout"></div>
  </div>

<script>
// ---- the explanation, as steps -------------------------------------------
// active: nodes/edges highlighted THIS step (prior ones go to .done/muted)
// flow:   edge ids that should fire a travelling token this step
const steps = [
  { caption:"A client sends a request.",            active:["a"],               flow:[] },
  { caption:"It hits the gateway over HTTPS.",       active:["a","a-b","b"],     flow:["a-b"] },
  { caption:"The gateway invokes the Lambda.",       active:["b","b-c","c"],     flow:["b-c"] },
  { caption:"The whole path, end to end.",           active:["a","a-b","b","b-c","c"], flow:["a-b","b-c"] },
];

// ---- tiny engine ----------------------------------------------------------
const cap=document.getElementById('cap'), dotsEl=document.getElementById('dots'),
      readout=document.getElementById('readout'), svg=document.querySelector('svg');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let i=0, playing=false, timer=null, tokens=[];

steps.forEach((_,k)=>{const b=document.createElement('button');b.className='dot';
  b.onclick=()=>{stop();go(k)};dotsEl.appendChild(b);});

function setClasses(activeSet, priorSet){
  document.querySelectorAll('[data-node],[data-edge]').forEach(el=>{
    const id=el.dataset.node||el.dataset.edge;
    el.classList.toggle('active', activeSet.has(id));
    el.classList.toggle('done', !activeSet.has(id) && priorSet.has(id));
  });
}
// a LOOPING token: glides source→target, brief gap, repeats — keeps flowing until stopped on step change
function startToken(edgeId){
  const path=svg.querySelector(`[data-edge="${edgeId}"]`); if(!path) return null;
  const len=path.getTotalLength();
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('r','6'); c.setAttribute('class','token'); svg.appendChild(c);
  if(reduce){ const p=path.getPointAtLength(len); c.setAttribute('cx',p.x); c.setAttribute('cy',p.y);
              return {stop(){c.remove();}}; }                 // reduced motion: park at the target, no loop
  const dur=700, gap=400; let raf=0, to=0, dead=false;
  function run(){ const t0=performance.now();
    (function frame(t){ if(dead) return; const k=Math.min(1,(t-t0)/dur);
      const p=path.getPointAtLength(k*len); c.setAttribute('cx',p.x); c.setAttribute('cy',p.y);
      if(k<1) raf=requestAnimationFrame(frame); else to=setTimeout(run,gap); })(performance.now()); }
  run();
  return {stop(){ dead=true; cancelAnimationFrame(raf); clearTimeout(to); c.remove(); }};
}
function go(n){
  i=Math.max(0,Math.min(steps.length-1,n));
  const active=new Set(steps[i].active||[]);
  const prior=new Set(); for(let k=0;k<i;k++)(steps[k].active||[]).forEach(x=>prior.add(x));
  setClasses(active,prior);
  cap.textContent=steps[i].caption;
  readout.textContent=`Step ${i+1}/${steps.length}`;
  [...dotsEl.children].forEach((d,k)=>d.classList.toggle('on',k===i));
  tokens.forEach(t=>t&&t.stop());             // stop the previous step's loops
  tokens=(steps[i].flow||[]).map(startToken); // start this step's loops — they keep flowing while parked here
}
function stop(){ playing=false; clearInterval(timer); document.getElementById('play').textContent='▶'; }
function play(){
  if(i>=steps.length-1) go(0);
  playing=true; document.getElementById('play').textContent='⏸';
  timer=setInterval(()=>{ if(i>=steps.length-1){stop();return;} go(i+1); }, 1900);
}
document.getElementById('prev').onclick=()=>{stop();go(i-1)};
document.getElementById('next').onclick=()=>{stop();go(i+1)};
document.getElementById('restart').onclick=()=>{stop();go(0)};
document.getElementById('play').onclick=()=>playing?stop():play();
addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'){stop();go(i+1)}
  else if(e.key==='ArrowLeft'){stop();go(i-1)}
  else if(e.key===' '){e.preventDefault();playing?stop():play()}
});
go(0);
</script>
</body></html>
```

The whole engine is the `steps` array + ~60 lines of JS. To explain something else you mostly rewrite the SVG stage and the `steps` array; the transport stays.

### When Mermaid is enough
If a stock flowchart conveys it and you only need flow *direction* (not travelling tokens), you can render Mermaid via the **UMD** build and animate edges with marching ants instead of hand-authoring SVG:
```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:false,theme:'dark'});mermaid.run();</script>
```
```css
svg path.flowchart-link{stroke-dasharray:6 6;animation:ants .6s linear infinite}
@keyframes ants{to{stroke-dashoffset:-12}}
```
But for true "data flowing through the system", hand-authored SVG + travelling tokens (#2 above) explains far better — prefer it whenever flow is the point. Quote Mermaid node labels that contain HTML/special chars: `A["text with <b>x</b>"]`.

## Process

1. **Nail the ONE thing.** State, in a sentence to yourself, the single idea this page must land (a flow, a sequence, a transformation, a plan, a failure mode). If there are two ideas, pick the primary or make it two steps — not two diagrams.
2. **Decompose into 3–7 steps.** Each step adds or highlights exactly one thing and gets one caption. Build toward a final "whole picture" step. Fewer steps is better — don't pad.
3. **Choose the motion that carries it** (toolbox above). Default: staged reveal (#1) + travelling tokens on the key edges (#2). Add others only if the idea needs them.
4. **Lay out the stage.** Hand-author the SVG: edges first (so nodes paint over them), then nodes. Keep labels 1–4 words. Generous spacing; this is desktop-viewed.
5. **Write the `steps` array** — `active` (and `flow`) ids per step + the captions. Captions are the only prose; make each one earn its place.
6. **Wire transport + keyboard + reduced-motion** (the scaffold already does). Autoplay must be pausable and must stop at the end (no silent infinite loop).
7. **Save** as a single `.html` to the scratchpad (or a path the user names), print the absolute path and an `open` command, and give a one-line summary of the steps. (No mandatory browser-verify — but if a Mermaid render or token path looks risky, open it once to eyeball it.)

## Anti-patterns

- **Don't decorate.** Spinning logos, pulsing glows on idle nodes, particle backgrounds, easing flourishes that mean nothing — all banned. Every motion answers "flow, sequence, or transform?"
- **Don't dump the whole diagram on step 1.** The build-up *is* the explanation. If the first frame shows everything, you've made a static diagram with a play button.
- **Don't write paragraphs on the stage.** Captions only. Long explanation goes in your chat reply, not the page.
- **Don't loop autoplay forever.** Stop at the last step. The reader controls pacing.
- **Don't reach for interactive-html-report.** No sidebar, search, glossary, lens, filterable tables, or pan/zoom modal. This is one stage + transport. If the user genuinely needs that machinery, that's the other skill — switch deliberately, don't bolt it on here.
- **Don't use an ES-module CDN or a build step.** UMD via CDN, inlined CSS/JS, opens by double-click under `file://`.
- **Don't animate a lie.** If you're unsure a flow/order is real, say so in chat and keep the diagram honest — don't invent a clean animation that misrepresents the system.
- **Don't ignore reduced-motion.** Tokens snap, ants stop; stepping still works.
