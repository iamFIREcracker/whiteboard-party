// Generates a state.json seed for the pinned room 20220402.b4t4fmyrcf:
// a welcome message rendered as whiteboard strokes, centered on the
// client's initial viewport (canvas 4000x2000, view centered at 2000,1000).
//
// Stroke format (see public/main.js inputStarted/drawShape):
//   { i: '<id>', c: '<color name>', p: [{x,y}, ...] }
// Rendering uses p5 curveVertex (Catmull-Rom): first/last points are control
// points and are NOT drawn. Duplicating every point makes the spline collapse
// to straight segments (tangents align with the chord), so:
//   - 'poly' strokes  -> every point doubled  => crisp straight polylines
//   - 'curve' strokes -> only endpoints doubled => smooth splines
const fs = require("fs");

// Glyphs in a unit box, x in [0,1], y in [0,1] (y down).
// Each glyph = list of strokes; a stroke = {t: 'poly'|'curve', pts: [[x,y],...]}
const P = (...pts) => ({ t: "poly", pts });
const C = (...pts) => ({ t: "curve", pts });

const GLYPHS = {
  " ": [],
  W: [P([0, 0], [0.25, 1], [0.5, 0.35], [0.75, 1], [1, 0])],
  E: [P([1, 0], [0, 0], [0, 1], [1, 1]), P([0, 0.5], [0.75, 0.5])],
  L: [P([0, 0], [0, 1], [1, 1])],
  C: [C([0.95, 0.15], [0.62, 0], [0.18, 0.1], [0, 0.5], [0.18, 0.9], [0.62, 1], [0.95, 0.85])],
  O: [C([0.5, 0], [0.88, 0.14], [1, 0.5], [0.88, 0.86], [0.5, 1], [0.12, 0.86], [0, 0.5], [0.12, 0.14], [0.5, 0])],
  M: [P([0, 1], [0, 0], [0.5, 0.55], [1, 0], [1, 1])],
  T: [P([0, 0], [1, 0]), P([0.5, 0], [0.5, 1])],
  H: [P([0, 0], [0, 1]), P([1, 0], [1, 1]), P([0, 0.5], [1, 0.5])],
  I: [P([0.2, 0], [0.8, 0]), P([0.5, 0], [0.5, 1]), P([0.2, 1], [0.8, 1])],
  B: [
    P([0, 0], [0, 1]),
    P([0, 0], [0.75, 0], [0.9, 0.1], [0.9, 0.4], [0.75, 0.5], [0, 0.5]),
    P([0, 0.5], [0.8, 0.5], [0.95, 0.6], [0.95, 0.9], [0.8, 1], [0, 1]),
  ],
  A: [P([0, 1], [0.5, 0], [1, 1]), P([0.22, 0.62], [0.78, 0.62])],
  R: [
    P([0, 1], [0, 0]),
    P([0, 0], [0.75, 0], [0.9, 0.12], [0.9, 0.38], [0.75, 0.5], [0, 0.5]),
    P([0.55, 0.5], [1, 1]),
  ],
  D: [P([0, 0], [0, 1]), C([0, 0], [0.55, 0], [0.9, 0.2], [1, 0.5], [0.9, 0.8], [0.55, 1], [0, 1])],
  P: [
    P([0, 1], [0, 0]),
    P([0, 0], [0.75, 0], [0.92, 0.12], [0.92, 0.42], [0.75, 0.55], [0, 0.55]),
  ],
  Y: [P([0, 0], [0.5, 0.45], [1, 0]), P([0.5, 0.45], [0.5, 1])],
  G: [
    C([0.95, 0.15], [0.6, 0], [0.18, 0.1], [0, 0.5], [0.18, 0.9], [0.6, 1], [0.95, 0.85], [0.95, 0.58]),
    P([0.95, 0.58], [0.55, 0.58]),
  ],
  "!": [P([0.5, 0], [0.5, 0.62]), P([0.5, 0.85], [0.5, 1])],
};

const shapes = []; // {c, strokes: [{t, pts:[[x,y],...]}]} in canvas coords
let idCounter = 1;

function addText(text, color, cx, top, charH, charW, gap) {
  const adv = charW + gap;
  const lineW = text.length * adv - gap;
  let x = cx - lineW / 2;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (glyph === undefined) throw new Error(`missing glyph: ${ch}`);
    for (const stroke of glyph) {
      shapes.push({
        c: color,
        t: stroke.t,
        pts: stroke.pts.map(([gx, gy]) => [x + gx * charW, top + gy * charH]),
      });
    }
    x += adv;
  }
}

function addCircle(color, cx, cy, r, a0deg, a1deg, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0deg + ((a1deg - a0deg) * i) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  shapes.push({ c: color, t: "curve", pts });
}

// ---- Layout (canvas 4000x2000, initial view centered at 2000,1000) ----
addText("WELCOME TO", "black", 2000, 720, 120, 80, 26);
addText("WHITEBOARD", "blue", 2000, 895, 120, 80, 26);
addText("PARTY!", "red", 2000, 1070, 120, 80, 26);
addText("DRAW TOGETHER", "green", 2000, 1300, 60, 40, 14);

// Smiley to the right of "PARTY!" (which ends around x=2318, y 1070..1190)
const scx = 2460, scy = 1130;
addCircle("black", scx, scy, 80, 0, 360, 24); // face
shapes.push({ c: "black", t: "poly", pts: [[scx - 28, scy - 35], [scx - 28, scy - 12]] }); // left eye
shapes.push({ c: "black", t: "poly", pts: [[scx + 28, scy - 35], [scx + 28, scy - 12]] }); // right eye
addCircle("red", scx, scy, 45, 25, 155, 10); // smile (y-down: positive angles are below center)

// ---- Emit app JSON ----
const round = (v) => Math.round(v);
function toAppPoints(stroke) {
  const pts = stroke.pts.map(([x, y]) => ({ x: round(x), y: round(y) }));
  if (stroke.t === "poly") {
    return pts.flatMap((p) => [p, { ...p }]);
  }
  return [pts[0], ...pts, pts[pts.length - 1]];
}

const undo = shapes.map((s) => ({
  i: `seed-${idCounter++}`,
  c: s.c,
  p: toAppPoints(s),
}));

const state = { "20220402.b4t4fmyrcf": { undo, redo: [] } };
fs.writeFileSync("seed-state.json", JSON.stringify(state));

// ---- SVG preview (approximates curveVertex with Catmull-Rom sampling) ----
const COLORS = { black: "#212529", blue: "#0d6efd", green: "#198754", red: "#dc3545" };

function catmullRomSample(pts, steps = 12) {
  // Sample the same curve p5 draws: segments between pts[1]..pts[n-2],
  // after duplicating endpoints (like toAppPoints does for 'curve').
  const v = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < v.length - 2; i++) {
    const [p0, p1, p2, p3] = [v[i - 1], v[i], v[i + 1], v[i + 2]];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

let svgLines = "";
for (const s of shapes) {
  const pts = s.t === "curve" ? catmullRomSample(s.pts) : s.pts;
  const d = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  svgLines += `<polyline points="${d}" fill="none" stroke="${COLORS[s.c]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>\n`;
}
// Frame the initial desktop viewport (~1400x800 centered at 2000,1000) for reference
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1150 150 1700 1700" width="1700" height="1700">
<rect x="0" y="0" width="4000" height="2000" fill="#e9ecef"/>
<rect x="1300" y="600" width="1400" height="800" fill="none" stroke="#adb5bd" stroke-dasharray="12 8"/>
${svgLines}</svg>`;
fs.writeFileSync("preview.svg", svg);

console.log(`shapes: ${undo.length}, bytes: ${JSON.stringify(state).length}`);
