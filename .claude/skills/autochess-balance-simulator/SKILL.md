---
name: autochess-balance-simulator
description: Simula combates y partidas de Poké Tactics con el motor real para medir tasas de victoria, fuerza de composiciones, rendimiento por coste, valor de los aumentos y sinergias dominantes. Incluye el script scripts/sim.js.
when_to_use: Antes y después de cambiar números de Pokémon, sinergias, objetos o aumentos, o cuando se pregunte si algo está roto o es débil.
---

# Simulador de balance

`scripts/sim.js` carga `public/game.js` en un `vm` (igual que el servidor) y usa `createCombatSnap` + `simulate`. Así, **los combates son exactamente los del juego**. Ejecútalo desde la raíz del proyecto.

## Modos
```bash
# Cada Pokémon contra todos los de su mismo coste (1 contra 1). Ranking por tasa de victoria.
node .claude/skills/autochess-balance-simulator/scripts/sim.js units --cost 3 --star 2 --n 40

# Composición contra composición: "clave:estrellas[:objeto+objeto], ..."
node .claude/skills/autochess-balance-simulator/scripts/sim.js comp \
  --a "charmander:2:band,growlithe:2,houndour:1" --b "squirtle:2:vest,bulbasaur:2,abra:2:specs" --n 300

# Partidas completas de 8 bots: puesto medio por aumento y por sinergia principal
node .claude/skills/autochess-balance-simulator/scripts/sim.js games --n 60 --diff dificil

# Cualquiera de ellos con --json para procesar el resultado
```
- `scripts/balance.js` (más justo para comparar fichas): `unit --cost 3 --star 2 [--only absol,ponyta]` enfrenta cada ficha con objetos ideales a todas las de su coste y estrella en **espejo** (los mismos 6 compañeros al azar: solo cambia la ficha), con su **composición natural** (compañeros que comparten sus sinergias, mismo perfil de costes 4-4-3-3-2-2) y con **objetos malos**; `trait --trait Asesino` mide la sinergia en cada escalón (prismático con emblema) contra tableros del mismo coste hueco por hueco sin ella. Objetivo usado: ≤ 60 % en espejo. `scripts/leg3.js` mide costes 5 a 3★ contra tableros de nivel 9.
- Las claves de Pokémon son las de `UNIT_LIST` (`grep -n "^ U('" public/game.js`) y las de objetos las de `ITEMS` (componentes: `claw wing spoon water coat goggles club lens medal`).
- En `comp`, el script coloca delante a tanques y cuerpo a cuerpo, y detrás a tiradores, magos y soportes.
- Para medir un cambio: ejecuta antes y después con el mismo `--n` y compara. Con `games`, usa 60 partidas o más para conclusiones (cada una tarda unos 2 s).

## Cómo interpretar
- **Siempre dilo**: son resultados de SIMULACIÓN entre bots o de combates aislados, no datos de partidas reales. Hoy no se guardan datos de partidas reales por composición; solo las estadísticas por cuenta (`stats` en la base de datos).
- `units` en 1 contra 1 favorece a cuerpo a cuerpo y asesinos, y castiga a soportes y magos, cuyo valor está en equipo. Úsalo para encontrar valores atípicos **dentro de un mismo rol**, no para comparar roles.
- Referencias orientativas:
  - en `units`, un Pokémon con más del 85 % o menos del 15 % contra su mismo coste y rol merece revisión;
  - en `games`, el puesto medio esperado al azar es 4,5: un aumento con un puesto medio menor de 3,5 o mayor de 5,5 con 20 o más muestras es candidato a ajuste;
  - en `comp`, una composición que gana más del 80 % a varias composiciones razonables del mismo coste total no tiene contrajuego.
- Los bots (`[BOTS]`) eligen aumentos al azar y siguen un plan sencillo (`botPlan`). Los resultados por aumento miden "valor con un juego mediocre", no su techo.

## Qué analizar
- **Rendimiento por coste y nivel**: `units` con `--star 1/2/3` por coste.
- **Composiciones**: `comp` con equipos del mismo coste total y probando objetos.
- **Aumentos y economía**: `games`. Para la curva económica, mira `income()`, `XP_NEED`, `SHOP_ODDS` y `POOL_SIZE` en `public/game.js`.
- **Interacciones dominantes**: busca combinaciones de sinergia, objeto y aumento que disparen la tasa de victoria; repite con varias semillas (`--n` alto).

## Criterios de aceptación de un informe
- Indica el comando exacto, `--n` y la fecha, y distingue simulación de datos reales.
- Recomienda cambios con valores concretos (por ejemplo, "Fuego 4: quemadura del 4 % al 3,5 %") y los vuelve a medir tras aplicarlos.
- Al cambiar números: `npm test` y `npm run test:e2e` siguen pasando.
