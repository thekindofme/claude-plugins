---
name: whiteboard-video
description: Turn any YouTube video (talk, podcast, lecture) into an Excalidraw-style whiteboard video — hand-drawn diagrams that build element-by-element in sync with the speech, with the original footage as picture-in-picture and original audio. Also produces an interactive synced viewer. Use when the user asks to "whiteboard" a video, make diagrams for a talk, or turn a video into a visual/diagram-based version.
---

# Whiteboard Video

Convert a YouTube video into two deliverables:
1. **`whiteboard_final.mp4`** — 1920x1080 video: full-screen hand-drawn diagrams synced to the speech, original footage in a small PiP frame bottom-right, original audio.
2. **`viewer.html`** — interactive local player: diagrams render live in sync with the video; clickable segment navigation, scrubber with segment ticks, keyboard shortcuts.

Use it on videos you have the right to rework (your own talks, openly licensed content, or personal study). The output re-uses the original footage and audio.

## Prerequisites

`yt-dlp`, `ffmpeg`, `node`, Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (override with `CHROME_PATH`). Confirm all exist before starting.

Disk: a long talk needs ~1 GB of working space (frames + raw + final MP4). Check `df -h ~` first; a full disk kills the encode midway and leaves truncated files.

Transcript fallbacks (only needed when YouTube subs are blocked, see step 1): the `youtube-transcript-api` Python package (install into a venv, e.g. `python3 -m venv .venv && .venv/bin/pip install youtube-transcript-api`), or macOS 26+ for the on-device `asr_transcribe.swift`.

## Workflow

Work in a new project directory (e.g. `~/code/<topic>-whiteboard/`, or where the user says). Copy every file from this skill's `assets/` directory into it first. This is a long autonomous build — commit-as-you-go doesn't apply (no repo needed), but keep the user posted at milestones.

### 1. Download video + auto-subtitles

```bash
yt-dlp -f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/b" \
  --write-auto-subs --sub-langs en --sub-format vtt \
  -o "source.%(ext)s" "<URL>"
```

If the video download 403s (subs usually still succeed), retry with `--extractor-args "youtube:player_client=tv,android"` — that reliably works. 360p (`-f 18` fallback) is fine; the footage only fills a 440x248 PiP window. Get the exact duration: `ffprobe -v error -show_entries format=duration -of csv=p=0 source.mp4` — call it `DUR`; use it everywhere below. Confirm the download is complete (duration matches the YouTube length, and no leftover `*.part` files).

**If the subtitle download fails with HTTP 429 "Too Many Requests"** (common when several downloads run at once, and it can last hours): don't sit in a retry loop, and don't bother switching `player_client`. Every client (web_safari, mweb, tv, android, ios, …) and format (vtt/json3) stayed blocked for 1.5 h in testing. Never use browser cookies. Go straight to a fallback, in this order:
1. **youtube-transcript-api** uses a different endpoint that worked while yt-dlp was blocked: `python3 alt_transcript.py yta <VIDEO_ID>`. Timings are per caption line, so word times are spread evenly within each line. That's good enough for scene sync.
2. **On-device ASR** (macOS 26+; true per-word timings, ~25 s for a 28-min talk):
   ```bash
   ffmpeg -y -i source.mp4 -vn -ac 1 -ar 16000 audio.wav
   swiftc -O -parse-as-library asr_transcribe.swift -o asr && ./asr audio.wav asr.json
   python3 alt_transcript.py asr asr.json
   ```
   Or use `whisper-cli` (whisper.cpp) if it and a model are installed.

Both write the same `words.json` + `transcript.txt` as step 2, so skip `parse_vtt.py` and carry on. Record which transcript source was used in the README.

### 2. Parse the transcript

Run `python3 parse_vtt.py` (expects `source.en.vtt`) → `transcript.txt` (timed ~25s chunks, `[mmm:ss]` prefixes) and `words.json`. YouTube auto-VTT word timings live inside `<00:00:00.240><c> word</c>` tags — the script already handles this. Sanity-check the word count: a talk has ~130-220 words/min; if you get far fewer, the parse is broken — debug before proceeding.

Auto-captions (and ASR) garble proper nouns: model names, companies and people. "Kimi" came out as "Chimney", "Genspark" as "James Park". On the board, write the name you're confident the speaker meant, or fall back to generic wording ("open-weight models", "a clinical AI startup"). Never draw a garbled name, and list your guesses in the README.

### 3. Read the whole transcript and design segments

Read `transcript.txt` **in full** — segmentation and diagram quality depend on it. Then split the video into topical segments:

- Aim for **~1.5–3 min per segment**; every segment gets a diagram scene. An 80-min talk → ~40 scenes.
- Detect sponsor/ad breaks (podcasts: usually 2-3 blocks of read-out ads) → give each a light "sponsor break" card scene (coffee doodle + "diagrams resume shortly"), not real diagrams.
- End with a **recap scene**: a small mind-map of the talk's core argument.
- Content rules: paraphrase in your own words; keep direct quotes rare and under ~10 words (they render nicely as `hl` + text). Never dump transcript text into diagrams.

### 4. Write `meta.js` and `scenes.js`

`meta.js`:
```js
const META = {
  title: 'Whiteboard Companion — <Guest> on <Show>',
  caption: '<Guest> · <Company/Show>',   // drawn under the PiP frame
  videoFile: 'source.mp4',
};
```

`scenes.js` skeleton (the `module.exports` guard lets `make_shots.js` require it):
```js
const _C = { ink:'#1e1e1e', blue:'#1971c2', blueL:'#a5d8ff', red:'#e03131', redL:'#ffc9c9',
  green:'#2f9e44', greenL:'#b2f2bb', orange:'#f08c00', orangeL:'#ffec99',
  violet:'#9c36b5', violetL:'#eebefa', gray:'#868e96', grayL:'#e9ecef', teal:'#0c8599', tealL:'#99e9f2' };

const SCENES_ALL = [
  { id:1, start:0, title:'Scene title (drawn as page header)', accent:_C.red, els:[
    { at:4, t:'box', x:150, y:280, w:400, h:110, label:'TWO\nLINES', size:30, color:_C.blue, fill:_C.blueL },
    ...
  ]},
  ...
];
if (typeof module !== 'undefined') module.exports = { SCENES_ALL };
```

**The sync mechanism: every element has `at:` — the absolute second (from the transcript timestamps) when the speaker says that idea.** The board builds stroke-by-stroke with the speech. Give each scene 8–16 elements across 4–8 distinct `at` values, spread over the whole segment so the board keeps evolving (no long static stretches; the last element should land in the segment's final third).

**Element DSL** (canvas 1920x1080; all colors from `_C`, filled shapes use the matching `*L` light color):

| type | fields | use |
|---|---|---|
| `box` | x,y,w,h, label(`\n` ok), size, color, fill, dash, solid | concepts, entities |
| `ellipse` / `cloud` | same as box (cloud = dashed, for vague ideas) | actors, questions |
| `diamond` | same | decisions |
| `arrow` | x1,y1,x2,y2, label, lx,ly, curve:[dx,dy], dir:'both', color, dash | flow, tension |
| `line` | pts:[[x,y],...], color, sw | axes, curves, sketches |
| `text` | x,y, text, size(28), align, color, bold | statements, headlines |
| `note` | x,y, text, size(21), align, color(gray default) | annotations, asides |
| `hl` | x,y,w,h, fill | highlight behind a key line (auto-drawn beneath) |
| `underline` | x,y,w, color | emphasis under text |
| `tick` / `cross` / `spark` | x,y (+color) | verdicts, emphasis |

**Layout rules (critical):**
- Header (title + part indicator) is drawn automatically at the top — keep content in **x 60–1860, y 150–1030**.
- The PiP frame occupies the bottom-right: **keep everything out of x>1400 AND y>740**. Centered text is ~0.55px wide per px of font size per character — check that wide banners/highlights near the bottom don't reach x1400 when y>740.
- Rough seeds are deterministic per (scene id, element index): shapes stay identical across build steps. Don't reorder elements after shooting unless you re-shoot.
- Titles ≤ ~45 chars (they must fit before the part indicator).

### 5. Generate the shot list

```bash
node make_shots.js <DUR>
```
Fix every WARN (element times outside its scene's window) before continuing.

### 6. Render frames and spot-check

```bash
npm init -y && npm install puppeteer-core --no-audit --no-fund
mkdir -p frames && node shoot.js
```
`shoot.js` drives ONE headless Chrome (never spawn Chrome per frame — ~100× slower) and screenshots `render.html` at each shot time (~10 frames/s).

**Visual QA (do not skip):** Read (as images) the **final frame of every scene**, its densest state: the last frame before each scene boundary in sorted `frames/f*.png`. Spot-checking a handful isn't enough. Across 11 builds, the full pass turned up 3–10 overlapping or misplaced elements per video that a 5-frame sample would have missed. Look for: text overlapping the PiP frame or other elements, text wider than its box, elements off-canvas. Fix coordinates in `scenes.js`, re-run `make_shots.js` + delete affected frames + re-run `shoot.js` (it skips existing files).

### 7. Compose the video

```bash
python3 make_concat.py <DUR>
ffmpeg -y -f concat -safe 0 -i frames.txt -i source.mp4 \
  -filter_complex "[0:v]fps=30,format=yuv420p[bg];[1:v]scale=440:248[pip];[bg][pip]overlay=1450:782[v]" \
  -map "[v]" -map 1:a -c:v libx264 -crf 20 -preset veryfast -c:a copy \
  -movflags +faststart whiteboard_raw.mp4
# concat can drift a few seconds long — trim to the source duration:
ffmpeg -y -i whiteboard_raw.mp4 -t <DUR> -c copy -movflags +faststart whiteboard_final.mp4
```
Run the encode with `run_in_background` (an 80-min talk encodes at ~20× realtime). The PiP geometry (overlay 1450:782, 440x248) matches the frame the renderer draws — don't change one without the other (viewer.html's `#vid` CSS percentages too).

QA: extract 2–3 frames from `whiteboard_final.mp4` at different timestamps with ffmpeg, Read them, confirm diagrams + PiP + sync (the drawn content should match what's being discussed at that timestamp per the transcript).

### 8. Deliver

- `SendUserFile` the mp4 (if >30 MiB it will only show in the desktop app — say so).
- Verify `viewer.html` headlessly with puppeteer-core: no page errors; clicking a segment chip seeks **without changing play/paused state**; page scroll stays 0 (the segment list scrolls internally).
- Write a short `README.md` (what each file is, how to open the viewer, how to re-render after editing `scenes.js`).
- Keep `source.mp4` in the folder — the viewer needs it.
- Once `whiteboard_final.mp4` is verified (duration matches `DUR`, and it decodes to the end), delete `frames/` and `whiteboard_raw.mp4`. Together they're often 300–700 MB, and `node shoot.js` rebuilds the frames. Say so in the README.

## Running several videos at once

- One subagent per video works well. Keep **≤3 downloads in flight** and stagger them: parallel yt-dlp runs are what trigger the subtitle 429s. If they hit, go straight to the step 1 fallbacks.
- Before a batch, check the free space against ~1 GB per video, and have every build clean up after itself (step 8). A batch of 11 filled a disk mid-encode, and the builds had to be resumed after clearing caches.
- After a crash or a full disk, the frames written last may be truncated. Re-render those few frames (or verify them) before re-encoding, and don't reuse a `whiteboard_raw.mp4` that was mid-write.

## Pitfalls learned the hard way

- VTT word regex must be `<(ts)><c>([^<]+)</c>` — the word is *inside* the `<c>` tag; a lookalike regex silently drops ~85% of words.
- `hl` elements are drawn beneath everything by the renderer — author order doesn't matter for them, but everything else draws in array order.
- Foreground per-frame Chrome launches take ~100s each under sandbox; the single-instance `shoot.js` is the only sane path.
- concat slideshows run long by a few seconds → always trim with `-t <DUR>`.
- Seeking in the viewer must only set `currentTime` — never call `play()` on seek.
- Talks that end right after the last Q&A leave the recap scene only ~10–15 s. If the final answer is short, fold it into the recap's window, or start the recap alongside it so the mind-map has time to build.
- If you switch frames to `.jpg` to save disk, change `shoot.js`, `make_concat.py` **and** the QA glob together. A mismatch silently produces a broken concat list.
