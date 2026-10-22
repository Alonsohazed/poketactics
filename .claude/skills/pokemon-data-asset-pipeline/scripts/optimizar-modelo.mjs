// Necesita (fuera del proyecto, no son dependencias del juego): npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf sharp
// Aligera un .glb de public/anims sin que se note al tamaño de las fichas:
// - quita fotogramas intermedios que se pueden interpolar (resample con tolerancia 0,001: error máximo medido de 1-3° en las rotaciones)
// - quita las pistas de los huesos que no se mueven en ningún clip (iguales a su pose de reposo)
// - rotaciones de las animaciones en enteros de 16 bits normalizados (KHR_mesh_quantization; three.js las lee) en vez de 32 bits
// - texturas a 512 px como mucho, en WebP q82 (los modelos miden unos 60-120 px en pantalla)
// - mallas con Draco
// Uso: node optimizar-modelo.mjs entrada.glb salida.glb [tolerancia=0.001]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, resample, draco, dedup, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const [inp, out, tol = '0.001'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(inp), root = doc.getRoot();
const before = root.listAnimations().reduce((s, a) => s + a.listChannels().length, 0);

await doc.transform(resample({ tolerance: +tol }));
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
// Rotaciones a 16 bits normalizados (cada cuaternión se normaliza antes)
let q16 = 0;
for (const anim of root.listAnimations()) for (const ch of anim.listChannels()) {
  if (ch.getTargetPath() !== 'rotation') continue; const acc = ch.getSampler().getOutput(); const v = acc.getArray();
  if (!(v instanceof Float32Array)) continue;
  const o = new Int16Array(v.length);
  for (let i = 0; i < v.length; i += 4) { const l = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) || 1; for (let k = 0; k < 4; k++) o[i + k] = Math.round(Math.max(-1, Math.min(1, v[i + k] / l)) * 32767); }
  acc.setArray(o).setNormalized(true); q16++;
}
if (q16) doc.createExtension(KHRMeshQuantization).setRequired(true);
// Relieve, brillo y oclusión (normalTexture, metallicRoughnessTexture, occlusionTexture) a 256 px: a este tamaño en pantalla no se distingue
// más detalle y en los modelos de 06wj eran la mitad del peso de las texturas. El color se queda en 512 px.
const isAux = t => t.listParents().some(p => p.propertyType === 'Material' && [p.getNormalTexture(), p.getMetallicRoughnessTexture(), p.getOcclusionTexture()].includes(t));
const over = (t, m) => { const s = t.getSize(); return s && (s[0] > m || s[1] > m); };
if (root.listTextures().some(t => isAux(t) && over(t, 256))) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [256, 256], slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/ }));
if (root.listTextures().some(t => over(t, 512) || t.getMimeType() !== 'image/webp')) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [512, 512] }));
await doc.transform(prune(), dedup(), draco({ method: 'edgebreaker', quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 11, quantizeGeneric: 10 }));
await io.write(out, doc);
const after = root.listAnimations().reduce((s, a) => s + a.listChannels().length, 0);
console.log(JSON.stringify({ out, pistasAntes: before, pistasDespues: after, quitadas: removed, rotaciones16: q16 }));
