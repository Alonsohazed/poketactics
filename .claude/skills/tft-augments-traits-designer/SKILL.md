---
name: tft-augments-traits-designer
description: Diseña aumentos (Plata, Oro y Prismático) y sinergias originales para Poké Tactics, inspirados en Pokémon y en TFT (reroll, Fast 9, rachas, economía, emblemas, composiciones especializadas, apuestas de alto riesgo), con ficha completa, plan de implementación, pruebas y evaluación de balance.
when_to_use: Cuando se pidan aumentos, sinergias o rasgos nuevos, rebalancear los existentes o revisar si un diseño es abusable.
---

# Diseñador de aumentos y sinergias

## Lo que ya existe (no lo dupliques)
- `AUGS` en la sección `[AUGMENTS]` de `public/game.js` contiene 37 aumentos: `A(id, rareza 'S'|'G'|'P', nombre, icono, descripción, apply(p))`. `TIER_NAME`: S = Plata, G = Oro, P = Prismático.
- Se ofrecen 3 opciones (`augmentChoices`) más **un cambio** (`augrr`), en las rondas 2-1, 3-2 y 4-2. Las rarezas de la partida salen de `rollAugTiers()` y son las mismas para todos los jugadores.
- Palancas disponibles en `defaultMods()`: `income, maxInterest, winStreakMult, lossStreakMult, lossBonus, xpRound, xpBuy, freeRerolls, hpPct, adPct, ap, asPct, def, mr, allFocus, extraTrait, winGold, winHeal, boardBonus, eeveeKills, legend`.
- Patrones ya cubiertos: economía (Amuleto Moneda, Interés Compuesto, Día de Pago, Plan Rocket), EXP (Repartir Exp., Caramelo Raro, Entrenamiento Intensivo), stats de equipo (Danza Espada, Maquinación, Agilidad, Defensa Férrea, Vitalidad), objetos (Bolsas, Cofre), unidades (Guardería, Ultra Ball, Master Ball), rerolls (Ruleta), tamaño del tablero (Nuevo Recluta), insignias (Medallas), Eevee (Piedra Evolutiva) y legendarios (Legado).
- Antes de proponer algo, lista los aumentos actuales con `grep -n "^ A('" public/game.js`.

## Plantilla obligatoria para cada propuesta
```
### <Nombre> (<Plata|Oro|Prismático>) <icono>
- Fantasía: qué estrategia habilita (reroll, Fast 9, racha, economía, emblema, composición, alto riesgo…).
- Descripción para el jugador (español, ≤ 140 caracteres, números exactos).
- Activación: al elegirlo / cada ronda / al ganar / al perder / al llegar a X / al tener N de una sinergia.
- Efecto y duración: valores concretos; cuánto dura (instantáneo, resto de la partida, N rondas).
- Interacciones: con sinergias, objetos, insignias, Eevee, legendarios y otros aumentos (lista los que lo potencian o lo rompen).
- Límites y antiabuso: topes, qué pasa con el banquillo o el inventario lleno, si se apila consigo mismo, si hay que excluirlo con otro.
- Implementación: campos de `p.mods` nuevos o existentes, en qué funciones se lee (`income`, `nextRound`, `resolveRound`, `makeCombatUnit`, `applyTraits`…), si hay que ampliar `teamSnap`/`snapPlayer`, y si necesita interfaz.
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
1. Añade la entrada a `AUGS`. Si hace falta, crea un campo en `defaultMods()` y léelo donde corresponda.
2. Si afecta al combate: añade el campo a `teamSnap()` (clave corta) y a `snapPlayer()`, y aplícalo en `makeCombatUnit` o `applyTraits`.
3. Comprueba que los bots también lo pueden elegir (en `nextRound` eligen al azar entre sus opciones).
4. Ejecuta `npm test` y `npm run test:e2e`, y mide con el simulador: `node .claude/skills/autochess-balance-simulator/scripts/sim.js games --n 60`.

## Sinergias nuevas
Usa la misma ficha, más: breakpoints (`bp`), los textos por nivel (`lv`), su alcance (`scope`), qué Pokémon la llevan (con al menos los Pokémon necesarios para el breakpoint máximo, contando insignias) y su efecto en `applyTraits`. Si tiene insignia, asígnale una medalla en `BADGE_OF` (sprites `sprites/badges/N.png` de PokeAPI: 1-8 Kanto, 9-16 Johto, 17-24 Hoenn…).

## Criterios de aceptación
- Cada propuesta rellena **todos** los campos de la plantilla.
- Ninguna duplica un aumento existente.
- Al implementar, las pruebas pasan y el resultado del simulador se presenta como **simulación**, no como datos de partidas reales.
