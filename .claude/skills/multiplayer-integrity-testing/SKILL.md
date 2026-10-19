---
name: multiplayer-integrity-testing
description: Comprueba la integridad del multijugador de Poké Tactics (servidor autoritativo, validación de acciones, sincronización cliente-servidor, duplicación de oro y unidades, reconexiones, combates consistentes) y evita regresiones con las pruebas existentes.
when_to_use: Al tocar server.js, auth.js, la sección [NET] o applyAct de public/game.js, o al investigar trampas, desincronizaciones o errores de red.
---

# Integridad del multijugador y regresiones

## Arquitectura verificada (comprobada en el código el 2026-10-19)
- **El servidor es autoritativo.** `server.js` crea un motor por sala con `makeGame()` (un `vm` con `public/game.js`) y lo avanza con `serverTick` cada 50 ms. Los clientes **solo** envían `act`, que pasa por `serverAct(peer,a)` → `applyAct(p,a)`.
- Estado que manda el servidor:
  - `pub`: a la sala;
  - `priv`: a cada jugador; solo se envía si cambia, con un reenvío forzado cada 2 s;
  - `cmb`: su combate;
  - `cmbs`: todos los combates;
  - `car`: el carrusel.
- Los clientes son espejos (`G.mirror`, `NET.mode==='client'`): `applyPub`, `applyPriv`, `applyCmb` y `applyCar`.
- Combates: el servidor fija la semilla y los equipos y los envía. El cliente los reproduce de forma determinista; el resultado que cuenta es el del servidor (`resolveRound`).
- Protecciones existentes:
  - límite de unos 40 mensajes por segundo por socket;
  - `maxHttpBufferSize` de 16 KB;
  - Socket.io exige sesión (`auth.socketGuard`) y mismo origen;
  - el nombre y el entrenador salen de la cuenta (`seatFor`);
  - `normLoc` e `idx` validan índices, y `applyAct` comprueba la fase.
- Desconexión: el asiento queda como desconectado y **un bot sigue jugando** (`serverLeave`). **No hay reconexión al mismo asiento**: es una limitación conocida; no la documentes como hecha.

## Lista de comprobación al cambiar algo del multijugador
1. ¿Cada acción nueva está en `applyAct` con validación de fase, índices, oro y espacio? ¿Responde `{ok:false}` sin efectos secundarios cuando no es válida?
2. Duplicación: ¿se puede vender o mover en combate, comprar con el banquillo lleno, elegir dos veces el aumento (`augPicked`) o el Pokémon del carrusel (`av.done`), o sacar más objetos de los que hay? Todo debe devolver `{ok:false}`.
3. ¿Los datos nuevos que viajan al cliente están en `makePub`/`makePriv` y se **sanean** en `applyPub`/`applyPriv` (tipos, longitudes, claves que existen en `DEF`/`ITEMS`)?
4. Si un cambio afecta al combate, ¿el cliente y el servidor calculan lo mismo? Prueba con la misma semilla con `visual:true` y `visual:false`, y comprueba que `spectate()` muestra el mismo ganador.
5. ¿Las estadísticas se apuntan una sola vez por asiento (`recordPlaces`, `seat.recorded`)?
6. ¿`priv` sigue por debajo de unos 3,9 KB? (`makePriv` recorta el registro).

## Pruebas existentes (ejecútalas siempre)
```bash
npm test             # test/smoke.js: cuentas, seguridad, emparejamiento, 2 bots-cliente por Socket.io durante 12 rondas
npm run test:e2e     # Playwright: incluye tests/e2e/multijugador.spec.js (2 navegadores, sala, código, validación en servidor)
```
- Para probar a mano: `npm start` y dos ventanas (una en incógnito) con cuentas distintas. El MCP `playwright` del proyecto (`.mcp.json`) abre contextos aislados.
- Añade regresiones nuevas en `test/smoke.js` (rápidas, sin navegador, con `socket.io-client`) o en `tests/e2e/multijugador.spec.js` (con interfaz).

## Ejemplo de prueba de antiduplicación (Socket.io)
```js
// En test/smoke.js, con un jugador S ya en partida y su estado privado st.priv
S.emit('act', { t: 'sell', loc: { i: 0 } });          // una venta legítima
await sleep(400); const g1 = st.priv.g;
for (let i = 0; i < 20; i++) S.emit('act', { t: 'sell', loc: { i: 0 } }); // repetir sobre la casilla ya vacía
await sleep(500);
assert.strictEqual(st.priv.g, g1, 'vender una casilla vacía no da oro');
```

## Criterios de aceptación
- `npm test` y `npm run test:e2e` pasan.
- Cada acción nueva tiene al menos una prueba de entrada inválida.
- Nada de lo que manda el cliente se usa sin validar.
- Ningún secreto ni dato de otra cuenta llega a un cliente: `lobbyState` y `publicSeats` no deben incluir el `uid`.
