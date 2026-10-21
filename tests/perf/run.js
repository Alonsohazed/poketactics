/* Banco de rendimiento reproducible: node tests/perf/run.js [etiqueta] [segundos]
   Levanta el servidor en el puerto 3200 con una base de datos temporal (nunca toca Neon), abre Microsoft Edge
   con ventana (GPU real; sin frenar fotogramas en segundo plano), crea una cuenta de prueba, empieza una partida
   en solitario y mide los escenarios fijos de bench-page.js (A-D) y la carga en frío (E).
   Guarda el resultado en tests/perf/resultados-<etiqueta>.json. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const PORT = 3200, BASE = `http://localhost:${PORT}`, Q = process.env.PERF_Q || '', label = process.argv[2] || 'actual', secs = +(process.argv[3] || 8);
const ARGS = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--ignore-gpu-blocklist'];

async function waitHealth() { for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/health'); if (r.ok) return; } catch (e) {} await new Promise(r => setTimeout(r, 250)); } throw new Error('el servidor no arranca'); }
async function login(page) {
  const user = ('perf_' + Date.now().toString(36)).slice(0, 16), pass = 'clave-prueba-123';
  await page.goto(BASE + '/' + Q); await page.locator('#tabReg').click(); // PERF_Q='?arena=gif' mide el escenario plano de prueba
  await page.locator('#auUser').fill(user); await page.locator('#auPass').fill(pass); await page.locator('#auPass2').fill(pass); await page.locator('#auGo').click();
  await page.locator('.tacOpt[data-k="bulbasaur"]').click(); await page.locator('#tacOk').click(); await page.locator('#menu').waitFor({ state: 'visible' });
}
async function solo(page) {
  await page.locator('#playBtn').click(); await page.locator('#practiceBtn').click();
  await page.locator('#menu').waitFor({ state: 'hidden' }); await page.evaluate(() => { G.timer = Infinity; });
  await page.waitForFunction(() => window.B3 && B3.ready);
}
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(PORT), DATABASE_URL: '', DB_FILE: path.join(os.tmpdir(), `pt-perf-${process.pid}.json`) }, stdio: 'ignore' });
  try {
    await waitHealth();
    const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ARGS });
    const out = { etiqueta: label, fecha: new Date().toISOString(), segundos: secs, escenarios: [] };
    // E: carga en frío (contexto nuevo, sin caché): primer contenido, tablero 3D listo y primer Pokémon listo
    { const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage(); await login(page);
      const t0 = Date.now(); await page.reload(); await page.locator('#menu').waitFor({ state: 'visible' });
      const nav = await page.evaluate(() => { const p = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint'); const n = performance.getEntriesByType('navigation')[0]; return { fcp: p ? Math.round(p.startTime) : null, domInteractive: Math.round(n.domInteractive), load: Math.round(n.loadEventEnd) }; });
      await page.waitForFunction(() => window.B3 && B3.ready); const b3 = Date.now() - t0;
      const models = await page.evaluate(async () => { const t = performance.now(), dex = [4, 7, 25, 66, 92, 130], res = {}; B3.preload(dex);
        while (performance.now() - t < 30000 && dex.some(d => !['ok', 'fail'].includes(B3.modelStatus(d)))) { for (const d of dex) if (!res[d] && B3.modelStatus(d) === 'ok') res[d] = Math.round(performance.now() - t); await new Promise(r => setTimeout(r, 20)); }
        for (const d of dex) if (!res[d]) res[d] = B3.modelStatus(d) === 'ok' ? Math.round(performance.now() - t) : null; return res; });
      const vals = Object.values(models).filter(x => x != null);
      out.carga = { primerContenidoMs: nav.fcp, interactivoMs: nav.domInteractive, cargaMs: nav.load, tablero3DListoMs: b3, primerPokemonMs: Math.min(...vals), seisPokemonMs: Math.max(...vals), porModelo: models };
      await ctx.close(); }
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await login(page); await solo(page); await page.addScriptTag({ path: path.join(__dirname, 'bench-page.js') });
    out.gpu = await page.evaluate(() => PTBench.gpu()); await page.evaluate(q => B3.setQuality(q), +(process.env.Q || 2));
    for (const n of ['A', 'B', 'C', 'D']) { const r = await page.evaluate(([n, s]) => PTBench.run(n, s), [n, secs]); r.calidad = await page.evaluate(() => B3.quality); out.escenarios.push(r); console.log(JSON.stringify(r)); }
    out.erroresConsola = errors.slice(0, 20);
    fs.writeFileSync(path.join(__dirname, `resultados-${label}.json`), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ carga: out.carga, gpu: out.gpu, errores: errors.length }));
    await browser.close();
  } finally { srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
