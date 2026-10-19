# Poké Tactics

Autochess de Pokémon al estilo Teamfight Tactics: modo solitario contra 7 bots y multijugador por salas (hasta 8 humanos; los asientos libres los ocupan bots). Fangame gratuito y sin ánimo de lucro. Todo el texto del juego y del código está en **español**; mantenlo así.

- Producción: https://poke-tactics.onrender.com (Render, plan gratis)
- Repo: https://github.com/Alonsohazed/poketactics. Cada push a `main` despliega solo en Render. **No hagas push sin confirmarlo**, porque publica directamente para los jugadores.

## Estructura

| Archivo | Qué hace |
|---|---|
| `server.js` | Express + Socket.io. Gestiona las salas y ejecuta cada partida multijugador **en el servidor** (autoritativo), con un tick de 50 ms. |
| `auth.js` | Registro, login y sesiones (`/api/register`, `/api/login`, `/api/logout`, `/api/me`, `/api/result`) y el guardián de Socket.io. |
| `db.js` | Cuentas y sesiones. Usa PostgreSQL si existe `DATABASE_URL` (Neon en producción); si no, `data/db.json` (local, ignorado por git). |
| `public/game.js` | **Todo el juego**: datos, combate, bots, flujo de rondas, red, música e interfaz. Lo usan el navegador **y** el servidor. |
| `public/index.html` | Marcado y todo el CSS (tokens de color en `:root`, tema oscuro por defecto). |
| `test/smoke.js` | Prueba rápida sin navegador: cuentas, seguridad básica, emparejamiento y 2 jugadores por Socket.io durante 12 rondas. |
| `tests/e2e/*.spec.js` | Pruebas de navegador con Playwright (`playwright.config.js`): acceso, menús, tienda, tablero, rondas, objetos, sinergias, aumentos, espectador y multijugador con 2 navegadores. |
| `.claude/skills/` | Skills propias del proyecto (ver «Herramientas para Claude»). |
| `.mcp.json` | Servidor MCP `playwright` del proyecto. |
| `render.yaml` | Configuración de Render (Node 20, health check en `/health`, `DATABASE_URL` secreta). |

`public/game.js` está dividido en secciones con cabeceras `/* ==== [NOMBRE] ==== */`: `[DATA]` (sinergias, Pokémon, entrenadores), `[ABILITIES]`, `[ITEMS]`, `[CORE]`, `[COMBAT]`, `[BOTS]`, `[AUGMENTS]`, `[LOOT]`, `[FLOW]` (rondas, emparejamiento, carrusel), `[NET]`, `[MUSIC]`, `[UI]` (canvas, arenas pixel art, paneles, cuentas, escena del menú) y `[SERVER API]`.

## Ideas clave de la arquitectura

- **Un solo motor para cliente y servidor.** `server.js` carga `public/game.js` en un contexto `vm` aislado por sala (`__SERVER__` definido, `HEADLESS` true) y usa `serverCreate/serverTick/serverAct/serverLeave/serverInfo`. En el navegador, `boot()` arranca la interfaz. Cualquier código fuera de `[UI]` debe funcionar sin `document`.
- **Combates deterministas.** Cada combate usa una semilla (`mulberry32`). El servidor envía semilla + equipos (`teamSnap`) y cada cliente los anima: el resultado es idéntico. Nunca uses `Math.random()` dentro de la lógica de combate; usa `cb.rng`. Gracias a esto se puede **ver en directo el combate de otros** (`spectate()`, `G.view`): se recrea el combate con la misma semilla y se adelanta hasta el mismo segundo.
- **Mensajes de red** (servidor → clientes): `pub` (estado público), `priv` (estado de cada jugador; recortado si pasa de unos 3,9 KB), `cmb` (tu combate), `cmbs` (todos los combates de la ronda), `car` (carrusel; posiciones normalizadas al centro y radio del carrusel). Los jugadores solo envían `act` (acciones validadas en `applyAct`).
- **Nombre y entrenador salen de la cuenta**, nunca de lo que mande el navegador (`seatFor` en `server.js`).
- **Emparejamiento tipo TFT** (`makeFights` en `[FLOW]`): prueba todas las combinaciones posibles y elige la de menor coste. Nunca repite rival dos rondas seguidas y completa un ciclo contra todos antes de repetir. `possibleOpps()` alimenta la marca ⚔️ de la lista de jugadores.
- **Geometría del tablero**: `computeGeo(W)`, con rejilla hexagonal 7×8, banquillo de 9 y un lateral a cada lado para los entrenadores (estrategas).

## Reglas del juego (resumen de lo implementado)

El detalle, con los nombres de las funciones, está en la skill `autochess-systems-architect`.

- **Rondas** (`buildRounds`):
  - fase 1: tres rondas PvE;
  - fases 2-9: siete rondas cada una (la 4.ª es carrusel, la 7.ª es PvE y el resto PvP);
  - aumentos en 2-1, 3-2 y 4-2 (3 opciones y un cambio; la rareza de cada uno la sortea `rollAugTiers` y es la misma para todos).
- **Economía**:
  - ingreso base 0/2/3/4 al principio y después 5;
  - interés de 1 por cada 10 de oro (máximo 5);
  - racha de 2-3 da +1, de 4 da +2 y de 5 o más da +3;
  - refrescar la tienda cuesta 2; comprar EXP cuesta 4 por 4 EXP.
- **Progresión**: nivel máximo 10 (`XP_NEED`); probabilidades de la tienda por nivel en `SHOP_ODDS`; pool compartido `POOL_SIZE=[30,25,18,10,9]`; 3 copias suben 1 estrella. Tablero = nivel + bonus + Medallas Maestras.
- **Combate**:
  - tick de 0,05 s y límite de 40 s (luego empate);
  - +10 de maná por ataque y maná al recibir daño;
  - reducción de daño de 100/(100+defensa) (física) o 100/(100+resistencia) (mágica);
  - reducción extra con un máximo del 75 %;
  - al perder, el jugador recibe el daño de la fase más 1 por cada Pokémon rival que sobrevive (2 si es de 3★).
- **Contenido actual**: 65 líneas de Pokémon (más 7 evoluciones de Eevee), 21 sinergias, 54 objetos (8 componentes, Medalla, 36 completos, 8 insignias con arte de medalla y la Medalla Maestra) y 37 aumentos.
- **Limitación conocida**: si un jugador se desconecta, un bot sigue por él y **no puede volver a su asiento**.

## Herramientas para Claude

- **Skills del proyecto** (`.claude/skills/`; se invocan con `/nombre` o solas cuando encajan):
  - `autochess-systems-architect`: mapa de combate, economía, sinergias y objetos, y cómo implementar mecánicas.
  - `tft-augments-traits-designer`: ficha obligatoria para diseñar aumentos y sinergias.
  - `autochess-balance-simulator`: `scripts/sim.js`, con los modos `units`, `comp` y `games` (simulaciones con el motor real).
  - `multiplayer-integrity-testing`: lista antitrampas y antirregresiones del multijugador.
  - `pokemon-data-asset-pipeline`: `scripts/validate.js [--net]`, que valida los datos y que existan todos los sprites.
  - `game-performance-optimization`: puntos calientes y cómo medir antes y después.
- **MCP `playwright`** (`.mcp.json`, Microsoft `@playwright/mcp` instalado en `devDependencies`):
  - navegador real controlable por Claude, con perfil aislado y solo los orígenes permitidos (localhost, producción y los hosts de sprites y fuentes);
  - usa **Microsoft Edge** (`--browser msedge`), porque el Chromium descargado por Playwright no arranca en este PC (error de "configuración en paralelo" de Windows); en macOS o Linux cambia a `chromium`;
  - la primera vez, Claude Code pide aprobar el servidor.
- **Plugin `frontend-design@claude-plugins-official`** (oficial de Anthropic; declarado en `.claude/settings.json`): pautas de diseño visual para menús y paneles. No impone frameworks.
- Revisión de código: usa los comandos integrados `/code-review`, `/security-review` y `/simplify`.

## Arte

- Sprites cargados en caliente (no hay imágenes en el repo):
  - Pokémon y objetos: PokeAPI/sprites (`sprites/pokemon`, `sprites/items`).
  - Medallas de las insignias: `sprites/badges/N.png` (tabla `BADGE_OF`).
  - Sprites de 3.ª gen del menú: `versions/generation-iii/emerald`.
  - Entrenadores: Pokémon Showdown (`play.pokemonshowdown.com/sprites/trainers/<clave>.png`, lista `TRAINERS`). Antes de añadir uno, comprueba que la URL existe.
- **Arenas en pixel art estilo GBA**: `buildBg()` pinta a baja resolución con `pixelPainter()` (relleno fila a fila, sin antialiasing, paleta `PAL`) y amplía sin suavizado. Hay tres arenas: `route` (PvE), `stadium` (PvP) y `plaza` (carrusel). Las animaciones de ambiente van en `drawAmbient()`, ajustadas a la rejilla de píxeles.
- La escena del menú y del login (`Scene`) también es pixel art. El canvas `#scene` se muestra por CSS solo cuando el menú o el login están visibles.
- No uses fan art de terceros sin permiso; inspírate en el estilo de los juegos oficiales.

## Cuentas y seguridad

- Contraseñas con scrypt y sal por usuario. La sesión va en una cookie `pt_sid` HttpOnly + SameSite=Lax (+ Secure en https), y en la base de datos solo se guarda su hash SHA-256.
- Hay límite de intentos por IP y por cuenta. Las rutas POST exigen JSON y el mismo origen. Socket.io rechaza conexiones sin sesión (`connect_error` con mensaje `auth`).
- Las cuentas guardan: entrenador, ajustes (`vol, muted, timer, speed, theme, diff`) y estadísticas (`games, wins, top4, best`). Las partidas multijugador las apunta el servidor (`recordPlaces`); las de solitario, el cliente (`/api/result`).

## Trabajar en local

```bash
npm install
npx playwright install chromium   # solo la primera vez: navegador para las pruebas E2E
npm start                         # http://localhost:3000 (cuentas en data/db.json)
npm run check                     # sintaxis de public/game.js (no hay paso de compilación)
npm test                          # prueba de humo; debe terminar en "OK: prueba de humo superada"
npm run test:e2e                  # Playwright (levanta su propio servidor en :3100 con una base de datos temporal)
npm run test:all                  # las dos
```

- Necesitas Node 18 o superior.
- Para probar el multijugador, abre dos ventanas con cuentas distintas (por ejemplo, una en incógnito).
- Informe de Playwright: `npx playwright show-report`. Las trazas de los fallos se guardan en `test-results/`.
- En Windows, git puede no estar en el PATH del shell: está en `C:\Program Files\Git\cmd`.

## Cómo evitar regresiones y desplegar

1. Antes de tocar una mecánica, lee la skill correspondiente y busca el código real. No asumas frameworks: es JS sin compilar, con canvas 2D.
2. Tras el cambio, ejecuta `npm run check` y `npm run test:all`. Si tocas datos, también `validate.js --net`; si tocas balance, el simulador antes y después.
3. Si añades una acción o un mensaje de red, añade su prueba (entrada inválida incluida) en `test/smoke.js` o `tests/e2e/`.
4. Comprueba la interfaz en el navegador, en solitario y en multijugador.
5. Haz commit en local y **pide confirmación antes de hacer push a `main`**: el push publica en Render y los jugadores lo ven al momento. Tras desplegar, comprueba que `https://poke-tactics.onrender.com/game.js` sirve la versión nueva.

## Convenciones

- Código compacto, como el existente: funciones cortas en una línea cuando caben y comentarios en español solo donde explican el porqué.
- Sin dependencias nuevas salvo que hagan falta de verdad (ahora solo hay `express`, `socket.io` y `pg`).
- Si un cambio no aparece en el navegador, recarga sin caché: Ctrl+Shift+R.
