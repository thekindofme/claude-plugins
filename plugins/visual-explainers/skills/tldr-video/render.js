#!/usr/bin/env node
/* tldr-video renderer.
 *
 *   node render.js <projectDir> --stills          lint + contact sheet (stills/sheet.png) for a visual check
 *   node render.js <projectDir>                   full render → <projectDir>/out.mp4 (+ poster.png)
 *
 *   node render.js <projectDir> --stills --at 3.5,14.2,27   extra full-res stills at absolute seconds (stills/at_*.png)
 *
 * Options: --out <file>  --scale <1|1.5|2>  --fps <n>  --audio <file>  --from <s> --to <s>
 */
const puppeteer = require('puppeteer-core');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function args() {
  const a = process.argv.slice(2), o = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
    else o._.push(a[i]);
  }
  return o;
}

(async () => {
  const o = args();
  const dir = path.resolve(o._[0] || '.');
  if (!fs.existsSync(path.join(dir, 'scenes.js'))) throw new Error(`no scenes.js in ${dir}`);
  const scale = parseFloat(o.scale || 1);

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--hide-scrollbars', '--allow-file-access-from-files', '--font-render-hinting=none'],
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: scale },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(dir, 'index.html') + '?render=1', { waitUntil: 'load' });
  try { await page.waitForFunction('window.__ready === true', { timeout: 15000 }); }
  catch (e) { console.error('scenes.js failed to load:\n' + errors.join('\n')); await browser.close(); process.exit(1); }

  const info = await page.evaluate(() => ({ duration: __tldr.duration, fps: __tldr.fps, scenes: __tldr.scenes }));
  const fps = parseInt(o.fps || info.fps, 10);
  console.log(`duration ${info.duration.toFixed(1)}s · ${info.scenes.length} scenes · ${fps}fps · ${1280 * scale}x${720 * scale}`);
  info.scenes.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2, '0')}  ${s.start.toFixed(1).padStart(5)}s  +${s.duration}s  ${s.title}`));

  if (o.stills) {
    const sd = path.join(dir, 'stills');
    fs.rmSync(sd, { recursive: true, force: true }); fs.mkdirSync(sd);
    const warnings = await page.evaluate(() => __tldr.lint());
    let n = 0;
    for (const [i, s] of info.scenes.entries()) {
      for (const [j, f] of [0.3, 0.62, 0.96].entries()) {
        const t = j === 2 ? s.start + s.duration - 0.4 : s.start + s.duration * f;
        await page.evaluate((tt) => __tldr.seek(tt), t);
        await page.screenshot({ path: path.join(sd, `s${String(i + 1).padStart(2, '0')}_${j + 1}.png`) });
        n++;
      }
    }
    for (const t of String(o.at || '').split(',').filter(Boolean).map(Number)) {
      await page.evaluate((tt) => __tldr.seek(tt), t);
      await page.screenshot({ path: path.join(sd, `at_${t.toFixed(1)}.png`) });
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob', '-i', path.join(sd, 's*.png'),
      '-vf', `scale=640:-1,tile=3x${info.scenes.length}:padding=6:color=0x111111`, '-frames:v', '1', path.join(sd, 'sheet.png')]);
    console.log(`\n${n} stills → ${sd}  (rows = scenes; columns = 30% / 62% / final state)\ncontact sheet → ${path.join(sd, 'sheet.png')}`);
    console.log(warnings.length ? `\nLINT — ${warnings.length} issue(s):\n` + warnings.map((w) => '  ✗ ' + w).join('\n') : '\nLINT — clean');
    if (errors.length) console.log('\nPAGE ERRORS:\n' + errors.join('\n'));
    await browser.close();
    return;
  }

  const out = path.resolve(dir, o.out || 'out.mp4');
  const from = parseFloat(o.from || 0), to = Math.min(info.duration, parseFloat(o.to || info.duration));
  const total = Math.round((to - from) * fps);
  const ff = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];
  if (o.audio) ff.push('-i', path.resolve(dir, o.audio), '-c:a', 'aac', '-b:a', '160k', '-shortest');
  ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
  const proc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((res, rej) => proc.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));

  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((tt) => __tldr.seek(tt), from + i / fps);
    const buf = await page.screenshot({ type: 'png', optimizeForSpeed: true });
    if (!proc.stdin.write(buf)) await new Promise((r) => proc.stdin.once('drain', r));
    if (i % (fps * 5) === 0) console.log(`  ${i}/${total} frames`);
  }
  proc.stdin.end();
  await closed;
  await page.evaluate((tt) => __tldr.seek(tt), to - 0.05);
  await page.screenshot({ path: path.join(dir, 'poster.png') });
  await browser.close();
  console.log(`\n✓ ${out}  (${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
