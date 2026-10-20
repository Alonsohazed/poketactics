/* Banco de rendimiento del combate (se inyecta en la página con una partida en solitario abierta).
   Monta combates fijos (mismos equipos y misma semilla) y mide durante unos segundos:
   fotogramas (FPS, p50/p95/p99), coste de JS por fotograma (draw completo y partes del 3D),
   llamadas de dibujo, triángulos, geometrías y texturas vivas, tareas largas (>50 ms) y errores.
   Uso: await PTBench.run('B', 8)  ·  await PTBench.all(8)  */
(() => {
  const TEAMS = {
    // A: pocas unidades
    A: [[['3,0', 'charmander', 2], ['3,3', 'pichu', 2]], [['3,0', 'squirtle', 2], ['3,3', 'abra', 2]]],
    // B: combate típico de mitad de partida (6 contra 6)
    B: [[['3,0', 'machop', 2], ['2,0', 'onix', 2], ['4,0', 'charmander', 2], ['2,3', 'pichu', 2], ['3,3', 'abra', 2], ['4,3', 'gastly', 2]],
        [['3,0', 'magikarp', 2], ['2,0', 'bulbasaur', 2], ['4,0', 'squirtle', 2], ['2,3', 'cleffa', 2], ['3,3', 'meowth', 2], ['4,3', 'magnemite', 2]]],
  };
  // C: 9 contra 9 con objetos de maná (muchas habilidades a la vez) · D: igual a 3★ (habilidades grandes y más efectos)
  const big = ['machop', 'onix', 'charmander', 'pichu', 'abra', 'gastly', 'magnemite', 'riolu', 'cleffa'], big2 = ['magikarp', 'bulbasaur', 'squirtle', 'meowth', 'dratini', 'larvitar', 'cleffa', 'abra', 'pichu'];
  const cells = ['3,0', '2,0', '4,0', '1,0', '5,0', '2,3', '3,3', '4,3', '1,3'];
  const mk = (list, star, items) => list.map((k, i) => [cells[i], k, star, items, 0, 0]);
  const snapOf = rows => ({ ag: [], m: {}, u: rows.map(r => r.length > 3 ? r : [r[0], r[1], r[2], [], 0, 0]) });
  const SC = {
    A: () => [snapOf(TEAMS.A[0]), snapOf(TEAMS.A[1])],
    B: () => [snapOf(TEAMS.B[0]), snapOf(TEAMS.B[1])],
    C: () => [snapOf(mk(big, 2, ['soothe', 'energy'])), snapOf(mk(big2, 2, ['soothe', 'energy']))],
    D: () => [snapOf(mk(big, 3, ['soothe', 'energy', 'mental'])), snapOf(mk(big2, 3, ['soothe', 'energy', 'mental']))],
  };
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const r2 = x => Math.round(x * 100) / 100;
  async function waitModels(cb, ms = 20000) { const t0 = performance.now(); const dexes = [...new Set(cb.units.map(u => dexOf(u.d, u.star)))]; B3.preload(dexes);
    while (performance.now() - t0 < ms && dexes.some(d => !['ok', 'fail'].includes(B3.modelStatus(d)))) await new Promise(r => setTimeout(r, 100)); return dexes.filter(d => B3.modelStatus(d) === 'ok').length + '/' + dexes.length; }
  async function run(name, secs = 8) {
    const [a, b] = SC[name]();
    // El combate se monta como el de la partida, pero con semilla fija y sin pasar de ronda al acabar
    const cb = createCombatSnap(a, b, { s: 4, n: 2, type: 'pvp' }, { seed: 12345, visual: true });
    G.view = null; G.combat = cb; G.phase = 'combat'; G.acc = 0; G.resolving = true; G.speed = 1;
    const models = await waitModels(cb);
    // reinicia el combate ya con los modelos cargados (la carga no cuenta)
    const cb2 = createCombatSnap(a, b, { s: 4, n: 2, type: 'pvp' }, { seed: 12345, visual: true }); G.combat = cb2; G.acc = 0;
    void B3.info; void B3.slow; // pone a cero los contadores del 3D
    const dts = [], drawMs = [], long = []; let errs = 0, info = { actorsMs: 0, fxMs: 0, glMs: 0, calls: 0, tris: 0, geo: 0, tex: 0 }, infoN = 0, maxFx = 0;
    const origDraw = window.draw; window.draw = function () { const t = performance.now(); origDraw(); drawMs.push(performance.now() - t); };
    const po = new PerformanceObserver(l => { for (const e of l.getEntries()) long.push(e.duration); }); try { po.observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const onErr = () => errs++; window.addEventListener('error', onErr);
    // Fluidez: fotogramas en los que algo se mueve (unidades o efectos) pero la imagen calculada es idéntica a la anterior
    let last = performance.now(); const t0 = last; let mid = null, movF = 0, rep = 0, lastSig = null;
    const sig = () => { let s = 0, any = false; for (const u of cb2.units) if (!u.dead && u.mt < .3) { const [x, y] = unitXY(u); s += x * 1.7 + y; any = true; } for (const f of cb2.fx) { s += f.t; any = true; } return any ? s : null; };
    await new Promise(res => { const f = () => { const n = performance.now(); dts.push(n - last); last = n; maxFx = Math.max(maxFx, (cb2.fx || []).length);
      const sg = sig(); if (sg != null) { movF++; if (sg === lastSig) rep++; } lastSig = sg; if (!mid && n - t0 > secs * 500 && B3.debugInfo) mid = B3.debugInfo();
      if (dts.length % 30 === 0) { const i = B3.info; if (i) { for (const k in info) info[k] += i[k]; infoN++; } }
      if (n - t0 < secs * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    window.draw = origDraw; po.disconnect(); window.removeEventListener('error', onErr);
    dts.shift();
    const avg = x => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);
    const out = { escenario: name, unidades: cb2.units.length, modelos: models, fps: r2(1000 / avg(dts)), frameP50: r2(pct(dts, .5)), frameP95: r2(pct(dts, .95)), frameP99: r2(pct(dts, .99)),
      drawMsMedio: r2(avg(drawMs)), drawMsP95: r2(pct(drawMs, .95)), drawMsMax: r2(Math.max(...drawMs)), drawMsPrimeros: drawMs.slice(0, 4).map(r2), largasEn: long.map(r2), tareasLargas: long.length, tareaLargaMax: r2(Math.max(0, ...long)), errores: errs, efectosMax: maxFx, fotogramasRepetidosPct: r2(rep / Math.max(1, movF) * 100), combateTerminado: cb2.done };
    for (const k in info) out['3d_' + k] = r2(info[k] / Math.max(1, infoN));
    out.escena = mid; out.lentos = B3.slow || [];
    G.phase = 'planning'; G.combat = null; G.resolving = false;
    return out;
  }
  async function all(secs = 8) { const res = []; for (const n of ['A', 'B', 'C', 'D']) res.push(await run(n, secs)); return res; }
  function gpu() { try { const c = document.createElement('canvas').getContext('webgl'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'desconocida'; } catch (e) { return 'desconocida'; } }
  window.PTBench = { run, all, gpu, quality: () => B3.quality };
})();
