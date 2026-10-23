// Amigos: dos navegadores se agregan por nombre, aceptan desde el panel, ven el estado del otro en directo y abren su perfil
const { test, expect, register } = require('./helpers');

test('amigos: solicitud, aceptar, estado en directo, perfil y eliminar', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errors = [];
  for (const p of [A, B]) p.on('pageerror', e => errors.push(e.message));
  const userA = await register(A, undefined, 'charmander');
  const userB = await register(B, undefined, 'squirtle');

  // A envía la solicitud por nombre exacto; a un nombre inventado se responde igual
  await A.locator('#frBtn').click();
  await expect(A.locator('#frPanel')).toBeVisible();
  await A.locator('#frName').fill('NadieNunca_1');
  await A.locator('#frAdd button').click();
  await expect(A.locator('.frMsg.ok')).toHaveText('Solicitud enviada a NadieNunca_1');
  await A.locator('#frName').fill(userB);
  await A.locator('#frAdd button').click();
  await expect(A.locator('.frMsg.ok')).toHaveText(`Solicitud enviada a ${userB}`);
  await expect(A.locator('.frRow.k-out')).toHaveCount(2);

  // B la recibe en directo (aviso en el botón) y la acepta
  await expect(B.locator('#frBtn .frBadge')).toHaveText('1');
  await B.locator('#frBtn').click();
  await expect(B.locator('.frRow.k-in')).toContainText(userA);
  await B.locator(`.frRow.k-in [data-op="accept"]`).click();
  await expect(B.locator('.frRow[data-pick]')).toContainText(userA);

  // A ve a B en línea sin recargar
  await expect(A.locator(`.frRow[data-pick="${userB}"] .frSt`)).toHaveText('En línea');
  await expect(A.locator('.frRow.k-out')).toHaveCount(1); // queda la del nombre inventado

  // perfil del amigo desde el panel
  await A.locator(`.frRow[data-pick="${userB}"]`).click();
  await A.locator('.frActs [data-op="profile"]').click();
  await expect(A.locator('.pfName')).toHaveText(userB);
  await expect(A.locator('#pfRemove')).toBeVisible();
  await A.locator('#mClose').click();

  // B se desconecta: A lo ve desconectado (grupo plegado, con su contador)
  await ctxB.close();
  await expect(A.locator('.frGrpH[data-fold="off"] b')).toHaveText('1', { timeout: 15_000 });
  await expect(A.locator('#frBtn .frOn')).toHaveText('0');

  // eliminar con confirmación
  await A.locator('.frGrpH[data-fold="off"]').click();
  await A.locator(`.frRow[data-pick="${userB}"]`).click();
  const rm = A.locator('.frActs [data-op="remove"]');
  await rm.click(); await expect(rm).toHaveText('¿Seguro?');
  await rm.click();
  await expect(A.locator('.frRow[data-pick]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctxA.close();
});
