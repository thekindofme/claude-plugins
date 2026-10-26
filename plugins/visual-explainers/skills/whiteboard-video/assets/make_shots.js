// Validate scenes.js and emit shots.json (sorted unique element-appearance times).
// Usage: node make_shots.js <video_duration_seconds>
const fs = require('fs');
const { SCENES_ALL } = require('./scenes.js');

const DUR = parseFloat(process.argv[2]);
if (!DUR) { console.error('usage: node make_shots.js <video_duration_seconds>'); process.exit(1); }

const SCENES = SCENES_ALL.slice().sort((a, b) => a.start - b.start);
let shots = [], warnings = 0;
SCENES.forEach((s, i) => {
  const end = (i + 1 < SCENES.length) ? SCENES[i + 1].start : DUR;
  const ts = new Set([s.start]);
  s.els.forEach(e => {
    if (e.at < s.start)  { console.error(`WARN scene ${s.id || i+1} "${s.title}": element at ${e.at} < scene start ${s.start}`); warnings++; }
    if (e.at >= end)     { console.error(`WARN scene ${s.id || i+1} "${s.title}": element at ${e.at} >= scene end ${end}`); warnings++; }
    ts.add(Math.min(Math.max(e.at, s.start), end - 0.5));
  });
  [...ts].forEach(t => shots.push(t));
});
shots = [...new Set(shots)].sort((a, b) => a - b);
fs.writeFileSync('shots.json', JSON.stringify(shots));
console.log(`scenes: ${SCENES.length}, shots: ${shots.length}, warnings: ${warnings}`);
