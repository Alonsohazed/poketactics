// Utilidades compartidas por las pruebas E2E.
// El juego es un script clásico: sus variables globales (G, NET, doAct, geo…) se pueden leer con page.evaluate.
const base = require('@playwright/test');

// Cada prueba vigila errores de JavaScript y peticiones fallidas al propio servidor
const test = base.test.extend({
  problems: [async ({ page, baseURL }, use) => {
    const problems = [];
    page.on('pageerror', e => problems.push(`Error JS: ${e.message}`));
    page.on('requestfailed', r => { if (r.url().startsWith(baseURL)) problems.push(`Petición fallida: ${r.url()} (${r.failure() && r.failure().errorText})`); });
    page.on('response', r => {
      const u = r.url();
      if (!u.startsWith(baseURL) || r.status() < 400) return;
      if (r.status() === 401 && u.endsWith('/api/me')) return; // normal antes de iniciar sesión
      if (r.request().method() === 'POST' && /\/api\/(login|register)$/.test(u)) return; // errores de formulario esperados en algunas pruebas
      problems.push(`HTTP ${r.status()} en ${u}`);
    });
    await use(problems);
    base.expect(problems, 'sin errores de JS ni peticiones fallidas').toEqual([]);
  }, { auto: true }],
});
const { expect } = base;

let seq = 0;
const uniqueUser = () => `e2e_${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 16);
const PASS = 'clave-prueba-123';

async function register(page, user = uniqueUser(), trainer = 'misty') {
  await page.goto('/');
  await expect(page.locator('#auth')).toBeVisible();
  await page.locator('#tabReg').click();
  await page.locator('#auUser').fill(user);
  await page.locator('#auPass').fill(PASS);
  await page.locator('#auPass2').fill(PASS);
  await page.locator('#auGo').click();
  await expect(page.locator('#trGrid')).toBeVisible();
  await page.locator(`.trOpt[data-k="${trainer}"]`).click();
  await page.locator('#trOk').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#modal')).toBeHidden();
  return user;
}

// Empieza una partida contra bots y deja la planificación sin límite de tiempo para que nada avance solo
async function startSolo(page, diff = 'normal') {
  await page.locator('#playBtn').click();
  await page.locator(`.choice[data-d="${diff}"]`).click();
  await expect(page.locator('#menu')).toBeHidden();
  await pickTac(page);
  await page.evaluate(() => { G.timer = Infinity; });
  await expect(page.locator('#cards .card')).toHaveCount(5);
}

// Al empezar la partida se elige la minileyenda (se recuerda en el navegador)
async function pickTac(page) {
  const opt = page.locator('.tacOpt').first();
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(page.locator('#modal')).toBeHidden();
}

// Convierte coordenadas del tablero ("píxeles de tablero" 2D) a coordenadas de la página.
// Con el tablero 3D activo, scr() las proyecta con la cámara; sin 3D devuelve las mismas.
async function canvasPoint(page, fnBody, ...args) {
  return page.evaluate(([body, a]) => {
    const [x, y] = new Function('...a', body)(...a);
    const [sx, sy] = scr(x, y);
    const r = cv.getBoundingClientRect();
    return { x: r.left + sx * r.width / view.W, y: r.top + sy * r.height / view.H };
  }, [fnBody, args]);
}
const benchPoint = (page, i) => canvasPoint(page, 'return benchXY(a[0]);', i);
const cellPoint = (page, c, r) => canvasPoint(page, 'return cellXY(a[0], a[1]);', c, r);

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

// Avanza la partida en solitario hasta una ronda concreta (índice de ROUNDS) sin jugar las anteriores
async function jumpToRound(page, idx) {
  await page.evaluate(i => { closeModal(); G.roundIdx = i - 1; G.phase = 'idle'; nextRound(); G.timer = Infinity; renderUI(); }, idx);
}

module.exports = { test, expect, register, startSolo, pickTac, uniqueUser, PASS, benchPoint, cellPoint, drag, jumpToRound };
