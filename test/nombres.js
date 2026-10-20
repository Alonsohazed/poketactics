/* Pruebas del generador de nombres de los rivales: formato del registro, colisiones, diversidad, partidas reales y compatibilidad con cuentas.
   Carga augments.js + game.js como cada sala del servidor. Uso: node test/nombres.js [--muestra] */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['augments.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8')).join('\n');
const ctx = { __SERVER__: true, module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FALLO:', msg); } };
// El mismo formato que acepta el registro de cuentas (auth.js) y el límite con el que se muestran los nombres en partida
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/, MAX_SHOWN = 14;
const norm = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
const sig = n => n.replace(/[A-Z][a-z]+/g, 'A').replace(/[a-z]+/g, 'a').replace(/\d+/g, m => 'd' + m.length);

// 1. Más de 10.000 generaciones sin errores, con el formato válido
const all = [];
for (let i = 0; i < 10000; i++) { const n = E.generateBotName([]); all.push(n); ok(NAME_RE.test(n) && n.length <= MAX_SHOWN, 'formato inválido: ' + n); }
ok(new Set(all.map(norm)).size > 4000, 'poca variedad: ' + new Set(all.map(norm)).size + ' nombres distintos de 10000');

// 2. Sin colisiones dentro de una misma partida (7 rivales + un humano cuyo nombre el generador también podría producir)
let col = 0, mismaSig = 0, partidas = 3000;
for (let g = 0; g < partidas; g++) {
  const humano = all[g], used = [humano];
  for (let k = 0; k < 7; k++) used.push(E.generateBotName(used));
  const ns = used.map(norm); if (new Set(ns).size !== ns.length) col++;
  if (new Set(used.map(sig)).size < 7) mismaSig++;
}
ok(col === 0, 'colisiones dentro de una partida: ' + col);
ok(mismaSig / partidas < .12, 'demasiadas partidas con estructuras repetidas: ' + (100 * mismaSig / partidas).toFixed(1) + ' %');

// 3. Diversidad de formatos y categorías
const cuenta = re => all.filter(n => re.test(n)).length / all.length;
const stats = { conNumero: cuenta(/\d/), conGuion: cuenta(/_/), mx: cuenta(/mx/i), gg: cuenta(/gg$/i), exe: cuenta(/exe/i), minusculas: cuenta(/^[a-z0-9_]+$/), simple: cuenta(/^[A-Za-z]+$/) };
ok(stats.conNumero > .25 && stats.conNumero < .6, 'proporción con números rara: ' + stats.conNumero);
ok(stats.mx < .12 && stats.gg < .12 && stats.exe < .12, 'abuso de sufijos: ' + JSON.stringify(stats));
ok(stats.simple > .25 && stats.minusculas > .1, 'poca variedad de estilos: ' + JSON.stringify(stats));
ok(all.every(n => !/^\d/.test(n) && !/69|420|666|88/.test(n.replace(/\D/g, '')) && !/nazi|hitler|puta|pinche|verga|culo|mierda|sex|porn/i.test(n)), 'nombre inapropiado');
// Sin secuencias evidentes (Alex01, Alex02...) en la misma partida: nunca comparten la parte de letras
let seq = 0; for (let g = 0; g < 2000; g++) { const used = []; for (let k = 0; k < 7; k++) used.push(E.generateBotName(used)); const w = used.map(n => norm(n).replace(/\d+/g, '')).filter(x => x.length >= 3); for (let a = 0; a < w.length; a++) for (let b = a + 1; b < w.length; b++) if (w[a] === w[b]) seq++; }
ok(seq === 0, 'nombres con la misma base en una partida: ' + seq);

// 3b. Compatibilidad con cuentas: el generador no reserva nada y respeta los nombres humanos de la partida
{ const humanos = ['Alex27', 'Mau_17', 'GengarMx', 'DittoMain', 'Kuro', 'SoyDani'];
  for (let g = 0; g < 500; g++) { const used = [...humanos]; for (let k = 0; k < 2; k++) used.push(E.generateBotName(used)); ok(used.slice(6).every(n => !humanos.map(norm).includes(norm(n))), 'chocó con un humano'); } }
// Si el catálogo se agotara siempre hay respaldo único y válido
{ const used = []; for (let i = 0; i < 300; i++) used.push(E.generateBotName(used)); ok(new Set(used.map(norm)).size === 300 && used.every(n => NAME_RE.test(n)), 'respaldo al llenar la partida'); }

// 4. Partidas reales (solitario y sala de servidor con dos humanos): nombres válidos, únicos, estables y sin rastro de bots
const revisa = (G, etiqueta, nombres) => {
  ok(G.players.length === 8, etiqueta + ': faltan jugadores');
  ok(new Set(G.players.map(p => norm(p.name))).size === 8, etiqueta + ': nombres repetidos ' + G.players.map(p => p.name));
  ok(G.players.slice(1).filter(p => p.isBot).every(p => NAME_RE.test(p.name) && p.name.length <= MAX_SHOWN && !/bot|🤖/i.test(p.name)), etiqueta + ': nombre de rival inválido');
  ok(new Set(G.players.map(p => p.id)).size === 8, etiqueta + ': ids internos repetidos');
  if (nombres) ok(G.players.every((p, i) => p.name === nombres[i]), etiqueta + ': el nombre cambió durante la partida');
};
E.newGame({ auto: true, diff: 'normal' }); revisa(E.G, 'solitario');
const emitidos = [];
E.serverCreate({ diff: 'normal', timer: 30, speed: 1, humans: [{ nick: 'Alex27', peer: 'a', tr: '' }, { nick: 'GengarMx', peer: 'b', tr: '' }] }, (t, d) => emitidos.push([t, d]));
{ const G = E.G, nombres = G.players.map(p => p.name); revisa(G, 'servidor');
  ok(nombres[0] === 'Alex27' && nombres[1] === 'GengarMx', 'se cambió el nombre de un humano: ' + nombres.slice(0, 2));
  for (let t = 0; t < 1500 && !G.over; t++) E.serverTick(0.05);
  revisa(G, 'servidor tras jugar', nombres);
  const pubs = emitidos.filter(e => e[0] === 'pub').map(e => e[1]); ok(pubs.length > 0, 'no se envió el estado público');
  ok(pubs.every(p => p.pl.every(r => r[9] === 0)), 'el estado público marca bots');
  ok(!/🤖|(bot)|bot/i.test(JSON.stringify(emitidos)), 'rastro de bot en lo enviado a los clientes');
  const uno = pubs[pubs.length - 1].pl.map(r => r[1]); ok(uno.join() === nombres.join(), 'los clientes reciben los mismos nombres'); }

if (process.argv.includes('--muestra') || fails) { const m = []; for (let i = 0; i < 100; i++) m.push(E.generateBotName([])); console.log('Muestra de 100 nombres:\n' + m.join('  ')); console.log('Estadísticas:', JSON.stringify(stats)); }
console.log(`${checks - fails}/${checks} comprobaciones correctas`);
if (fails) { console.log('FALLARON ' + fails); process.exit(1); }
console.log('OK: pruebas de nombres superadas');
