---
name: tldr-video
description: Turn a link, article, paper, tweet/thread, YouTube video, PDF or pasted text into a ~45-second silent animated "TL;DR" explainer video (MP4) — cream paper frame, monospace type, amber highlights, numbered scenes with animated wireframe diagrams (request/response boxes, streaming tokens, stopwatches, score bars, can/can't lists) each ending in a punchline. Use when the user asks for a "TL;DR video", "explainer video", "45-second explainer", "animate this article/announcement", "make a video explaining this link", or a short social video (X/LinkedIn) that makes a confusing idea simple.
---

# TL;DR Video

Input: a link / article / paper / thread / video / pasted text.
Output: `out.mp4` — 1280x720 (or 1920x1080), 30fps, 30–60s, silent, loops well, made for autoplay-muted feeds. Plus `poster.png` and a live `index.html` preview.

The format (after @MatijaSosic's Jev explainer): 3–5 numbered scenes on a paper-coloured frame. Each scene is ONE animated diagram that *shows the mechanism happening* — then a plain caption and a highlighted punchline land at the bottom. No voiceover, no stock footage, no bullet-point slides.

**The hard part is the distillation, not the animation.** The engine makes anything look good; a video is only worth watching if the core idea has been found and made concrete. Spend your effort there.

## Prerequisites

`node`, `ffmpeg`, Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (override with `CHROME_PATH`). Renderer deps live in this skill dir — if `node_modules/` is missing here, run `npm install` in this directory once.

`SKILL_DIR` below = the directory containing this file.

## Workflow

### 1. Get the source — all of it

| Source | How |
|---|---|
| Article / blog / docs | WebFetch (or the browser if it's JS-rendered/paywalled). Ask it to *extract the mechanism, every figure with its context, the worked example and the caveats* — requests to reproduce the full text verbatim get refused. Do a second pass for anything thin. Follow through to the primary source if the page is just commentary on something else. |
| X / Twitter post | `curl -s https://api.fxtwitter.com/<user>/status/<id>` gives text, quoted tweet and media URLs as JSON without login. If the substance is in a video: `yt-dlp` it, then transcript (auto-subs / whisper if available) or sample frames with `ffmpeg -vf fps=1/3` and read them. Read the linked launch post/paper too — a tweet is rarely the whole story. |
| YouTube | `yt-dlp --write-auto-subs --sub-langs en --skip-download`, read the transcript in full. |
| Paper / PDF | Read it (abstract, intro, method figure, results table, limitations). |
| Pasted text | Use as is. |

If you can't reach the source, say so and ask for the text — never storyboard from the headline alone.

### 2. Write the brief (`brief.md`) before any code

Answer these in a few lines each. If you can't, you don't understand the source yet — go back to it.

1. **The one sentence.** What is the core idea, such that a smart outsider would say "oh, that's all it is?"
2. **The contrast.** What's the familiar thing this differs from? (Almost every good explainer is "you know X → this is X but ___".)
3. **The running example.** ONE tiny concrete case carried through every scene ("is this invoice fraud?", "a 100k-token book + one question"). Never explain in the abstract what you can show on an example.
4. **The numbers.** 1–3 figures that matter, each traceable to the source. Note where each came from. If the source gives none, don't invent any — show the mechanism instead and use qualitative punchlines.
5. **The catch.** What it can't do / costs / when not to use it. Including this is what makes the video trustworthy rather than an ad.
6. **The source line** for the footer (`@handle on X`, `example.com/post`, `Author et al. 2026`).

### 3. Storyboard: 3–5 scenes, 8–12s each, 30–60s total

Default arc (adapt, don't force): **01 how the familiar thing works → 02 how this works (same layout, one thing changed) → 03 what it's for / the number that matters → 04 the trade (can / can't)**. Other arcs that work: problem → mechanism → result → catch; before → after → why → when.

Rules that make it work:

- **One idea per scene. One diagram per scene.** If a scene needs two diagrams, it's two scenes.
- **Show the mechanism running, don't describe it.** Tokens stream in one at a time while a stopwatch climbs. Squares fill. A packet travels. A bar wins. The viewer should be able to get it with the captions covered.
- **Make contrasts symmetrical.** Scenes 1 and 2 should share an identical layout (write a helper function, see `assets/example/scenes.js`) so the *only* thing that differs is the point.
- **Time is a prop.** If something is slow, make the viewer sit through ~4s of it; if it's fast, make it land in a blink. Verdict-tint the stopwatch (`bad` red / `good` amber).
- **Every scene closes with `caption` + `punch`.** Caption: one plain lowercase sentence (≤ 9 words). Punch: ≤ 5 words, the thing they'd repeat to a friend ("8.5 seconds", "a game loop, not a chat"). Then **hold ≥ 2s** on the final state before the scene ends.
- **Pacing inside a scene:** 0–0.5s header · 0.5–2.5s set the stage (boxes appear, question types in) · 2.5–7s the mechanism plays · ~70% through: caption, +0.5s punch · hold. Never have two things animating that both need reading.
- **Words are expensive.** ≤ ~40 words visible per scene (lint fails at 70). Lowercase, terse, concrete. Titles 2–4 words, uppercase is automatic. No jargon the brief's "smart outsider" wouldn't know — rename the source's term of art to plain words on screen ("+ keyword search", with a small note `keyword search = bm25` if the original term matters) or define it visually.
- **Honesty.** Every number and claim must come from the source; don't round in a flattering direction; illustrative values (like example classifier scores) are fine when they are obviously illustrative. Always include the catch. Paraphrase — never paste source sentences onto the screen.
- **Bespoke beats canned.** At least one scene should have a custom little visual specific to this topic (a mini game loop, a grid of cells, a queue draining, a tiny chart drawing itself) built with `s.el` / `s.svg` / `s.custom`. That's what makes people say "aww I like the animation".

Write the storyboard into `brief.md` as a table: scene · title · what's on screen · what moves · caption · punch · seconds.

### 4. Build the project

```bash
P=~/code/tldr-videos/<slug>          # or wherever the user says
mkdir -p $P && cp -R SKILL_DIR/assets/{index.html,style.css,engine.js,fonts} $P/
cp SKILL_DIR/assets/example/scenes.js $P/scenes.js    # then rewrite it
```

Read `assets/example/scenes.js` first — it is the reference for structure, timing and the symmetric-layout trick. Then write `scenes.js` (API below). Don't edit `engine.js`/`style.css` per video unless you genuinely need a new primitive; put one-off styling inline.

### 5. Check it — stills + lint, until clean

```bash
node SKILL_DIR/render.js $P --stills
```

Prints the scene table and **LINT** results (elements leaving the frame, content spilling out of boxes, anything colliding with the caption zone, too many words), and writes `stills/sheet.png` — a contact sheet, one row per scene, columns = 30% / 62% / final state. **Read the sheet image** and check: nothing overlaps or is clipped; the final column of every scene is a complete, self-explanatory poster; scenes 1 & 2 line up; empty scenes are rebalanced (content zone is y 150–540; don't leave the bottom half blank — enlarge the diagram instead). Individual full-res stills are in `stills/` if you need to zoom. **Lint only catches geometry.** Timing, legibility, dead space and ambiguous wording are only caught by eye — e.g. a key moment (a grid that fills then drains) can fall entirely between the 30% and 62% columns; add `--at 3.5,14.2` (absolute seconds) to get extra full-res stills at the moments that matter, and make sure each key state is on screen ≥ 1.5s. Fix and re-run until lint is clean and it looks right. For motion, spot-check mid-animation frames after the full render (step 6) or open `index.html` in a browser (space = play/pause, ←/→ = jump scenes, `?t=12` = start at 12s).

### 6. Render

```bash
node SKILL_DIR/render.js $P                       # → $P/out.mp4 + poster.png  (~1.2x realtime)
node SKILL_DIR/render.js $P --scale 1.5           # 1920x1080
node SKILL_DIR/render.js $P --audio music.mp3     # optional bed; default is silent on purpose
node SKILL_DIR/render.js $P --from 11 --to 22 --out s2.mp4   # re-render one scene while iterating
```

Verify with `ffprobe` (duration matches the scene table) and pull 3–4 mid-animation frames to confirm motion reads:
`ffmpeg -y -loglevel error -i out.mp4 -vf "select='eq(n,80)+eq(n,260)+eq(n,500)',scale=640:-1,tile=3x1" -frames:v 1 motion.png`

### 7. Deliver

Send `out.mp4` to the user (SendUserFile if available, otherwise give the path) with: the one-sentence idea, the scene list, where each number came from, and a suggested post caption (2–3 plain lines, credit the source). Do not post it anywhere yourself.

## scenes.js API

```js
TLDR.video({
  source: '@handle on X',            // footer: "SOURCE: @handle on X"
  scenes: [{ title: 'how an llm answers', duration: 11, build(s) { /* ... */ } }, ...],
});
```

Stage = **1280x720**, origin top-left. All times are **scene-local seconds**. `at` = when the element enters; omit `at` and it's visible from the start. Every builder returns the DOM element (style it freely). Pass `parent: someBox` to position inside a box (coords then relative to the box); omitted/null = the scene.

**Layout map:** frame inset 26px · left margin **x=66** · header y 76–123 · **content zone y 150–540** (hard floor **y=562** when the scene has a caption — lint fails below it) · caption y≈570 · punch y≈603–644 · footer y≈668 · keep everything inside x 66–1214.

| Call | What it does |
|---|---|
| `s.box({x,y,w,h,title,sub,body,at})` | Wireframe window with title bar. `box.body` is the content div (`box.body.classList.add('big')` for 25px text). |
| `s.type(target, text, {at,dur,by:'word'\|'char',mark,keepCursor})` | Streams text in with a block cursor; `by:'word'` = LLM token look (newest token highlighted), `by:'char'` = typing. `mark:true` keeps a pale highlight behind all of it. Layout is reserved up front, no reflow. |
| `s.connector({from:[x,y],to:[x,y],at,dur,packet:'req',packetDur,arrow,dashed})` | Line draws itself; optional labelled packet travels along it. Any angle. |
| `s.counter({x,y,to,from,at,countAt,dur,decimals,suffix,prefix,verdict:'bad'\|'good'})` | Ticking stopwatch/number; tints red or amber when it lands. **Defaults are stopwatch-y: `decimals:1, suffix:'s'`** — for a plain count pass `decimals:0, suffix:''`. |
| `s.bars({x,y,items:[{label,value}],at,pick,max,decimals,suffix,chipW,trackW})` | Option chips + score bars that fill; `pick` index lights up as the winner. All rows fill together at `fillAt`; give an item its own `fillAt` (`{label,value,fillAt}`) to reveal rows one after another ("each layer improves on the last"). |
| `s.chips({x,y,items,at,w,h,dir:'col'\|'row'})` → array | Plain option chips. Light one with `s.cls(chip,'on',from,until)`. |
| `s.steps({x,y,items,at,stagger,w,h,gap})` → array | Row of process boxes joined by arrows. `s.cls(step,'on',t)` to highlight. |
| `s.list({x,y,title,tone:'good'\|'bad'\|'plain',items,at,stagger,strike})` | Titled list; `good` = `+` markers, `bad` = `-` markers, greyed and struck through (`strike:false` to keep readable). |
| `s.stat({x,y,value,from,label,at,dur,prefix,suffix,decimals,commas})` | Big counting number + small label; counts `from` (default 0) → `value`, so it can count down. `value` may be a string. |
| `s.text(html,{x,y,w,cls,at})` · `s.note(...)` · `s.label(...)` | Text. cls: `t-body` 20px, `t-big` 30px, `t-huge` 64px, `t-note` grey 15px, `t-label` grey caps. Inline: `<span class="hl">`, `hl-hot`, `hl-red`, `c-red`, `c-gray`. |
| `s.caption(text,{at})` · `s.punch(text,{at})` | The scene closer (fixed position bottom-left). One of each per scene. |
| `s.el(html,{x,y,w,h,cls,at,enter,parent})` | Raw positioned div — build anything. `enter`: `rise` (default) `fade` `pop` `none`. `<img>` of a local file is fine. |
| `s.svg({x,y,w,h,at})` → svg with `.add(tag, attrs)` | Custom drawing (`text:` attr sets text content). Shapes default to `fill:none`, 2px `#2a2a2a` stroke — for a filled shape pass `fill` **and** `stroke:'none'`. Text defaults to JB Mono 700 16px. `s.draw(pathNode,{at,dur})` strokes it on. |
| `s.show(el,{at,enter})` `s.hide(el,{at})` `s.dim(el,{at,to})` `s.move(el,{at,dur,from,to})` `s.cls(el,name,at,until)` | Generic verbs on any element. |
| `s.custom({at,dur,ease,update(p,t)})` | Your own animation: `p` = 0..1 progress, `t` = scene time. See rule below. |

Colours (CSS vars): `--paper --ink --line --gray --faint --white --amber --amber-pale --red --red-pale --green --green-pale`. Amber = attention/good/fast, red = slow/bad/can't, ink black = "processed/chosen". Don't add more colours.

### The one engine rule: animations are pure functions of time

Frames are captured by seeking, not by playing. So:

- **Never** use `setTimeout`, `setInterval`, `requestAnimationFrame`, CSS `transition`/`animation`/`@keyframes`, `Math.random()`, or `Date` in scenes. They won't render (or won't render the same twice). Need randomness? Hard-code the values.
- A `custom` `update(p)` must **set** (not increment) every property it owns, for any `p` including `0` — `p=0` is the reset state before it starts. `el.style.left = 40 + 380*p + 'px'` ✓ · `x += 5` ✗.
- Discrete state from progress: `Math.round(p * n)`, `p > 0.5`. Eases: `linear` `in` `out` `inOut` `back`.
- Two tweens on the same property of the same element are fine if they don't overlap in time (the later one wins once it starts).

## Gotchas

- `at` omitted ⇒ visible from t=0. Elements you `s.show()` later must not also pass `at`.
- Text doesn't auto-fit. Boxes have fixed `h`; lint catches spills — shorten the text before shrinking the font. Minimum readable size on a phone: 15px notes, 20px body.
- `.hl` adds padding — put it on an inline `<span>`, not on a block like `box.body` (use `type(..., {mark:true})` for typed text).
- The last scene doesn't fade out; the video should end on a poster-worthy frame (the trade, or the punchline) and hold it ≥ 2.5s.
- 1280x720 is the design space. For 1080p use `--scale 1.5`; never change the stage size.
- Render time ≈ 1.2x video length. If it's much slower, a `custom` update is doing heavy DOM work per frame — build nodes once in `build`, only mutate styles in `update`.
