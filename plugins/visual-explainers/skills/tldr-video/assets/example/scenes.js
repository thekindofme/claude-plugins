/* Reference storyboard: "prompt caching in 40 seconds".
 * Shape to copy: old way → new way → the number that matters → the trade.
 * One running example (a 100k-token book) carried through every scene.
 * Times are scene-local seconds. Stage is 1280x720.
 */

// Shared layout so scene 1 and 2 are visually identical except for the thing that changed.
function requestDiagram(s, { modelTitle, modelSub }) {
  const app = s.box({ x: 66, y: 236, w: 320, h: 196, title: 'your app', at: 0.5 });
  app.body.classList.add('big');
  s.type(app.body, 'a 100k-token book + one question', { at: 1.0, dur: 1.1, by: 'char', mark: true });

  s.connector({ from: [386, 334], to: [590, 334], at: 2.2, packet: 'req', packetDur: 0.9 });
  const model = s.box({ x: 590, y: 190, w: 560, h: 290, title: modelTitle, sub: modelSub, at: 2.0 });

  // 60 cells = the prompt, 58 of them are the book (the reusable prefix)
  const cells = [];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.style.cssText = `position:absolute;left:${24 + (i % 15) * 34}px;top:${62 + Math.floor(i / 15) * 34}px;width:26px;height:26px;border:1.5px solid var(--faint);`;
    model.appendChild(c); cells.push(c);
  }
  const legend = s.note('', { x: 24, y: 212, parent: model });
  legend.style.whiteSpace = 'nowrap';
  return { model, cells, legend };
}

TLDR.video({
  source: 'anthropic.com/news/prompt-caching',
  scenes: [
    {
      title: 'without caching',
      duration: 11,
      build(s) {
        const { cells, legend } = requestDiagram(s, { modelTitle: 'model', modelSub: 'reading the prompt...' });
        legend.textContent = 'each square ≈ 1,700 tokens. all of them get processed.';
        s.show(legend, { at: 3.4 });
        s.custom({ at: 3.3, dur: 4.2, update: (p) => {
          const n = Math.round(p * cells.length);
          cells.forEach((c, i) => {
            c.style.background = i < n ? 'var(--ink)' : 'transparent';
            c.style.borderColor = i < n ? 'var(--ink)' : 'var(--faint)';
          });
        } });
        s.counter({ x: 590, y: 130, to: 11.5, at: 3.1, countAt: 3.3, dur: 4.2, verdict: 'bad' });
        s.caption('every request re-reads the whole book.', { at: 8.0 });
        s.punch('11.5 seconds', { at: 8.5 });
      },
    },
    {
      title: 'with caching',
      duration: 11,
      build(s) {
        const { cells, legend } = requestDiagram(s, { modelTitle: 'model', modelSub: 'prefix found in cache' });
        legend.innerHTML = '<span class="hl-hot">cached</span> = stored on the first call, skipped after.';
        s.show(legend, { at: 4.0 });
        // the 58 book cells light up at once; only the 2 new ones are actually processed
        s.custom({ at: 3.3, dur: 0.35, update: (p) => {
          cells.slice(0, 58).forEach((c) => { c.style.background = p > 0 ? 'var(--amber)' : 'transparent'; c.style.borderColor = p > 0 ? 'var(--line)' : 'var(--faint)'; c.style.opacity = 0.35 + 0.65 * p; });
        } });
        s.custom({ at: 3.7, dur: 0.9, update: (p) => {
          cells.slice(58).forEach((c, i) => { const on = p * 2 > i; c.style.background = on && p > 0 ? 'var(--ink)' : 'transparent'; c.style.borderColor = on && p > 0 ? 'var(--ink)' : 'var(--faint)'; });
        } });
        s.counter({ x: 590, y: 130, to: 2.4, at: 3.1, countAt: 3.3, dur: 1.3, verdict: 'good' });
        s.caption('only the new part gets processed.', { at: 7.2 });
        s.punch('2.4 seconds', { at: 7.7 });
      },
    },
    {
      title: 'what you pay',
      duration: 10,
      build(s) {
        s.label('price per input token, relative to normal', { x: 66, y: 176, at: 0.5 });
        s.bars({
          x: 66, y: 214, at: 0.8, chipW: 190, trackW: 420, max: 1.25, decimals: 2, suffix: 'x', pick: 2,
          items: [{ label: 'cache write', value: 1.25 }, { label: 'normal input', value: 1.0 }, { label: 'cache read', value: 0.1 }],
        });
        s.stat({ x: 880, y: 230, value: -90, suffix: '%', label: 'cost on a cache hit', at: 3.4, dur: 1.0 });
        s.note('you pay a little extra once, to write.<br>then every hit is a tenth of the price.', { x: 66, y: 440, at: 4.4 });
        s.caption('the first call costs more. every call after, far less.', { at: 6.2 });
        s.punch('write once, read cheap', { at: 6.7 });
      },
    },
    {
      title: 'the trade',
      duration: 9,
      build(s) {
        s.list({ x: 66, y: 190, title: 'helps', tone: 'good', at: 0.6, stagger: 0.4,
          items: ['long system prompts', 'docs, books, codebases', 'many-turn conversations', 'big tool definitions'] });
        s.list({ x: 660, y: 190, title: "doesn't", tone: 'bad', at: 3.0, stagger: 0.5,
          items: ['prompts that change at the top', 'one-off requests', 'long idle gaps (cache expires)'] });
        s.caption('same model, same answer.', { at: 6.0 });
        s.punch('put the stable stuff first', { at: 6.5 });
      },
    },
  ],
});
