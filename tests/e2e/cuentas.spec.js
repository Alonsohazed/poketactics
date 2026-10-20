// Carga inicial, acceso y cuentas
const { test, expect, register, uniqueUser, PASS } = require('./helpers');

test('la página carga en la pantalla de acceso sin errores @rapido', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Poké Tactics');
  await expect(page.locator('#auth .logo')).toBeVisible();
  await expect(page.locator('#auGo')).toHaveText('Entrar');
  await expect(page.locator('#auPass2Wrap')).toBeHidden(); // solo aparece al crear cuenta
  await expect(page.locator('#menuScene')).toBeVisible(); // de fondo, el escenario pixel del menú (el 3D queda oculto)
  await expect.poll(() => page.evaluate(() => window.MenuScene && MenuScene.on)).toBe(true);
});

test('el formulario valida antes de enviar', async ({ page }) => {
  await page.goto('/');
  await page.locator('#tabReg').click();
  await page.locator('#auUser').fill('ab');
  await page.locator('#auPass').fill(PASS);
  await page.locator('#auPass2').fill(PASS);
  await page.locator('#auGo').click();
  await expect(page.locator('#auErr')).toContainText('de 3 a 16');
  await page.locator('#auUser').fill(uniqueUser());
  await page.locator('#auPass2').fill('otra-clave');
  await page.locator('#auGo').click();
  await expect(page.locator('#auErr')).toContainText('no coinciden');
});

test('registro, elección de minileyenda, cierre de sesión y vuelta a entrar @rapido', async ({ page }) => {
  const user = await register(page, undefined, 'bulbasaur');
  await expect(page.locator('#menuWho .tname')).toHaveText(user);
  await expect(page.locator('#menuWho .tfrom')).toContainText('Bulbasaur');
  // cerrar sesión desde Opciones
  await page.locator('#optBtn').click();
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#auth')).toBeVisible();
  // contraseña incorrecta
  await page.locator('#tabLogin').click();
  await page.locator('#auUser').fill(user);
  await page.locator('#auPass').fill('incorrecta');
  await page.locator('#auGo').click();
  await expect(page.locator('#auErr')).toContainText('incorrectos');
  // contraseña correcta: conserva el entrenador
  await page.locator('#auPass').fill(PASS);
  await page.locator('#auGo').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menuWho .tfrom')).toContainText('Bulbasaur');
});

test('la sesión sobrevive a recargar la página', async ({ page }) => {
  const user = await register(page);
  await page.reload();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menuWho .tname')).toHaveText(user);
});

test('los menús secundarios abren y cierran', async ({ page }) => {
  await register(page);
  for (const [btn, title] of [['#dexMenuBtn', 'Pokédex'], ['#recMenuBtn', 'Objetos'], ['#howBtn', 'Cómo jugar'], ['#optBtn', 'Opciones']]) {
    await page.locator(btn).click();
    await expect(page.locator('#mbox h1')).toHaveText(title);
    await page.locator('#mClose').click();
    await expect(page.locator('#modal')).toBeHidden();
  }
  // la tabla de objetos muestra las 8 insignias con su medalla
  await page.locator('#recMenuBtn').click();
  await expect(page.locator('#mbox .ii.emb')).toHaveCount(16);
});

test('la minileyenda se cambia en el menú y queda guardada en la cuenta', async ({ page }) => {
  await register(page, undefined, 'bulbasaur');
  await page.locator('#pickTr').click();
  await page.locator('.tacOpt[data-k="squirtle"]').click();
  await page.locator('#tacOk').click();
  await expect(page.locator('#menuWho .tfrom')).toContainText('Squirtle');
  await page.reload();
  await expect(page.locator('#menuWho .tfrom')).toContainText('Squirtle');
});
