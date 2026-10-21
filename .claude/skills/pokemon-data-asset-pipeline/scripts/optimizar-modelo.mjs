// Necesita (fuera del proyecto, no son dependencias del juego): npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf
// Aligera un .glb de public/anims sin cambiar cómo se ve:
// - quita las pistas de animación de huesos que no se mueven en ese clip (iguales a su pose de reposo)
// - quita fotogramas redundantes (resample) y lo que quede sin usar
// - Draco con algo menos de precisión (imperceptible al tamaño de las fichas)
// Uso: node opt.mjs entrada.glb salida.glb [bitsPos=12]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample, draco, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const [inp, out, bp = '12'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(inp), root = doc.getRoot();
const before = root.listAnimations().reduce((s, a) => s + a.listChannels().length, 0);

await doc.transform(resample({ tolerance: 1e-4 }));
const EPS = 1e-4;
const rest = (node, path) => path === 'rotation' ? node.getRotation() : path === 'scale' ? node.getScale() : path === 'translation' ? node.getTranslation() : null;
let removed = 0; const moving = new Set(), cand = [];
for (const anim of root.listAnimations()) for (const ch of anim.listChannels()) {
  const node = ch.getTargetNode(), path = ch.getTargetPath(), s = ch.getSampler(), r = node && rest(node, path);
  if (!r || !s) continue;
  const v = s.getOutput().getArray(), n = r.length; let still = true;
  for (let i = 0; i < v.length && still; i += n) for (let k = 0; k < n; k++) {
    // un cuaternión q y -q son la misma rotación
    const d = Math.abs(v[i + k] - r[k]), d2 = path === 'rotation' ? Math.abs(v[i + k] + r[k]) : d;
    if (Math.min(d, d2) > EPS) { still = false; break; } }
  const key = node.getName() + '|' + path; if (still) cand.push([ch, s, key]); else moving.add(key);
}
// Solo si ese hueso no se mueve en NINGÚN clip: así nunca queda sin pista en un clip y con ella en otro (al fundirse daría otra pose)
for (const [ch, s, key] of cand) if (!moving.has(key)) { ch.dispose(); s.dispose(); removed++; }
await doc.transform(prune(), dedup(), draco({ method: 'edgebreaker', quantizePosition: +bp, quantizeNormal: 8, quantizeTexcoord: 11, quantizeGeneric: 10 }));
await io.write(out, doc);
const after = root.listAnimations().reduce((s, a) => s + a.listChannels().length, 0);
console.log(JSON.stringify({ out, pistasAntes: before, pistasDespues: after, quitadas: removed }));
