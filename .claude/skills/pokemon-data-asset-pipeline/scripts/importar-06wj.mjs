// Importa un modelo animado de 06wj/pokemon (public/models/<n.º>/model.glb, clips de Escarlata/Púrpura) al formato del juego:
// - se quedan idle, run, attack, victory (su «happy») y faint (su «sleep», los primeros 3 s); fuera «walk» y lo demás
// - attack se recorta alrededor del golpe (0,7 s antes y 0,45 s después); el golpe es el pico de movimiento de los huesos
// - imprime el .json que necesita (glb, alias de special y fracción del golpe)
// Después: node optimizar-modelo.mjs salida.glb public/anims/<n.º>.glb, guardar el .json y añadir el número a ANIM_SET (board3d.js).
// Necesita (fuera del proyecto): npm i @gltf-transform/core@4 @gltf-transform/extensions@4 draco3dgltf
// Uso: node importar-06wj.mjs entrada.glb salida.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const [IN, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN), root = doc.getRoot();
const KEEP = { idle: 'idle', run: 'run', attack: 'attack', happy: 'victory', sleep: 'faint' };
const PRE = .7, POST = .45, FAINT = 3;

// valor de un muestreador en el instante t (lineal; los cuaterniones normalizados)
function sampleAt(times, vals, n, t) {
  let i = times.findIndex(x => x >= t); if (i < 0) i = times.length - 1;
  if (i === 0 || times[i] === t) return Array.from(vals.slice(i * n, i * n + n));
  const a = (t - times[i - 1]) / (times[i] - times[i - 1]), out = [];
  for (let k = 0; k < n; k++) out.push(vals[(i - 1) * n + k] * (1 - a) + vals[i * n + k] * a);
  if (n === 4) { const l = Math.hypot(...out) || 1; for (let k = 0; k < 4; k++) out[k] /= l; }
  return out;
}
// recorta [t0, t1] y lo lleva a empezar en 0 (con los extremos interpolados)
function trim(anim, t0, t1) {
  for (const s of anim.listSamplers()) {
    // los muestreadores comparten el accesor de tiempos: cada uno recorta su propia copia
    const inA = s.getInput().clone(), outA = s.getOutput().clone(); s.setInput(inA); s.setOutput(outA); const times = Array.from(inA.getArray()), vals = outA.getArray(), n = outA.getElementSize();
    const keep = times.map((t, i) => [t, i]).filter(([t]) => t > t0 && t < t1);
    const nt = [0, ...keep.map(([t]) => t - t0), t1 - t0], nv = [...sampleAt(times, vals, n, t0)];
    for (const [, i] of keep) nv.push(...vals.slice(i * n, i * n + n));
    nv.push(...sampleAt(times, vals, n, t1));
    inA.setArray(new Float32Array(nt)); outA.setArray(new (vals.constructor)(nv));
  }
}
const dur = a => Math.max(...a.listSamplers().map(s => { const t = s.getInput().getArray(); return t[t.length - 1]; }));
// golpe del ataque: el instante en que los huesos giran más deprisa (suma de cambios de rotación entre fotogramas)
function hitTime(anim) {
  const D = dur(anim), N = Math.max(10, Math.round(D * 30)), sp = new Array(N).fill(0);
  for (const c of anim.listChannels()) {
    if (c.getTargetPath() !== 'rotation') continue; const s = c.getSampler(), t = Array.from(s.getInput().getArray()), v = s.getOutput().getArray();
    let prev = sampleAt(t, v, 4, 0);
    for (let k = 1; k < N; k++) { const q = sampleAt(t, v, 4, k / N * D); const dot = Math.abs(q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3]); sp[k] += Math.acos(Math.min(1, dot)); prev = q; }
  }
  // se suaviza para no tomar un tic suelto y se ignora el primer y último 10 %
  let best = 0, bi = 0; for (let k = Math.floor(N * .1); k < N * .9; k++) { const m = (sp[k - 1] || 0) + sp[k] + (sp[k + 1] || 0); if (m > best) { best = m; bi = k; } }
  return bi / N * D;
}

const meta = { glb: true, nota: '', alias: { special: 'attack' } };
for (const a of root.listAnimations()) {
  const name = KEEP[a.getName()];
  if (!name) { a.dispose(); continue; }
  a.setName(name);
  if (name === 'attack') { const h = hitTime(a), D = dur(a), t0 = Math.max(0, h - PRE), t1 = Math.min(D, h + POST); trim(a, t0, t1); const f = +((h - t0) / (t1 - t0)).toFixed(3); meta.attack = { hit: f }; meta.special = { hit: f }; }
  if (name === 'faint' && dur(a) > FAINT) trim(a, 0, FAINT);
}
// muestreadores y accesores huérfanos fuera
for (const acc of root.listAccessors()) if (!acc.listParents().some(p => p.propertyType !== 'Root')) acc.dispose();
await io.write(OUT, doc);
console.log(JSON.stringify({ clips: root.listAnimations().map(a => [a.getName(), +dur(a).toFixed(2)]), meta }));
