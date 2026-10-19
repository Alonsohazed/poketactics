---
name: tft-augments-traits-designer
description: Diseña aumentos (Plata, Oro y Prismático) y sinergias originales para Poké Tactics, inspirados en Pokémon y en TFT (reroll, Fast 9, rachas, economía, emblemas, composiciones especializadas, apuestas de alto riesgo), con ficha completa, plan de implementación, pruebas y evaluación de balance.
when_to_use: Cuando se pidan aumentos, sinergias o rasgos nuevos, rebalancear los existentes o revisar si un diseño es abusable.
---

# Diseñador de aumentos y sinergias

## Lo que ya existe (no lo dupliques)
- **Dónde**: `public/augments.js`, un catálogo declarativo que se carga antes que `game.js`. Tiene 80 aumentos: 25 de Plata (S), 37 de Oro (G) y 18 Prismáticos (P).
- **Categorías** (`AUG_CAT`): `classic, econ, reroll, slow, fast, streak, emblem, trait, evo, carry, risk, chaos, rules, quest, hybrid`. **Ya existe** un "Call to Chaos": `llamada_caos` (Oro) y `caos_absoluto` (Prismático).
- **Formato** de cada entrada: `AG({id, tier, cat, tags, w (peso de aparición), ex (grupo excluyente), req(p), name, icon, desc, on:{evento:c=>…}, combat(units,prm,cb,side), snap(c), ui(c)})`.
- **Eventos** que lanza `game.js` con `augFire(p,evento,datos)`: `select, roundStart, combatStart, win, lose, roundEnd, buy, sell, reroll, gain, starUp, levelUp, kills, survive, damaged, pick`.
- **Contexto** `c` que recibe cada efecto:
  - `c.p` (jugador) y `c.st` (estado persistente del aumento, en `p.augSt`);
  - `c.gold(n, tope)`, `c.xp`, `c.item`, `c.comp`, `c.full`, `c.unit(coste)`;
  - `c.once(clave)`, `c.offer(título, desc, opciones)` (elección del jugador, respondida con la acción `pick`) y `c.say`.
- **Combate**: `snap(c)` calcula los parámetros que viajan en `teamSnap().ag` y `combat(units,prm,cb,side)` los aplica de forma **determinista** (`augSnap`/`augCombat`).
- **Ofertas**: `augmentChoices` da 3 opciones que respetan `ex` y `req` y no repiten categoría, más **un cambio** (`augrr`), en las rondas 2-1, 3-2 y 4-2. La rareza la sortea `rollAugTiers()` y es la misma para todos.
- Hay protección contra cadenas de eventos (`AUG_MAX_DEPTH=3`) y topes de oro por aumento (`c.gold(n, tope)`).
- **Pruebas**: `test/augments.js` (`npm run test:aug`, unas 2.300 comprobaciones). Antes de proponer, lista los ids con `grep -o "AG({id:'[a-z0-9_]*'" public/augments.js`.

## Plantilla obligatoria para cada propuesta
```
### <Nombre> (<Plata|Oro|Prismático>) <icono>
- Fantasía: qué estrategia habilita (reroll, Fast 9, racha, economía, emblema, composición, alto riesgo…).
- Descripción para el jugador (español, ≤ 140 caracteres, números exactos).
- Activación: al elegirlo / cada ronda / al ganar / al perder / al llegar a X / al tener N de una sinergia.
- Efecto y duración: valores concretos; cuánto dura (instantáneo, resto de la partida, N rondas).
- Interacciones: con sinergias, objetos, insignias, Eevee, legendarios y otros aumentos (lista los que lo potencian o lo rompen).
- Límites y antiabuso: topes, qué pasa con el banquillo o el inventario lleno, si se apila consigo mismo, si hay que excluirlo con otro.
- Implementación: entrada `AG({...})` con sus eventos (`on`), `snap`/`combat` si actúa en combate, `ui` si tiene progreso, `ex`/`req` si se excluye o tiene requisitos, y si necesita un evento nuevo en `game.js`.
- Pruebas: casos concretos (entrada → resultado esperado) para `test/smoke.js` o `tests/e2e`.
- Balance: impacto estimado y cómo medirlo con `autochess-balance-simulator` (modo `games` para el puesto medio y modo `comp` para la fuerza en combate). Indica si es una estimación o una medición.
```

## Guías de diseño
- **Plata**: un efecto pequeño y seguro, sin cambiar de estrategia. **Oro**: empuja una estrategia. **Prismático**: transforma la partida o es una apuesta grande, nunca solo números mayores.
- Patrones de inspiración (genera mecánicas originales con temática Pokémon, no copies TFT):
  - **Reroll**: tiendas gratis condicionadas, Pokémon de 1-2 de coste con bonus a 3★, recompensas al combinar.
  - **Fast 9**: EXP con coste en vida, interés o tienda; descuento de EXP a partir de nivel 7.
  - **Rachas**: botín que se acumula y se cobra al romper la racha, oro por racha de derrotas con un tope.
  - **Emblemas**: insignia aleatoria, +1 a una sinergia elegida, sinergia que cuenta doble con 3★.
  - **Alto riesgo, estilo "Call to Chaos"**: recompensa aleatoria de valor medio alto pero varianza alta; o perder vida de entrenador a cambio de poder inmediato. Pon siempre un suelo para que no arruine la partida.
  - **Temática Pokémon**: tipos (eficacias), clima (Lluvia, Sol), evoluciones, Poké Balls, Centro Pokémon, MT y MO, Pokémon iniciales.
- Para efectos de combate, usa el RNG del combate (`cb.rng`) y nunca `Math.random()`.
- Un aumento que da unidades u objetos debe respetar `giveUnitTo` (con el banquillo lleno las convierte en oro) y `giveItem` (con el inventario lleno, 2 de oro).

## Cómo implementarlo
1. Añade un `AG({...})` en `public/augments.js`, en el bloque de su categoría, con `desc` exacta y `ui` si tiene progreso. **No hace falta tocar el motor de `game.js`** salvo que necesites un evento nuevo (lánzalo con `augFire` en el sitio adecuado).
2. Si afecta al combate: `snap` (solo datos serializables y pequeños) + `combat` (usa `cb.rng`, nunca `Math.random()`). Para efectos retardados en combate, `later2(cb,seg,fn)`.
3. Para elecciones del jugador, usa `c.offer(...)` y el evento `pick`. Funciona igual en solitario y en multijugador (acción `pick` validada en `resolvePick`).
4. Los bots también pueden recibirlo: comprueba que su efecto no rompe a un bot (`p.isBot`).
5. Añade casos a `test/augments.js` y ejecuta `npm run test:all`. Mide con `node .claude/skills/autochess-balance-simulator/scripts/sim.js games --n 60`.

## Sinergias nuevas
Usa la misma ficha, más: breakpoints (`bp`), los textos por nivel (`lv`), su alcance (`scope`), qué Pokémon la llevan (con al menos los Pokémon necesarios para el breakpoint máximo, contando insignias) y su efecto en `applyTraits`. Si tiene insignia, asígnale una medalla en `BADGE_OF` (sprites `sprites/badges/N.png` de PokeAPI: 1-8 Kanto, 9-16 Johto, 17-24 Hoenn…).

## Criterios de aceptación
- Cada propuesta rellena **todos** los campos de la plantilla.
- Ninguna duplica un aumento existente.
- Al implementar, las pruebas pasan y el resultado del simulador se presenta como **simulación**, no como datos de partidas reales.
