---
name: autochess-systems-architect
description: Arquitectura real de los sistemas de juego de Poké Tactics (combate automático, estadísticas, escalado, objetivos, daño, curación, escudos, estados, sinergias, economía, EXP, rondas, objetos). Úsala antes de implementar o cambiar cualquier mecánica en public/game.js.
when_to_use: Al añadir o modificar combate, habilidades, sinergias, economía, tienda, niveles, rondas, carrusel u objetos de Poké Tactics.
---

# Arquitecto de sistemas de autochess (Poké Tactics)

La lógica vive en dos scripts que se ejecutan **en el navegador y en el servidor** (en el servidor, concatenados en un `vm` por sala, primero `augments.js` y después `game.js`):
- `public/game.js`: el juego. Busca las secciones por su cabecera `/* ==== [NOMBRE] ==== */`.
- `public/augments.js`: el catálogo de aumentos y su motor de eventos (ver la skill `tft-augments-traits-designer`).

`public/board3d.js` es **solo presentación**: un módulo ES con three.js que pinta el tablero 3D a partir de lo que le pasa `draw()` (`B3.render`). Nunca pongas lógica de juego ahí.

## Reglas que no se rompen
1. **El combate es determinista.** Dentro de `[COMBAT]` usa siempre `cb.rng()`, nunca `Math.random()`. `Math.random()` solo se permite en efectos visuales (`fx`, `fxText`), que no cambian el resultado. Si algo nuevo cambia el resultado y usa `Math.random()`, el combate que ve cada cliente será distinto del que resuelve el servidor, y el modo espectador (`spectate()`) mostrará otra cosa.
2. **Fuera de `[UI]` no se usa `document` ni `window`**, porque el servidor ejecuta este mismo archivo sin DOM (`HEADLESS`).
3. Todo lo que afecte al combate tiene que viajar en `teamSnap()` y leerse al crear el combate:
   - de `p.mods` viajan `hpPct, adPct, ap, asPct, def, mr, allFocus, legend, extraTrait`, leídos en `snapPlayer()`;
   - los efectos de combate de los aumentos viajan en `ag: augSnap(p)` y se aplican con `combat()`/`augCombat`.
   Una mejora que no esté ahí **no se aplica** en el combate real.
4. Lo que ocurre más tarde dentro de un combate se programa con `later2(cb,segundos,fn)` (cola `cb.pend`). **Nunca** uses `setTimeout` en la lógica de combate.
5. Toda acción de un jugador pasa por `applyAct(p,a)`, que valida la fase, los índices y el oro. Nunca confíes en datos del cliente. Acciones actuales:
   - tienda y tablero: `buy, reroll, xp, lock, sell, move, ready`;
   - objetos: `item`, `icomb` (combinar dos componentes en el inventario) y `rmitem` (desactivada: los objetos se quitan con el 🧲 Imán Removedor);
   - aumentos: `aug, augrr`, más `pick` (responder a las elecciones que ofrece un aumento con `augOffer`);
   - otras: `tac` (elegir minileyenda), `orb` (abrir un orbe de botín) y `car` (carrusel).

## Mapa del combate (`[COMBAT]`)
- Tick fijo `DT=0.05` s. `stepCombat(cb)` avanza un tick. `simulate(cb)` llega hasta el final (máx. 40 s: luego empate).
- Rejilla de 7×8 hexágonos, con filas impares desplazadas. `hexDist`, `neighbors`, `toGrid(side,c,r)` (el lado 0 ocupa las filas 4-7 y el lado 1, espejado, las filas 0-3).
- Unidad: `baseCombatUnit` (stats de `ROLE[d.role]` × `HPM/ADM[coste-1]` × `STAR[estrellas-1]` = 1 / 1,8 / 3,24) → `makeCombatUnit` (stack permanente, `applyTraits`, mods del jugador, objetos con `applyStats` y `sp`). La velocidad de ataque está limitada a 3.
- Objetivo: `nearestEnemy` (el más cercano, con un poco de ruido de `cb.rng`, e ignorando a los que están en sigilo). Movimiento: un paso cada 0,35 s (`nextStep`). Los asesinos saltan al enemigo más lejano al empezar (`teleportNear`).
- Ataque (`attack`): crítico con `critC` (base 25 %) × `critM` (base 1,4) y **+10 de maná por ataque** (+`manaPerAtk`).
- Daño (`dealDamage`):
  - físico × 100/(100+df); mágico × 100/(100+mr); `true` sin reducción;
  - `dmgBonus`, más `bully` contra objetivos por debajo del 50 %;
  - reducción `dr` con un máximo del 75 %;
  - el escudo absorbe primero y la esquiva solo vale contra el daño físico;
  - el objetivo gana maná `min(daño×0,04, 12)`;
  - robo de vida `omni`.
- Habilidad: al llegar a `maxMana` se ejecuta `castAbility(cb,u,u.ab)`. Su poder es `abilPower = ABIL_BASE[coste-1] × ABIL_STAR[estrellas-1] × (1+ap/100)`.
  - Hay 39 tipos en `KIND_NAME`; su texto está en `abDesc`.
  - Clásicos: `bolt, burn, blast, nova, line, chain, multi, dash, execute, meteor, shield, taunt, heal, teamShield…`.
  - Con posición y tiempo: `cone, wave, strike, zone, knock/pull` (con `shove()`), `seed, poison, mark, spin, slam`.
  - Los efectos visuales llevan `el` (elemento) y `p.v` (estilo) para que `board3d.js` los pinte; no cambian el resultado.
- Estados: `stun` (y `sleepT`), `burns` (daño `true` por segundo), `shield`/`shieldT`, `stealth`, `tdr`, `reflT`.
- Al perder, el jugador recibe `STAGE_DMG[fase]` + `survivors()` (los Pokémon de 3★ cuentan doble). Ver `resolveRound`.

## Sinergias (`TRAITS` en `[DATA]` y `applyTraits` en `[COMBAT]`)
- Cada sinergia: `T(icono, color, breakpoints, alcance, resumen, descripciones)`. El efecto real está en `applyTraits` con `tv(t,[valores por nivel])`.
- Se cuentan **Pokémon distintos** del tablero, más insignias y `extraTrait` (`traitCountsOf`). El nivel activo es `traitTiers`.
- Al añadir una sinergia nueva, actualiza `TRAITS` (texto), `applyTraits` (efecto), las unidades que la llevan y, si tiene insignia, `EMBLEM_OF` y `BADGE_OF`.

## Economía y progresión (`[CORE]` y `[FLOW]`)
- Ingreso por ronda (`income`):
  - base `BASE_INCOME=[0,2,3,4]` en las primeras rondas, luego 5;
  - interés `floor(oro/10)`, hasta `mods.maxInterest` (5);
  - racha de 2-3 da +1, de 4 da +2 y de 5 o más da +3 (con los multiplicadores de los aumentos).
- EXP: comprarla cuesta 4 de oro y da 4 EXP; además hay EXP pasiva por ronda (`PASSIVE_XP`, luego 2). La tabla de niveles es `XP_NEED` y el nivel máximo es 10. Tamaño del tablero: `maxBoard` = nivel + `boardBonus` + Medallas Maestras.
- Tienda: 5 huecos, refrescar cuesta 2. Probabilidades por coste según el nivel en `SHOP_ODDS`. Hay un pool compartido (`POOL_SIZE=[30,25,18,10,9]` copias por coste); cuando un Pokémon llega a 3★ deja de salir.
- Fusión: 3 copias suben 1 estrella (`combine`). Valor de venta en `sellValue`. En combate no se toca el tablero.
- Rondas (`buildRounds`):
  - fase 1: tres rondas PvE;
  - fases 2-9: siete rondas cada una (la n=4 es carrusel, la n=7 es PvE y el resto PvP);
  - aumentos en 2-1, 3-2 y 4-2.
- Emparejamiento: `makeFights` y `pairCost`, al estilo TFT. Con número impar de jugadores hay un combate contra un "fantasma".
- Botín PvE: orbes de `[LOOT]` (`ORBS`, `pveLoot`). El jugador los abre al recogerlos con su **minileyenda** (`TACS`: Charmander, Bulbasaur o Squirtle, que evolucionan a nivel 6 y se mueven con clic derecho) mediante la acción `orb` → `openPlayerOrb`.

## Objetos (`[ITEMS]`)
- Hay 75 objetos en total: 8 componentes (`BASIC`) más la `medal`, 37 completos, 28 insignias y el `magnet` (Imán Removedor).
  - Las combinaciones están en `FULL` (fila `[a,b,id,nombre,icono,desc,stats,sp]`).
  - Algunas insignias se fabrican con componente + `medal`; `master` es medal + medal.
  - Para ver cómo se consigue cada insignia, consulta `ITEMS` y `RECIPE`.
- Cada unidad lleva como máximo 3 objetos y el inventario admite 10. `addItemToUnit` combina dos componentes en el mismo Pokémon, y `combineBench` (acción `icomb`) los combina en el inventario.
- Los efectos especiales van en `sp` y se leen en el combate (`u.sp.xxx`).

## Cómo implementar una mecánica nueva (pasos)
1. Datos en `[DATA]`, `[ITEMS]` o `[AUGMENTS]`. Efecto en `[COMBAT]` (determinista) o en `p.mods` (con `teamSnap`/`snapPlayer` si afecta al combate).
2. Si el jugador debe verlo: el texto de la ficha (`abDesc`, `tipHTML`) y el panel correspondiente de `[UI]`.
3. Si es una acción nueva: un caso en `applyAct` con validación (fase, índices, oro) y una llamada en la interfaz con `doAct`.
4. Si tiene un efecto visual: emite `fx` con su elemento y estilo y, si hace falta, añade su representación en `board3d.js` (sin tocar la simulación).
5. Verificación: `npm run check` y `npm run test:all` (humo, aumentos y E2E). Para comprobar el balance, usa la skill `autochess-balance-simulator`.

## Criterios de aceptación
- `npm test` y `npm run test:e2e` pasan.
- El mismo combate (misma semilla) da el mismo ganador con `visual:true` y con `visual:false`.
- Funciona igual en solitario y en multijugador, y ningún cliente puede provocar el efecto saltándose `applyAct`.
- Los textos que ve el jugador están en español y describen el efecto real.
