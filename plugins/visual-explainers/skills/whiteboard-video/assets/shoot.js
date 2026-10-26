const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const shots = JSON.parse(fs.readFileSync('shots.json', 'utf8'));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve('render.html') + '?t=1', { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 20000 });

  let n = 0;
  for (const t of shots) {
    const out = `frames/f${String(Math.round(t * 100)).padStart(7, '0')}.png`;
    if (fs.existsSync(out) && fs.statSync(out).size > 0) { n++; continue; }
    await page.evaluate((tt) => window.renderAt(tt), t + 0.05);
    await page.screenshot({ path: out });
    n++;
    if (n % 50 === 0) console.log(`${n}/${shots.length}`);
  }
  await browser.close();
  console.log('done', n);
})().catch(e => { console.error(e); process.exit(1); });
