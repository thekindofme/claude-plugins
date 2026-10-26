// Excalidraw-style whiteboard renderer (rough.js + Virgil font).
// Expects globals: META (from meta.js), SCENES_ALL (from scenes.js), canvas #cv.
const C = {
  ink:    '#1e1e1e',
  blue:   '#1971c2', blueL:   '#a5d8ff',
  red:    '#e03131', redL:    '#ffc9c9',
  green:  '#2f9e44', greenL:  '#b2f2bb',
  orange: '#f08c00', orangeL: '#ffec99',
  violet: '#9c36b5', violetL: '#eebefa',
  gray:   '#868e96', grayL:   '#e9ecef',
  teal:   '#0c8599', tealL:   '#99e9f2',
};

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const rc = rough.canvas(cv);

// deterministic seed per element so shapes are identical across frames
function seedOf(sceneId, idx) { return (sceneId * 733 + idx * 97) % 2147483000 + 1; }

function rOpts(el, seed, overrides) {
  const o = {
    seed,
    roughness: el.rough !== undefined ? el.rough : 1.4,
    bowing: 1.2,
    stroke: el.color || C.ink,
    strokeWidth: el.sw || 2.6,
  };
  if (el.dash) o.strokeLineDash = [10, 9];
  if (el.fill) {
    o.fill = el.fill;
    o.fillStyle = el.solid ? 'solid' : 'hachure';
    o.hachureGap = 7;
    o.fillWeight = 1.4;
    o.hachureAngle = -41 + (seed % 17);
  }
  return Object.assign(o, overrides || {});
}

function drawMultiline(text, x, y, size, color, align, lh, bold) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px Virgil';
  ctx.fillStyle = color || C.ink;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const LH = lh || size * 1.22;
  const y0 = y - (lines.length - 1) * LH / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, x, y0 + i * LH));
}

function labelInBox(el, cx, cy) {
  if (!el.label) return;
  const size = el.size || 26;
  drawMultiline(el.label, cx, cy, size, el.tcolor || el.color || C.ink, 'center');
}

function arrowHead(x1, y1, x2, y2, el, seed) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = 16;
  const a1 = ang + Math.PI - 0.42, a2 = ang + Math.PI + 0.42;
  const o = rOpts(el, seed); delete o.strokeLineDash;
  rc.line(x2, y2, x2 + L * Math.cos(a1), y2 + L * Math.sin(a1), o);
  rc.line(x2, y2, x2 + L * Math.cos(a2), y2 + L * Math.sin(a2), o);
}

function drawEl(el, sceneId, idx) {
  const seed = seedOf(sceneId, idx);
  switch (el.t) {
    case 'box': {
      rc.rectangle(el.x, el.y, el.w, el.h, rOpts(el, seed));
      labelInBox(el, el.x + el.w / 2, el.y + el.h / 2);
      break;
    }
    case 'ellipse': {
      rc.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w, el.h, rOpts(el, seed));
      labelInBox(el, el.x + el.w / 2, el.y + el.h / 2);
      break;
    }
    case 'diamond': {
      const cx2 = el.x + el.w / 2, cy2 = el.y + el.h / 2;
      rc.polygon([[cx2, el.y], [el.x + el.w, cy2], [cx2, el.y + el.h], [el.x, cy2]], rOpts(el, seed));
      labelInBox(el, cx2, cy2);
      break;
    }
    case 'arrow': {
      if (el.curve) {
        const mx = (el.x1 + el.x2) / 2 + (el.curve[0] || 0);
        const my = (el.y1 + el.y2) / 2 + (el.curve[1] || 0);
        rc.curve([[el.x1, el.y1], [mx, my], [el.x2, el.y2]], rOpts(el, seed));
        arrowHead(mx, my, el.x2, el.y2, el, seed + 1);
        if (el.dir === 'both') arrowHead(mx, my, el.x1, el.y1, el, seed + 2);
      } else {
        rc.line(el.x1, el.y1, el.x2, el.y2, rOpts(el, seed));
        arrowHead(el.x1, el.y1, el.x2, el.y2, el, seed + 1);
        if (el.dir === 'both') arrowHead(el.x2, el.y2, el.x1, el.y1, el, seed + 2);
      }
      if (el.label) {
        const lx = el.lx !== undefined ? el.lx : (el.x1 + el.x2) / 2 + (el.curve ? el.curve[0] * 0.7 : 0);
        const ly = el.ly !== undefined ? el.ly : (el.y1 + el.y2) / 2 + (el.curve ? el.curve[1] * 0.7 : 0) - 18;
        drawMultiline(el.label, lx, ly, el.size || 22, el.tcolor || el.color || C.ink, 'center');
      }
      break;
    }
    case 'line': {
      rc.linearPath(el.pts, rOpts(el, seed));
      break;
    }
    case 'text': {
      drawMultiline(el.text, el.x, el.y, el.size || 28, el.color, el.align, el.lh, el.bold);
      break;
    }
    case 'note': {
      drawMultiline(el.text, el.x, el.y, el.size || 21, el.color || C.gray, el.align, el.lh);
      break;
    }
    case 'hl': { // highlight swatch (renderer draws these beneath everything else)
      rc.rectangle(el.x, el.y, el.w, el.h, rOpts(el, seed, {
        stroke: 'rgba(0,0,0,0)', fill: el.fill || C.orangeL, fillStyle: 'hachure', hachureGap: 6, fillWeight: 3,
      }));
      break;
    }
    case 'underline': {
      rc.line(el.x, el.y, el.x + el.w, el.y + (el.tilt || 3), rOpts(el, seed, { strokeWidth: el.sw || 3 }));
      break;
    }
    case 'tick': {
      rc.linearPath([[el.x, el.y + 8], [el.x + 10, el.y + 20], [el.x + 30, el.y - 8]],
        rOpts(el, seed, { stroke: el.color || C.green, strokeWidth: 4 }));
      break;
    }
    case 'cross': {
      const s = el.s2 || 14;
      rc.line(el.x - s, el.y - s, el.x + s, el.y + s, rOpts(el, seed, { stroke: el.color || C.red, strokeWidth: 4 }));
      rc.line(el.x - s, el.y + s, el.x + s, el.y - s, rOpts(el, seed + 1, { stroke: el.color || C.red, strokeWidth: 4 }));
      break;
    }
    case 'spark': {
      const r1 = 10, r2 = 26;
      [-0.5 * Math.PI, -0.15 * Math.PI, -0.85 * Math.PI].forEach((a, i) => {
        rc.line(el.x + r1 * Math.cos(a), el.y + r1 * Math.sin(a),
                el.x + r2 * Math.cos(a), el.y + r2 * Math.sin(a),
                rOpts(el, seed + i, { stroke: el.color || C.orange, strokeWidth: 3 }));
      });
      break;
    }
    case 'cloud': {
      rc.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w, el.h,
        rOpts(el, seed, { strokeLineDash: [3, 7], roughness: 2.2 }));
      labelInBox(el, el.x + el.w / 2, el.y + el.h / 2);
      break;
    }
  }
}

// ---------- chrome: header + PiP frame ----------
function drawChrome(scene, sceneIdx) {
  ctx.font = '50px Virgil';
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.title, 64, 74);
  const tw = ctx.measureText(scene.title).width;
  rc.line(62, 106, 62 + tw + 14, 109, { seed: seedOf(scene.id, 901), roughness: 1.6, stroke: scene.accent || C.blue, strokeWidth: 3.5 });

  const mm = Math.floor(scene.start / 60), ss = Math.floor(scene.start % 60);
  ctx.font = '24px Virgil';
  ctx.fillStyle = C.gray;
  ctx.textAlign = 'right';
  ctx.fillText(`part ${sceneIdx + 1} / ${SCENES.length}  ·  ${mm}:${String(ss).padStart(2, '0')}`, 1856, 60);

  // PiP frame — ffmpeg/viewer put the video at (1450,782) 440x248 inside this
  rc.rectangle(1438, 770, 464, 272, { seed: seedOf(scene.id, 902), roughness: 1.6, stroke: C.ink, strokeWidth: 3 });
  ctx.font = '20px Virgil';
  ctx.fillStyle = C.gray;
  ctx.textAlign = 'center';
  ctx.fillText((typeof META !== 'undefined' && META.caption) || '', 1670, 1062);
}

function sceneAt(t) {
  let s = SCENES[0], si = 0;
  for (let i = 0; i < SCENES.length; i++) {
    if (t >= SCENES[i].start) { s = SCENES[i]; si = i; }
  }
  return [s, si];
}

function render(t) {
  ctx.clearRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1920, 1080);
  const [scene, si] = sceneAt(t);
  drawChrome(scene, si);
  // highlights first (background layer), then everything else in author order
  scene.els.forEach((el, idx) => { if (el.at <= t && el.t === 'hl') drawEl(el, scene.id, idx); });
  scene.els.forEach((el, idx) => { if (el.at <= t && el.t !== 'hl') drawEl(el, scene.id, idx); });
  return scene;
}

window.renderAt = render;
window.SCENES = (typeof SCENES_ALL !== 'undefined' ? SCENES_ALL : []).slice().sort((a, b) => a.start - b.start);
window.SCENES.forEach((s, i) => { if (!s.id) s.id = i + 1; });
