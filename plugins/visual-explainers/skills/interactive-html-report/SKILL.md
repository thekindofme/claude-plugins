---
name: interactive-html-report
description: Build a beautiful, interactive, single-page HTML site from a folder of markdown docs, a single markdown file, arbitrary user-supplied text, or content already produced earlier in the session. Use when the user wants to turn investigation findings, a multi-file report, a long synthesis, or session output into a readable, navigable, graphical HTML page. Always verifies the generated page in a real browser via chrome-devtools MCP (or fallback) and fixes defects before showing the user.
---

# interactive-html-report

Turn dense content into a polished single-page HTML site that progressively exposes complexity, defines its own jargon, and lets the reader navigate by both structure and search. The output is opened by double-click — it works under `file://` with no server.

## Target environment — desktop-only

These reports are read on a **wide display (≥1440px — a 16" laptop or an external monitor)**, opened by double-click. **Build desktop-only:** optimise hard for wide viewports and do **not** add mobile or responsive-collapse fallbacks (no `@media (max-width: …)` breakpoints, no hamburger nav, no phone-sized type). Spend that complexity budget on the wide-screen experience instead.

The one width rule that still holds is the prose **measure** (65ch) — long lines hurt readability on any screen. Everything that is *not* prose — diagrams, tables, charts — should break out and use the **full content width**. The mental model:

```
prose ........... narrow, 65ch (readability)
diagrams ........ FULL content width (break out of the prose column)
tables / charts . FULL content width
```

## When to use

Invoke this skill when the user asks for any of:
- *"Make this into an HTML page"* / *"build an interactive doc"*
- *"Turn this folder of markdown files into a website"*
- *"Compile this report into something I can share"* / *"...into a readable artefact"*
- *"Take everything we've discussed and present it visually"*
- *"Visualise this investigation"*

If the request is for a static one-page summary, a plain markdown response is simpler. This skill is for content that benefits from navigation, search, filtering, glossary, and visual structure.

## Inputs accepted

The skill works on any of these inputs; if the user doesn't specify, ask once with the option list:

1. **Folder of markdown files** — most common. Read every `.md` file (treat numerically-prefixed files as ordered sections), plus any `data/*.json` sidecars (use as data for searchable tables / charts).
2. **Single markdown file** — split into sections by H1/H2 boundaries; treat each section as its own chapter.
3. **Arbitrary text from the user** — the user pastes content directly. Structure it into chapters yourself before building.
4. **Session output** — content the agent produced earlier in this conversation. Re-assemble from context into a structured set of in-memory chapters before building.

For inputs 2–4, write the assembled source content to a temp working folder before building the HTML, so the build process is uniform across input types.

## Design principles — hard requirements

These are non-negotiable. Apply them in order — if two principles conflict, the earlier one wins.

### 1. Minimalist with excellent typography
- Restraint over decoration. **Whitespace is a feature.** Don't fill empty space — let content breathe.
- One primary type family for body, one for display (or the same with weight contrast). Use a careful type scale (e.g. 12 → 14 → 16 → 18 → 20 → 24 → 32 → 48 → 64).
- Line-height: 1.55–1.7 for body, 1.15–1.25 for display.
- Measure (line length): 60–75 characters for body, ~90 max. Use `max-width: 65ch` on prose containers. **This cap is for prose only** — diagrams, tables, and charts break out to the full content width (see "Layout widths" under Default visual language).
- Hierarchical headings — each level visually distinct, no two levels at the same weight + same size.
- Generous vertical rhythm. Section breaks use spacing + thin rules, not boxes around everything.
- Body weight 400, display weight 500 or 600 — avoid weight 700+ unless absolutely needed.

### 2. Readability-first
- Body text minimum 16px (18px preferred for long-form). Code 14px.
- High-contrast colours. WCAG AA (4.5:1 body) is the floor, AAA (7:1) preferred for body. Don't use a gray weaker than `#7A7A7A` on white for body text.
- Avoid full-justified text. Left-align everything.
- No walls. Break prose with subheads every 200–300 words. Use lists liberally where structure helps.
- Tabular content always uses real `<table>` — no flexbox impersonations.

### 3. Visual / graphical-first
- Every chapter must include at least one visual: Mermaid diagram, SVG illustration, embedded chart, or screenshot.
- Mermaid (via UMD CDN) for: architecture, flows, state machines, sequence diagrams, sankey-like mappings.
- Embed real screenshots when the source supplies them.
- Charts (bars, timelines, distributions) for any data the user might scan rather than read.
- Don't over-decorate. A clear diagram beats a stylised one.
- **Diagrams render large inline at the full content width** — they break out of the 65ch prose column so the reader sees the whole graph without scrolling or opening anything. Zoom + fullscreen controls are still on every diagram, but as a *secondary* path for the occasional graph that's too detailed even at full width — not how a normal diagram is read. See "Diagram interactivity" below.

### 3a. Diagram interactivity — hard requirement

Diagrams render at the full content width by default (the `.diagram-wrap` is a full-width / breakout track, not the prose column). Even so, some Mermaid graphs (long node labels, many nodes, sequence-diagram lifelines) carry more detail than fits even at full width, so every `.diagram-wrap` still exposes:

- **Per-diagram toolbar** in the top-right of the container with four controls + indicator:
  - `−` zoom out (×1/1.25)
  - `100%` current-zoom indicator (live updated)
  - `+` zoom in (×1.25)
  - `1:1` reset to 100%
  - `⛶` open in fullscreen modal
- **In-card (focused) pan/zoom — REQUIRED, and it is transform-based just like the modal.** The reader must be able to explore a diagram *without* opening fullscreen. The `.diagram-wrap` is itself a small bounded pan/zoom stage (`overflow: hidden`, a transformed `.mermaid` layer inside):
  - **Click + drag → pan** (grab → grabbing cursor). `preventDefault` on `mousedown` so the diagram isn't text/image-selected; track the drag on `window` so a fast drag off the card still pans.
  - **⌘/Ctrl + scroll wheel → zoom toward the cursor** (also catches trackpad pinch, delivered as a `ctrl`+wheel). The point under the cursor stays fixed.
  - **Plain scroll / two-finger swipe → scrolls the PAGE, not the diagram.** This is the one deliberate difference from the modal: an inline card lives inside a scrolling page, so the wheel handler must only `preventDefault` when `ctrlKey || metaKey` is held — otherwise return early and let the page scroll. Never trap the page's scroll under a diagram.
  - **Toolbar `+` / `−` / `1:1` drive the same transform** (zoom toward the card centre; `1:1` resets to 100% natural and re-centres).
  - **Default view = fit-to-width, capped at 100%** (`scale = min(1, stageW / naturalW)`), centred. The whole diagram is visible by default; the gestures are for inspecting detail. Give the card an explicit height = the fit height capped at ~720px, and **clamp** pan so the diagram can't be dragged fully out of view.
- **Fullscreen modal = a pan/zoom canvas (REQUIRED — not a static scroll box).** Opening a diagram (`⛶`) fills the viewport with a *navigable* canvas. Every diagram type (concept maps, flowcharts/DFDs, ER diagrams, sequence diagrams, state machines) must be navigable the way a reader expects of any diagram viewer:
  - **⌘/Ctrl + scroll wheel → zoom toward the cursor** (this also catches trackpad pinch, which the browser delivers as a `ctrl`+wheel event). The point under the cursor must stay fixed as the scale changes.
  - **Click + drag → pan** (grab → grabbing cursor). **Plain scroll / two-finger swipe → pan** (`deltaX`/`deltaY`).
  - **Keyboard:** arrow keys pan, `+`/`-` zoom toward centre, `0` fit-to-screen, `Esc` close.
  - **Toolbar:** `−` / live indicator / `+`, a `⤢` fit-to-screen, and `×` close; plus a small hint string e.g. `⌘/ctrl + scroll to zoom · drag to pan · 0 reset`.
  - **On open: fit the WHOLE diagram to the stage** (both width AND height, ~0.94 margin) and centre it — then let the user zoom well past that (range ~8%–1400%).
- **Both stages are transform-based, not scroll-based.** Each stage is `overflow: hidden` with a transformed layer inside (`transform: translate(tx,ty) scale(s)`, `transform-origin: 0 0`) — the in-card `.mermaid` layer for the inline view, the cloned `.dm-content` SVG for the modal. This is the only thing that makes cursor-anchored zoom and drag-pan possible; an `overflow: auto` scroll box can do neither. The two differ only in what *plain* scroll does and in extras: **in-card** lets plain scroll pass through to the page and zooms only on `⌘/Ctrl`+wheel (it's embedded in a scrolling page); the **modal** owns the viewport, so plain scroll pans there and it adds keyboard nav + fit-to-screen.
- **ESC closes the modal.** The `×` button too. Body scroll is locked while open (`body.modal-open { overflow: hidden }`).
- **Zoom mechanism (both stages):** size the SVG once to its natural pixels (`svg.style.width = naturalW + 'px'; svg.style.height = naturalH + 'px'; svg.style.maxWidth = 'none'` — Mermaid sets `max-width: 100%`, override it), then zoom by scaling the parent layer with `transform: scale(s)`, never by re-writing `svg.style.width`. Scaling the transform (not the SVG width) is what keeps the cursor anchored during zoom and lets drag-pan share the same `translate`.
- **Read natural width from `viewBox`, NOT from the `width` attribute.** Mermaid sets `width="100%"` on every SVG it renders. `parseFloat("100%")` returns the number `100`, which will then shrink every diagram to 100 pixels wide. Always check the SVG's `viewBox.baseVal.width` first; fall back to the `width` attribute only if it lacks a `%` suffix.
- **Default in-card view = fit-to-width, capped at 100%.** Initial `scale = min(1, stageW / naturalW)`, centred — never upscale a small diagram (keeps text crisp), but shrink a too-wide one to fit the card so the whole graph shows by default. Because the card is the full-width `.diagram-wrap`, most diagrams sit at or near 100% with everything visible; the reader zooms in only to inspect. This preserves legibility that Mermaid's default `width="100%"` rendering would otherwise destroy.
- **Container is a bounded transform stage.** `.diagram-wrap { overflow: hidden; max-height: ~900px }` spanning the full content width; set its explicit height in JS to the fit height (capped ~720px). The transformed `.mermaid` layer pans/zooms inside it; **clamp** `tx`/`ty` so the diagram can't be lost off-screen (centre it on the axes where it's smaller than the stage). The modal stage is the same idea at viewport scale.
- **Wire after Mermaid renders.** Mermaid's `run()` returns a Promise — initialise the toolbar/zoom in `.then()`, not at `DOMContentLoaded`. If you wire too early the SVGs don't exist yet.
- **Print:** hide the toolbar and modal in `@media print`, and undo the in-card stage so the full diagram lays out for PDF — reset `.diagram-wrap` to `height: auto; max-height: none; overflow: visible` and the `.mermaid` layer to `position: static; transform: none`.

Sketch of the JS (use this as a starting point, refine as needed):

```js
// ===== in-card (inline) pan/zoom: transform-based + SCROLL-SAFE =====
// Per .diagram-wrap. Drag pans · ⌘/Ctrl+wheel (or pinch) zooms at the cursor · plain wheel scrolls the PAGE.
function svgNaturalSize(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal; let w = vb && vb.width, h = vb && vb.height;  // viewBox is truth (Mermaid sets width="100%")
  const r = svg.getBoundingClientRect(); if (!w) w = r.width || 800; if (!h) h = r.height || w; return { w, h };
}
function activateCard(wrap, ind) {                                  // ind = this card's .zoom-indicator
  const svg = wrap.querySelector('svg'), merm = wrap.querySelector('.mermaid'); if (!svg) return;
  const { w: natW, h: natH } = svgNaturalSize(svg);
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.style.cssText = 'max-width:none;display:block;width:' + natW + 'px;height:' + natH + 'px';
  merm.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform';
  const MAX_H = 720, ZMIN = 0.2, ZMAX = 6, stageW = wrap.clientWidth;
  const fit = Math.min(1, stageW / natW);                          // default = fit-to-width, capped at 100%
  const stageH = Math.min(MAX_H, natH * fit); wrap.style.height = stageH + 'px';
  let s = fit, tx = 0, ty = 0;
  function clamp() { const cw = natW * s, ch = natH * s;            // keep the diagram from being lost off-screen
    tx = cw <= stageW ? (stageW - cw) / 2 : Math.min(0, Math.max(stageW - cw, tx));
    ty = ch <= stageH ? (stageH - ch) / 2 : Math.min(0, Math.max(stageH - ch, ty)); }
  function applyT() { clamp(); merm.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; if (ind) ind.textContent = Math.round(s * 100) + '%'; }
  function zoomAt(f, cx, cy) { const ns = Math.max(ZMIN, Math.min(ZMAX, s * f)); const px = (cx - tx) / s, py = (cy - ty) / s; s = ns; tx = cx - px * s; ty = cy - py * s; applyT(); }
  applyT();
  wrap.addEventListener('wheel', e => {                            // SCROLL-SAFE: zoom only with ⌘/Ctrl, else let the page scroll
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); const r = wrap.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let drag = false, lx, ly;                                        // drag to pan (track on window so a fast drag still pans)
  wrap.addEventListener('mousedown', e => { if (e.button) return; drag = true; lx = e.clientX; ly = e.clientY; wrap.classList.add('grabbing'); e.preventDefault(); });
  window.addEventListener('mousemove', e => { if (!drag) return; tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; applyT(); });
  window.addEventListener('mouseup', () => { drag = false; wrap.classList.remove('grabbing'); });
  return { in: () => zoomAt(1.25, stageW / 2, stageH / 2), out: () => zoomAt(1 / 1.25, stageW / 2, stageH / 2),
           reset: () => { s = 1; tx = ty = 0; applyT(); }, fs: () => openModal(svg) };   // wire to the toolbar buttons
}

// ===== fullscreen modal: transform-based pan/zoom canvas =====
// stage = .diagram-modal-stage (overflow:hidden), content = .dm-content (the transformed layer), ind = the % indicator.
const M_ZMIN = 0.08, M_ZMAX = 14;
let mScale = 1, mTx = 0, mTy = 0, mNatW = 1, mNatH = 1;
function svgNaturalSize(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal; let w = vb && vb.width, h = vb && vb.height;
  const r = svg.getBoundingClientRect(); if (!w) w = r.width || 800; if (!h) h = r.height || w; return { w, h };
}
function applyT() { content.style.transform = `translate(${mTx}px,${mTy}px) scale(${mScale})`; ind.textContent = Math.round(mScale * 100) + '%'; }
function fit() { const sw = stage.clientWidth, sh = stage.clientHeight;       // fit BOTH dimensions + centre
  mScale = Math.max(M_ZMIN, Math.min(sw / mNatW, sh / mNatH) * 0.94); mTx = (sw - mNatW * mScale) / 2; mTy = (sh - mNatH * mScale) / 2; applyT(); }
function zoomAt(f, cx, cy) { const ns = Math.max(M_ZMIN, Math.min(M_ZMAX, mScale * f));   // keep cursor point fixed
  const px = (cx - mTx) / mScale, py = (cy - mTy) / mScale; mScale = ns; mTx = cx - px * mScale; mTy = cy - py * mScale; applyT(); }
function openModal(srcSvg, title) {                                            // clone into .dm-content, size to natural, fit
  content.innerHTML = ''; const svg = srcSvg.cloneNode(true); const s = svgNaturalSize(srcSvg); mNatW = s.w; mNatH = s.h;
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.style.cssText = 'max-width:none;display:block;width:' + mNatW + 'px;height:' + mNatH + 'px';
  content.appendChild(svg); modal.classList.add('show'); document.body.classList.add('modal-open'); fit();
}
function close() { modal.classList.remove('show'); document.body.classList.remove('modal-open'); }
stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect();   // ⌘/ctrl(+pinch)=zoom, else pan
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
  else { mTx -= e.deltaX; mTy -= e.deltaY; applyT(); } }, { passive: false });
let drag = false, lx, ly;                                                       // drag to pan
stage.addEventListener('mousedown', e => { if (e.button) return; drag = true; lx = e.clientX; ly = e.clientY; stage.classList.add('grabbing'); e.preventDefault(); });
window.addEventListener('mousemove', e => { if (!drag) return; mTx += e.clientX - lx; mTy += e.clientY - ly; lx = e.clientX; ly = e.clientY; applyT(); });
window.addEventListener('mouseup', () => { drag = false; stage.classList.remove('grabbing'); });
document.addEventListener('keydown', e => { if (!modal.classList.contains('show')) return;            // keyboard nav
  if (e.key === 'Escape') return close();
  if (e.key === '0') { e.preventDefault(); fit(); }
  else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.2, stage.clientWidth / 2, stage.clientHeight / 2); }
  else if (e.key === '-') { e.preventDefault(); zoomAt(1 / 1.2, stage.clientWidth / 2, stage.clientHeight / 2); }
  else if (e.key.indexOf('Arrow') === 0) { e.preventDefault(); const d = 70;
    mTx += e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0; mTy += e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0; applyT(); } });
```

Sketch of the CSS:

```css
/* full-width breakout: diagram spans the whole content track, not the 65ch prose column */
/* in-card pan/zoom stage: overflow hidden + a transformed .mermaid layer (explicit height set in JS) */
.diagram-wrap { position: relative; overflow: hidden; max-height: 900px; width: 100%; cursor: grab; touch-action: pan-y; }
.diagram-wrap.grabbing { cursor: grabbing; }
.diagram-wrap .mermaid { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.diagram-wrap .mermaid svg { display: block; max-width: none !important; }
.diagram-toolbar { position: absolute; top: 8px; right: 8px; display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); z-index: 5; }
.dbtn { width: 30px; height: 28px; border: none; background: transparent; border-radius: 5px; cursor: pointer; }
.zoom-indicator { display: inline-flex; align-items: center; min-width: 38px; justify-content: center; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.diagram-modal { position: fixed; inset: 0; z-index: 1500; display: none; flex-direction: column; background: var(--surface); }
.diagram-modal.show { display: flex; }
.diagram-modal-bar { display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface-2); gap: 14px; }
.diagram-modal-stage { flex: 1; overflow: hidden; position: relative; cursor: grab; touch-action: none; }  /* pan/zoom viewport */
.diagram-modal-stage.grabbing { cursor: grabbing; }
.dm-content { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }       /* the transformed layer */
.dm-content svg { display: block; max-width: none !important; }
.diagram-modal-bar .hint { font-family: monospace; font-size: 11px; color: var(--muted); margin-left: auto; }
body.modal-open { overflow: hidden; }
@media print { .diagram-toolbar, .diagram-modal { display: none !important; }
  .diagram-wrap { max-height: none !important; height: auto !important; overflow: visible !important; cursor: auto; }
  .diagram-wrap .mermaid { position: static !important; transform: none !important; } }   /* undo the pan/zoom stage so the full diagram prints */
```

The fullscreen modal **clones** the source SVG into the `.dm-content` layer so the in-card pan/zoom state stays independent of the modal's. Read the clone's natural size fresh from its **`viewBox` (width AND height)** to compute the fit. Do NOT add `overflow: auto` or flex-centering to the stage; the `.dm-content` transform owns all positioning.

### 3b. Animated flow diagrams — hard requirement

**Key flows must move.** Any diagram that depicts a flow — a pipeline, lifecycle, request path, fallback chain, decision routing — animates its direction of flow by default. Static is the exception, reserved for structural diagrams (ER diagrams, layout wireframes, nested-box models) where nothing "travels". Motion here is informational, not decorative: it shows the reader which way the graph reads without them tracing arrowheads.

Three techniques, cheapest first:

1. **Marching-ants Mermaid edges** (the workhorse — near-free, applies to every flowchart). Pure CSS on the rendered SVG:
```css
svg path.flowchart-link { stroke-dasharray: 7 5; animation: edgeflow .85s linear infinite; }
@keyframes edgeflow { to { stroke-dashoffset: -12; } }
body.anim-off svg path.flowchart-link { animation: none; }
@media (prefers-reduced-motion: reduce) { svg path.flowchart-link { animation: none !important; } }
```
   The loop is seamless **only if the offset distance equals the dash period** (dash 7 + gap 5 → offset −12); any other value makes the dashes visibly "jump" each cycle. Negative offset flows source → target. This selector covers flowcharts only — sequence/state diagrams use different edge classes; leave them static rather than guessing selectors.
2. **CSS/JS-cycled stepper** for the report's one central linear process (often in the hero): plain HTML steps + a `setInterval` toggling `.live`/`.done` classes. Encode loops by revisiting indices in the sequence (e.g. `[1,2,3,4,5,6,5,7]` to show a verify → fix → re-verify loop). Skip ticks while paused.
3. **SMIL travelling pulse** (`<circle><animateMotion path="…"/></circle>`) for hand-authored SVG chains and fallback paths. No JS needed to run — but note a CSS pause class **cannot** stop SMIL; the pause toggle must call `svg.pauseAnimations()` / `svg.unpauseAnimations()` on that SVG.

Required controls, all three techniques:
- A **global pause/resume toggle** (sidebar), persisted to localStorage. It must stop *everything*: CSS animations via a `body.anim-off` rule set, JS steppers by skipping ticks, SMIL via `pauseAnimations()`.
- **`prefers-reduced-motion: reduce` starts the page with animations off** (and the toggle still allows opting in).
- **`@media print`: `animation: none`** — no mid-frame dash artefacts in the PDF.
- Keep it subtle: travelling dashes and a single pulse communicate direction; blinking, bouncing, or parallax communicate nothing. One animation vocabulary per page.

### 4. Progressive disclosure
- The first screen must answer "what is this?" in <90 seconds. Lead with a tight executive summary in **prose**.
- **No KPI / stat-pill strips in the hero.** A row of big numbers ("7 process steps · 26 defect patterns · 25 glossary terms") reads as decoration, not information — the reader can't act on counts without context. If a number genuinely matters, state it in the summary prose where its meaning is attached.
- Mid-depth: chapter cards with one mermaid + one paragraph + key callouts.
- Full depth: "Read deeper →" / accordion to reveal the verbatim source content.
- Default state: chapters collapsed except the executive summary. Let the reader opt into depth.

### 5. Zero-context glossary
- Build a glossary of every domain-specific term used in the report. Default minimum: 15 terms. Bigger reports may need 30+.
- Two interaction modes:
  - **Inline popovers** — wrap each term's first inline occurrence (and optionally all occurrences) in `<dfn data-term="...">` with a dotted-underline cue. Hover/click shows a small popover.
  - **Side panel** — a button in the header opens a searchable side panel with all terms, each with a 1-sentence definition + an expandable "Why it matters here" tying it to the specific report context.
- If the report is about a specialised system, **assume the reader has zero context.** Define jargon explicitly. Better to over-explain than to gatekeep.

### 6. Interactive (lightweight, not heavy)
- Top-bar **search** with debounced inline highlighting across the page.
- **Workstream / topic lens** if the report covers multiple parallel threads — toggleable filters that dim unrelated content. Use `data-tag="..."` attributes on relevant elements.
- **Filterable tables** for any tabular data with >20 rows (text search + column-specific filters).
- **Accordion expansions** for "read deeper".
- **localStorage persistence** for any user state (checked items, toggled filters) the reader might want to keep across reloads.
- Scroll-spy active-section highlighting in the sidebar nav.
- Print-friendly via `@media print` (sidebar + glossary hide, accordions expand, layout reflows cleanly for PDF export).

### 7. File:// safe — no server required
- All data **must be inlined** into the HTML (use `<script type="application/json" id="report-data">…</script>` blob, parse with JS at load).
- Libraries via CDN, not local node_modules. Use UMD/IIFE builds for `file://` compatibility (e.g. `mermaid.min.js` UMD, not the ES-module variant which CORS-blocks under file://).
- No `fetch()` calls to sibling files (CORS-blocked under `file://`).
- One single `index.html` if possible; CSS and JS split out to `assets/` is fine.

## Default visual language

Use this as the baseline unless a host design system is detectable.

**Palette** (light theme):
- Surface: `#FFFFFF`
- Subtle surface: `#FAFAF7` or `#F8F8F6`
- Border: `#E5E5E0`
- Body: `#1A1A1A`
- Muted: `#6B6B66`
- Primary: a single restrained colour (default `#1F2937` for an editorial feel; can swap for any single brand colour)
- Accent (callouts): one warm + one cool — e.g. `#B45309` for warning, `#0F766E` for success, `#7C2D12` for danger
- Code: `#F5F2EC` background, `#1A1A1A` text

**Palette** (dark theme):
- Surface: `#0A0A0A` or `#111111`
- Subtle: `#171717`
- Border: `#262626`
- Body: `#EDEDED`
- Muted: `#A0A0A0`

Respect `prefers-color-scheme` unless the host design system specifies otherwise. Don't toggle aggressively — one consistent theme is calmer than a flippable one.

**Typography**:
- Default body: `'Inter', system-ui, -apple-system, sans-serif` OR `'Söhne'` / `'Halyard'` if you have them; system stack is fine
- Default display: same as body, weight contrast only
- Default mono: `'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace`
- Base size: 18px (desktop-only — no mobile breakpoint, so no need to step down)
- Headings: tight tracking (-0.01em on h1/h2)

**Spacing**:
- 8px base unit. Use 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 consistently.

**Layout widths** (desktop-only — the prose-narrow / visuals-wide split):
- Fixed sidebar (~260px) + a main content track that uses the rest of the viewport up to a generous cap (`--content-max: ~1200–1400px`). On a 16"/external monitor this fills the screen instead of stranding a centred column in empty gutters.
- Inside that track, **prose** stays at `max-width: 65ch` (left-aligned), but **diagrams, tables, and charts get a full-width / breakout track** spanning the whole content width.
- Pattern: give the content track CSS grid or a `.bleed` utility so prose sits in the readable column while `.diagram-wrap`, wide `<table>`, and chart containers break out to 100% of the track. Example: `.bleed { width: 100%; max-width: var(--content-max); }` applied to visual containers, while `.prose { max-width: 65ch; }`.
- **Side-by-side is a first-class layout** now that horizontal room is guaranteed: diagram | callouts, chart | table, mermaid | screenshot. Use a 2-column grid for these rather than stacking.

**If a host design system is detectable** (e.g. there's a `tailwind.config.*` or theme file in an adjacent repo the user clearly belongs to), probe it first and **use the host palette + type** instead of these defaults. The artefact should feel like an internal doc, not a generic page.

## Process

### Step 1 — Read inputs
- For folder inputs: read every markdown file (in numerical order if prefixed), read the `data/*.json` sidecars, note any embedded image files.
- For other inputs: assemble into a structured working set (write to a temp folder if helpful).
- Read at least one full chapter to understand the domain — don't synthesise just from titles.

### Step 2 — Probe host design language (when applicable)
- If the user's content is about a specific product/codebase, look in the adjacent repo for `tailwind.config.*`, `theme.{js,ts,css}`, `tokens.{js,ts,css,json}`, or a design-system folder.
- Extract the palette, fonts, and any obvious component conventions.
- If nothing found, use the default visual language above.

### Step 3 — Sketch the structure
- Decide on single-page vs multi-page (single-page is the default — easier to share via a single file).
- Plan the section order. Lead with executive summary; close with raw evidence / appendix.
- Identify which content gets visualised (diagrams, charts) and which gets tabularised.

### Step 4 — Build

Output structure:

```
<chosen-output-folder>/site/
├── index.html
└── assets/
    ├── styles.css   (if you split CSS out — fine to inline for smaller reports)
    ├── script.js    (likewise)
    ├── img/         (any embedded images, screenshots, SVGs)
    └── data/        (optional — usually data is inlined, see file:// safety)
```

Build order:
1. **Skeleton** — semantic HTML, landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`), ARIA labels.
2. **Typography + palette CSS** — get the type scale right first; everything else follows.
3. **Hero + exec summary** — the 90-second-read section. Prose summary only — no KPI/stat-pill strip (see principle 4).
4. **Chapters in order** — each with its visual + collapsed full content.
5. **Glossary** — populate from terms identified during chapter writes.
6. **Interactivity** — search, filter, lens, accordion, localStorage.
7. **Diagram pan/zoom + flow animation** — in-card transform stage (drag-pan + ⌘/Ctrl-wheel zoom, scroll-safe) AND toolbar AND fullscreen modal, on every `.diagram-wrap`; marching-ants edges / steppers / SMIL pulses per 3b, with the global pause toggle. Wire **after** Mermaid's `run()` promise resolves, not at `DOMContentLoaded`.
8. **Print stylesheet** — last; affects nothing in the screen experience but unlocks the PDF export path.

### Step 5 — Verify (MANDATORY; never skip)

**This step is non-negotiable.** Do not show the user the result until verification passes.

Try in order, taking the first that works:

**A. Browser automation tools.** If Chrome DevTools, Browser, Playwright, Puppeteer, or an equivalent browser automation tool is available in the current host, navigate to `file://<absolute-path>/index.html`, **resize to a wide desktop viewport (1680×1050; spot-check 1440 too)**, take full-page screenshots at multiple scroll positions (hero, mid, end), and visually inspect. There is no mobile viewport to check — this is a desktop-only artefact.

**B. Reconnect.** If the browser automation backend is configured but disconnected, launch the configured browser first via the host's normal browser startup path, wait ~5 seconds, then retry attempt A.

**C. Headless Node.** Fall back to `npx puppeteer` or `npx playwright`. One-shot script:
```js
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050 }); // desktop-only — verify on a wide viewport
await page.goto('file://<absolute-path>/index.html');
await page.waitForTimeout(8000); // give mermaid time to render
await page.screenshot({ path: '/tmp/verify-hero.png', fullPage: false });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.screenshot({ path: '/tmp/verify-mid.png', fullPage: false });
// etc.
await browser.close();
```
Read screenshots back via the Read tool. If neither tool is installed, suggest the user install one (`npx puppeteer-core` is tiny) rather than skipping.

**D. macOS screencapture.** Last resort. `open` the file, sleep 6, `osascript` to find the browser window bounds, `screencapture -R{x,y,w,h} /tmp/...png`. Polite — don't take full-screen if the user is mid-work.

For every screenshot, visually verify:
- Hero renders with correct hierarchy and contrast.
- **The content track fills the wide viewport** — no large empty horizontal gutter beside a stranded narrow column. Programmatically: `viewportWidth − sidebarWidth − contentWidth` should be small. Prose stays at ~65ch; diagrams and wide tables span the full content width.
- **Wide diagrams are readable inline** — the architecture/topology diagram fits in its full-width card without horizontal scrolling (only a genuinely huge graph should scroll). Compare the diagram's natural width to its card width.
- **Every Mermaid diagram rendered** — no bomb icons, no "Syntax error in text" labels. Scan all of them, not just the most visible.
- Charts render (canvas/SVG).
- Embedded screenshots load.
- Typography is consistent — no FOUC artefacts, no missing fonts, no jagged scaling.
- Tables render (no broken filter UI).
- Glossary popovers trigger on hover (programmatically check `getComputedStyle` of the popover after dispatching a `mouseover` event).
- Workstream lens toggles dim correctly (check element opacity after toggling the relevant checkbox via JS).
- **Diagram toolbar present on every diagram.** Programmatically count `.diagram-wrap .diagram-toolbar` — must equal the total `.diagram-wrap` count. Each toolbar must contain buttons with `data-act="in"`, `"out"`, `"reset"`, `"fs"` plus a `.zoom-indicator`.
- **Zoom in/out actually scales the diagram.** Snapshot `svg.getBoundingClientRect().width` (it reflects the parent's `transform: scale`), click `data-act="in"` twice, snapshot again — should be ≥40% larger. `1:1` resets to 100% natural (within 1px).
- **In-card drag pans.** Dispatch `mousedown` on the `.diagram-wrap` → `mousemove` (+120,+0) on `window` → `mouseup`; the `.mermaid` layer's `transform` must change and `.grabbing` must clear on mouseup.
- **In-card ⌘/Ctrl+wheel zooms at the cursor; PLAIN wheel does NOT.** Dispatch `new WheelEvent('wheel', {deltaY:-300, metaKey:true, clientX, clientY})` on the card → the `.mermaid` transform/scale changes. Then dispatch a **plain** wheel (no modifier) on the card → the transform must be **unchanged** (the page is free to scroll). This is the scroll-trap guard — verify it explicitly.
- **Fullscreen modal opens and closes.** Click `data-act="fs"`, confirm `.diagram-modal.show` exists, `body.modal-open` is set, `.dm-content` contains a cloned `<svg>`. Then dispatch `Escape` key and confirm both classes are removed. Also test the close button.
- **Modal opens fitted + centred.** After opening, the indicator should read a sensible fit (the whole diagram visible, typically well under 100% for big diagrams) and `.dm-content`'s transform should be a non-zero `translate(...) scale(...)` — not the default `scale(1)` at origin.
- **⌘/Ctrl + wheel zooms at the cursor.** Dispatch `new WheelEvent('wheel', {deltaY:-300, metaKey:true, clientX, clientY})` on the stage; the indicator % must increase and `.dm-content` transform must change. Then dispatch a **plain** wheel (no modifier) and confirm the transform translates while the scale (indicator) stays the same — i.e. plain wheel pans, modified wheel zooms.
- **Drag pans.** Dispatch `mousedown` on the stage → `mousemove` (+80,+50) on `window` → `mouseup`; the transform must change and `.grabbing` must clear on mouseup.
- **Keyboard nav works** while the modal is open: `+`/`-` change the indicator, `0` returns to the fitted view, and an arrow key changes the transform. (Confirm these `preventDefault` so the page behind doesn't scroll.)
- Print preview emulation (`page.emulateMediaType('print')`) renders cleanly — toolbar and modal hidden.

### Step 6 — Auto-fix anything found

Common defect patterns and their fixes:

| Defect | Cause | Fix |
| --- | --- | --- |
| "Syntax error in text" bomb icon in Mermaid | HTML tags (`<b>`, `<i>`, `<code>`) inside `[unquoted]` node labels | Use `["quoted"]` labels — Mermaid v10 requires quoting for labels with HTML or special chars |
| Same, on subgraph titles | Unquoted subgraph title with spaces | `subgraph X ["Title with spaces"]` |
| Same, on labels with parens / brackets / quotes | Special chars in unquoted labels | Quote the label |
| `<br/><br/>` rejected by Mermaid | Some versions choke on consecutive `<br/>` | Use single `<br/>` or split into multiple lines via `<br/>` interleaved with content |
| Mermaid module not loading under file:// | Used the ES-module CDN | Switch to UMD: `https://cdn.jsdelivr.net/npm/mermaid@<version>/dist/mermaid.min.js` + call `mermaid.initialize({...}); mermaid.run();` |
| Glossary popover not appearing | Missing `position: relative` on the parent, or popover hidden by `overflow: hidden` | Inspect ancestor chain; lift popover to `<body>` via JS positioning if needed |
| Workstream lens dims everything (including target) | Filter logic inverted, or missing `data-ws-tag` on the target elements | Audit `data-ws-tag` coverage |
| Search highlighting persists after clearing | Highlight removal logic not wired to empty query | Reset highlights on each query change |
| Charts render but at 0×0 | Container has no width when chart inits (display:none parent) | Re-render on accordion expand, or use ResizeObserver |
| Wide diagram clipped/scrolling while empty gutter sits beside it | `.diagram-wrap` left inside the 65ch prose column instead of the full-width track | Move diagrams/tables/charts to the full-width content track (`.bleed`/grid); only prose stays at 65ch |
| Content stranded in a narrow centred column on a 16"/external monitor | `--content-max` too small (or prose `max-width` applied to the whole track) | Raise `--content-max` to ~1200–1400px; apply the 65ch cap to `.prose` only |
| Diagram toolbar missing on some diagrams | Wired at `DOMContentLoaded` before Mermaid finished rendering SVGs | Move toolbar-wiring into `mermaid.run().then(() => activateDiagrams())` |
| Zoom-in button changes the indicator but the diagram doesn't grow | Mermaid sets inline `max-width: 100%` on the SVG, capping it | Set `svg.style.maxWidth = 'none'` and size the SVG to natural px once; then zoom by scaling the `.mermaid` layer's `transform`, not the SVG width |
| **All diagrams render at exactly 100px wide** | `parseFloat(svg.getAttribute('width'))` returned `100` because Mermaid sets `width="100%"`. Code then applied `style.width = '100px'` to every SVG | Read natural width from `viewBox.baseVal.width` first; only use the `width` attribute if it lacks a `%` suffix |
| Diagrams look tiny on first render, even though Mermaid normally fits them to the container | Default scale set wrong, or natural size read from `width="100%"` | Init `scale = min(1, stageW / naturalW)` (fit-to-width, capped at 100%); read natural W/H from `viewBox`, size the SVG to natural px, scale the `.mermaid` layer |
| Plain scroll over a diagram zooms it or traps the page scroll | `wheel` handler `preventDefault`s unconditionally / isn't gated on a modifier | Only `preventDefault` + zoom when `e.ctrlKey || e.metaKey`; otherwise `return` early and let the page scroll |
| In-card diagram can be dragged fully out of the card and "lost" | No clamp on `tx`/`ty` | Clamp pan to the stage bounds each frame; centre on whichever axis the diagram is smaller than the stage |
| In-card diagram blank / clipped after wiring | `.mermaid` not absolutely positioned for the transform, or the card height wasn't set | `.diagram-wrap .mermaid { position:absolute; transform-origin:0 0 }`; set `.diagram-wrap` height in JS to the fit height (cap ~720px) with `overflow:hidden` |
| Fullscreen modal opens but is blank | Cloned the `.mermaid` element before its SVG existed | Clone after `mermaid.run()` resolves; read the clone's natural W/H fresh from its `viewBox` before applying the initial fit |
| `⌘`/`Ctrl` + wheel doesn't zoom in the modal | The `wheel` listener didn't `preventDefault`, or was registered `passive: true` (so `preventDefault` is ignored), or the stage is still `overflow: auto` (the browser scrolls instead) | Register `addEventListener('wheel', fn, { passive: false })`, `preventDefault()`, and make the stage `overflow: hidden` with a `.dm-content` transform layer |
| Cursor zoom "drifts" — the point under the pointer moves while zooming | Scaled without re-anchoring the translate | In `zoomAt`, compute the cursor's content-space point `px=(cx-tx)/s, py=(cy-ty)/s` BEFORE changing scale, then set `tx=cx-px*newS, ty=cy-py*newS` |
| Drag doesn't pan (or the SVG gets text-selected) | Used an `overflow:auto` scroll box instead of a transform layer; or didn't `preventDefault` on `mousedown` | Switch the modal to the transform model; `preventDefault()` on `mousedown`; track drag on `window` `mousemove`/`mouseup` (not the stage) so a fast drag off the stage still pans |
| Modal opens zoomed-in / not centred / blank | Measured `stage.clientWidth` before adding `.show` (it was `display:none` → 0), or only fit width not height | Add `.show` first, then `fit()` using both `clientWidth` and `clientHeight`; size the cloned SVG to its `viewBox` w/h in px before transforming |
| ESC doesn't close the modal | Wired `keydown` to the modal element (needs focus) instead of `document` | Attach `keydown` to `document` and gate on `modal.classList.contains('show')` |
| Page scrolls behind the open modal | Missed `body.modal-open { overflow: hidden }` | Add the rule and toggle the class in open/close |
| In-card drag selects text/SVG instead of panning | No `preventDefault` on `mousedown` | `preventDefault()` on `mousedown`; track `mousemove`/`mouseup` on `window` (not the card) so a fast drag off the card still pans |

**Apply fixes inline.** Re-run Step 5 verification. Loop until clean.

### Step 7 — Present to the user
- Print the absolute path to `index.html`.
- 6-line summary: structure chosen, count of sections, count of diagrams, count of glossary terms, count of interactive features, count of defects found and fixed.
- Provide the `open` command they can copy/paste.
- Note anything the verification couldn't cover (e.g., "couldn't get Chrome DevTools MCP working; verified via headless Puppeteer — recommend a quick manual visual pass on a wide window").

## Anti-patterns

- **Don't be terse.** A skill invocation here typically processes ~1 MB of source content. The output HTML should expose all of it (via progressive disclosure), not summarise into 200 lines.
- **Don't ship without verifying.** Step 5 is mandatory. If verification fails, fix; don't hand the user a broken page.
- **Don't fabricate the host design language.** If you can't determine the host's exact palette, default to the visual-language defaults above. Don't invent specific brand colours.
- **Don't use a JS build step.** No webpack, no vite, no tsc. Plain HTML + CSS + JS + CDNs.
- **Don't skip the glossary.** It's a hard requirement.
- **Don't decorate at the cost of readability.** Drop shadows, gradients, motion are tools — use them sparingly. If a panel reads better without a box, drop the box. Motion is for meaning: animate flow direction (principle 3b), never ambience.
- **Don't add KPI / stat-pill strips to the hero.** Rows of big numbers ("7 steps · 26 defects · 25 terms") are decoration masquerading as information. Lead with prose; put a count in a sentence if it actually matters.
- **Don't ship key flows as static diagrams.** Pipelines, lifecycles, fallback chains, and routing decisions animate their flow direction (principle 3b) — marching-ants edges cost four lines of CSS.
- **Don't centre prose.** Left-aligned, ragged-right is more readable.
- **Don't use icon-only buttons** in the toolbar without tooltips — they fail accessibility and confuse new readers.
- **Don't ship diagrams without zoom/fullscreen controls.** Even rendered at full content width, a dense diagram may carry smaller text than you anticipated, and the reader will want to zoom into a region. The controls cost ~80 lines of JS — they are not optional. (They're now a *secondary* path, since diagrams render large inline — but still required.)
- **Don't add responsive or mobile fallbacks.** These reports are desktop-only (≥1440px). No `@media (max-width: …)` collapse, no hamburger nav, no phone-sized type. Spend the saved complexity on the wide-screen experience.
- **Don't trap visuals in the prose column.** Diagrams, tables, and charts break out to the full content width; only body prose stays at the 65ch measure. A wide diagram scrolling inside a narrow card while empty gutter sits beside it is the #1 defect this skill exists to prevent.

## Mermaid cheatsheet (lessons learned)

```
✗ A[text with <b>HTML</b> inside]
✓ A["text with <b>HTML</b> inside"]

✗ subgraph Reporting [billing-reporting]
✓ subgraph Reporting ["billing-reporting"]

✗ B[Bridge ??? execution_id ↔ ad_id]   # special chars unquoted
✓ B["Bridge ??? execution_id ↔ ad_id"]

✗ <br/><br/>  (some v10 builds choke)
✓ single <br/> with content interleaved
```

Always include `mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: {...} }); mermaid.run();` in script.js — `startOnLoad: true` doesn't always fire under `file://`.

## Examples of good output

A structure that has worked well for a dense, multi-chapter report:
- Fixed left sidebar (search + chapter nav + lens toggles)
- Slide-in glossary panel
- Gradient hero carrying the executive summary in prose — early artefacts put a stat-pill strip there; that pattern is banned as decoration (principle 4), so lead with the prose and drop the pills
- Per-chapter mermaid + accordion full content
- Side-by-side mermaid + real screenshot where a diagram benefits from a concrete example
- Searchable / filterable tables for larger datasets
- Print stylesheet that produces a usable PDF

For the **animated flow diagram** pattern (3b), a report whose flows read well combines: marching-ants Mermaid edges (`@keyframes edgeflow`), a JS-cycled hero stepper that encodes a verify → fix loop by revisiting indices, an SMIL `animateMotion` pulse on a fallback chain, and a persisted pause toggle that also calls `pauseAnimations()` — plus a debounced per-card `refit()` on window resize.

For dense diagrams, the **diagram toolbar + fullscreen modal** pattern works well: every `.diagram-wrap` shows a toolbar in its top-right and a fullscreen modal that auto-fits to ~3× then allows further zoom up to 6×. Implement it with a `.diagram-toolbar` / `.dbtn` / `.diagram-modal` set in your CSS and `activateDiagrams` / `openModal` / `applyZoom` helpers in your script.

Treat these as references, not a template — every report's source content shapes the structure differently.
