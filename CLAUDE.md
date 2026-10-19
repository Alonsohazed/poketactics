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
| `public/augments.js` | **Aumentos**: catálogo declarativo (Plata, Oro, Prismático), motor de efectos por eventos (`augFire`), elecciones pendientes (`augOffer`/`resolvePick`), efectos de combate deterministas (`augSnap`/`augCombat`) y Llamada al Caos. Se carga **antes** que `game.js` (en el navegador y concatenado en el servidor). |
| `public/game.js` | **Todo el juego**: datos, combate, bots, flujo de rondas, red, música e interfaz. Lo usan el navegador **y** el servidor. |
| `public/board3d.js` | **Tablero 3D** (módulo ES, solo navegador): three.js, arenas, casillas, modelos de los Pokémon, animaciones y efectos de las habilidades. Expone `window.B3`. |
| `public/index.html` | Marcado y todo el CSS (tokens de color en `:root`, tema oscuro por defecto). Carga three.js 0.169 desde jsDelivr con un `importmap`. |
| `test/smoke.js` | Prueba rápida sin navegador: cuentas, seguridad básica, emparejamiento y 2 jugadores por Socket.io durante 12 rondas. |
| `test/augments.js` | Pruebas del sistema de aumentos: ofertas, efectos, rachas, emblemas, Caos, topes, combates deterministas y partidas completas (`npm run test:aug`). |
| `tests/e2e/*.spec.js` | Pruebas de navegador con Playwright (`playwright.config.js`): acceso, menús, tienda, tablero, rondas, objetos, sinergias, aumentos, espectador y multijugador con 2 navegadores. |
| `.claude/skills/` | Skills propias del proyecto (ver «Herramientas para Claude»). |
| `.mcp.json` | Servidor MCP `playwright` del proyecto. |
| `render.yaml` | Configuración de Render (Node 20, health check en `/health`, `DATABASE_URL` secreta). |

`public/game.js` está dividido en secciones con cabeceras `/* ==== [NOMBRE] ==== */`: `[DATA]` (sinergias, Pokémon, entrenadores), `[ABILITIES]`, `[ITEMS]`, `[CORE]`, `[COMBAT]`, `[BOTS]`, `[AUGMENTS]`, `[LOOT]`, `[FLOW]` (rondas, emparejamiento, carrusel), `[NET]`, `[MUSIC]`, `[UI]` (puente con el 3D, capa 2D, paneles, cuentas, escena del menú) y `[SERVER API]`.

## Ideas clave de la arquitectura

- **Un solo motor para cliente y servidor.** `server.js` carga `public/augments.js` + `public/game.js` en un contexto `vm` aislado por sala (`__SERVER__` definido, `HEADLESS` true) y usa `serverCreate/serverTick/serverAct/serverLeave/serverInfo`. En el navegador, `boot()` arranca la interfaz. Cualquier código fuera de `[UI]` debe funcionar sin `document`.
- **Combates deterministas.** Cada combate usa una semilla (`mulberry32`). El servidor envía semilla + equipos (`teamSnap`) y cada cliente los anima: el resultado es idéntico. Nunca uses `Math.random()` dentro de la lógica de combate; usa `cb.rng`. Gracias a esto se puede **ver en directo el combate de otros** (`spectate()`, `G.view`): se recrea el combate con la misma semilla y se adelanta hasta el mismo segundo.
- **Mensajes de red** (servidor → clientes): `pub` (estado público), `priv` (estado de cada jugador; recortado si pasa de unos 3,9 KB), `cmb` (tu combate), `cmbs` (todos los combates de la ronda), `car` (carrusel; posiciones normalizadas al centro y radio del carrusel). Los jugadores solo envían `act` (acciones validadas en `applyAct`).
- **Nombre y entrenador salen de la cuenta**, nunca de lo que mande el navegador (`seatFor` en `server.js`).
- **Emparejamiento tipo TFT** (`makeFights` en `[FLOW]`): prueba todas las combinaciones posibles y elige la de menor coste. Nunca repite rival dos rondas seguidas y completa un ciclo contra todos antes de repetir. `possibleOpps()` alimenta la marca ⚔️ de la lista de jugadores.
- **Geometría del tablero**: `computeGeo(W)`, con rejilla hexagonal 7×8, banquillo de 9 y un lateral a cada lado para los entrenadores (estrategas). Todo se sigue calculando en "píxeles de tablero" 2D (`cellXY`, `benchXY`, `unitXY`); `board3d.js` los convierte a mundo 3D (1 unidad = radio de una casilla).
- **Tablero 3D + capa 2D.** Hay dos lienzos apilados en `#boardStack`: `#gl` (WebGL, lo pinta `board3d.js`) y encima `#cv` (2D: barras de vida y maná, estrellas, objetos, textos de daño, carteles de habilidad y entrenadores). En cada fotograma `draw()` construye la lista de Pokémon en escena (`sceneActors()`) y llama a `B3.render({arena,actors,fx,cellPx,unitPx,cells,benchHover})`; luego pinta la capa 2D en las posiciones proyectadas (`B3.project`). El ratón se traduce al suelo con `B3.unproject` (`canvasPos`) y los Pokémon se eligen en pantalla con `pickActor()`, porque los modelos están de pie.
- Los entrenadores van en la capa 2D porque Pokémon Showdown no permite usar sus imágenes como textura WebGL (sin CORS).
- **Habilidades.** Cada una es `[tipo, nombre, parámetros]` en `UNIT_LIST` y se resuelve en `castAbility()`. Además de los tipos clásicos hay mecánicas con posición y tiempo: `cone`, `wave`, `strike` (aviso en el suelo y golpe retardado), `zone` (daño o curación por tics), `knock`/`pull` (empujar o atraer con `shove()`), `seed` (drenadoras), `poison` (veneno que reduce la curación a la mitad), `mark` (+% de daño recibido), `spin` y `slam`. Lo retardado va con `later2(cb,segundos,fn)` (cola `cb.pend` que procesa `stepCombat`): **nunca** uses `setTimeout` en el combate. Los efectos visuales llevan elemento (`el`) y estilo (`p.v`, p. ej. `'rocks'`, `'sand'`) para que `board3d.js` los pinte distintos; no afectan a la simulación. Al cambiar números de habilidades, comprueba el equilibrio simulando muchos combates (equipos aleatorios con las mismas semillas antes y después).

## Reglas del juego (resumen de lo implementado)

El detalle, con los nombres de las funciones, está en la skill `autochess-systems-architect`.

- **Rondas** (`buildRounds`):
  - fase 1: tres rondas PvE;
  - fases 2-9: siete rondas cada una (la 4.ª es carrusel, la 7.ª es PvE y el resto PvP);
  - aumentos en 2-1, 3-2 y 4-2 (3 opciones de categorías distintas y un cambio, con «Confirmar»; la rareza la sortea `rollAugTiers` y es la misma para todos).
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
  - al perder, el jugador recibe el daño de la fase más 1 por cada Pokémon rival que sobrevive (2 si es de 3★);
  - **habilidades híbridas** (`abilPower`): base por coste y estrellas × (1 + poder/100) × factor del rol. Asesinos, luchadores y tiradores multiplican por ataque actual/base; los tanques, por (vida máx. actual/base)^0,75; magos y soportes, solo poder. Sin objetos el factor vale 1. Se recalcula en cada lanzamiento, así que lo acumulado (Eevee, «Acumular», Cinta Furia…) hace crecer la habilidad.
- **Contenido actual** (comprobado con `validate.js`):
  - 65 líneas de Pokémon, más 7 evoluciones de Eevee;
  - 21 sinergias y 39 tipos de habilidad;
  - 75 objetos: 9 componentes (Medalla incluida), 37 completos, 28 insignias (8 con arte de medalla) y el Imán Removedor;
  - 80 aumentos: 25 de Plata, 37 de Oro y 18 Prismáticos, en 15 categorías (Llamada al Caos incluida).
- **Minileyenda** (sustituye a los entrenadores): Charmander, Bulbasaur o Squirtle. Se elige **en el menú** (y al crear la cuenta) y se guarda en la cuenta: la columna `trainer` de la base de datos guarda su clave y el servidor la valida contra `TAC_KEYS`. Evoluciona en los niveles 6, 8 y 9 (Mega), se mueve con clic derecho y recoge los orbes de botín.
- **Resultados de aumentos**: lo que el jugador debe ver (Llamada al Caos, contratos) se añade con `revealTo(p,…)` y sale en una ventana (`showReveal`; en multijugador viaja en `priv.rv`). El registro de la partida está en la pestaña 📜.
- **Ficha y barras en planificación**: se calculan con `prepTeam`, igual que al crear el combate (aumentos incluidos); en multijugador el cliente recibe los parámetros de combate de sus aumentos en `priv.ag`.
- **Objetos**: los componentes se combinan también en el inventario; para quitar objetos de un Pokémon se usa el 🧲 Imán Removedor.
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
  - navegador real controlable por Claude, con perfil aislado y solo los orígenes permitidos: localhost, producción, sprites (GitHub y Showdown), fuentes y `cdn.jsdelivr.net` (three.js y modelos 3D);
  - usa **Microsoft Edge** (`--browser msedge`), porque el Chromium descargado por Playwright no arranca en este PC (error de "configuración en paralelo" de Windows); en macOS o Linux cambia a `chromium`;
  - la primera vez, Claude Code pide aprobar el servidor.
- **Plugin `frontend-design@claude-plugins-official`** (oficial de Anthropic; declarado en `.claude/settings.json`): pautas de diseño visual para menús y paneles. No impone frameworks.
- Revisión de código: usa los comandos integrados `/code-review`, `/security-review` y `/simplify`.

## Arte

- Modelos 3D de los Pokémon: [Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets) servidos por jsDelivr (`models/opt/regular/<n.º Pokédex>.glb`, comprimidos con Draco y texturas WebP). Se cargan bajo demanda (máx. 4 a la vez; si jsDelivr falla, se reintenta desde raw.githubusercontent) y, mientras llegan, se ve una Poké Ball 3D: **no se usan sprites 2D de Pokémon**. Las Megas de las minileyendas salen de las carpetas `mega/`, `x/` e `y/` (p. ej. `mega/3`, `y/6`, `y/9`). Se normaliza su tamaño y las animaciones se eligen por nombre (`RX` en `board3d.js`: reposo, andar, ataque, habilidad, debilitado), porque cada modelo las nombra distinto; si no hay, se anima por código (saltitos, embestida, caída).
- Sprites cargados en caliente (no hay imágenes en el repo):
  - Pokémon (tienda, paneles y reserva del 3D) y objetos: PokeAPI/sprites (`sprites/pokemon`, `sprites/items`).
  - Medallas de las insignias: `sprites/badges/N.png` (tabla `BADGE_OF`).
  - Sprites de 3.ª gen del menú: `versions/generation-iii/emerald`.
  - Entrenadores: Pokémon Showdown (`play.pokemonshowdown.com/sprites/trainers/<clave>.png`, lista `TRAINERS`). Antes de añadir uno, comprueba que la URL existe.
- **Arenas 3D low-poly** (`buildArena()` en `board3d.js`): el templo (`temple-fire`, `temple-grass`, `temple-water`: suelo liso, muros de piedra y columnas con braseros) es la arena de todos los combates y su variante es la del anfitrión, según su minileyenda (`arenaHost()`/`bgKind()` en `game.js`); `plaza` es el carrusel. Las casillas hexagonales solo se ven al arrastrar un Pokémon. `route` y `stadium` siguen en el código, pero ya no se usan.
- El menú y el acceso usan de fondo el propio campo 3D (`menuActors()`); la escena pixel art (`Scene`) ya no se muestra.
- Ilustraciones de carta para la tienda en `public/art/` (`CARD_ART` en `game.js`; por ahora, Charmander).
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
npm run check                     # sintaxis de game.js, augments.js y board3d.js (no hay paso de compilación)
npm test                          # prueba de humo; debe terminar en "OK: prueba de humo superada"
npm run test:aug                  # pruebas de aumentos; debe terminar en "OK: pruebas de aumentos superadas"
npm run test:e2e                  # Playwright (levanta su propio servidor en :3100 con una base de datos temporal)
npm run test:all                  # humo + aumentos + 5 pruebas de navegador básicas (@rapido, ~2 min)
npm run test:completo             # todo, con las ~20 pruebas de navegador (~10 min: el campo 3D va lento sin GPU)
```

- Necesitas Node 18 o superior.
- Para probar el multijugador, abre dos ventanas con cuentas distintas (por ejemplo, una en incógnito).
- Informe de Playwright: `npx playwright show-report`. Las trazas de los fallos se guardan en `test-results/`.
- Para añadir un aumento, añade un `AG({...})` en `augments.js` con sus eventos (`on`), su efecto de combate (`combat` + `snap`, siempre determinista) y su progreso (`ui`); no hace falta tocar el motor.
- En Windows, git puede no estar en el PATH del shell: está en `C:\Program Files\Git\cmd`.

## Cómo evitar regresiones y desplegar

1. Antes de tocar una mecánica, lee la skill correspondiente y busca el código real. No asumas frameworks: es JS sin compilar; el tablero es three.js (`board3d.js`) con una capa 2D encima, y el resto de la interfaz es HTML y CSS.
2. Tras el cambio, ejecuta `npm run check` y `npm run test:all`. Si tocas datos, también `validate.js --net`; si tocas balance, el simulador antes y después.
3. Si añades una acción o un mensaje de red, añade su prueba (entrada inválida incluida) en `test/smoke.js` o `tests/e2e/`. Si añades un aumento, añádelo también a `test/augments.js`.
4. Comprueba la interfaz en el navegador, en solitario y en multijugador.
5. Haz commit en local y **pide confirmación antes de hacer push a `main`**: el push publica en Render y los jugadores lo ven al momento. Tras desplegar, comprueba que `https://poke-tactics.onrender.com/game.js` sirve la versión nueva.

## Convenciones

- Código compacto, como el existente: funciones cortas en una línea cuando caben y comentarios en español solo donde explican el porqué.
- Sin dependencias nuevas salvo que hagan falta de verdad (ahora solo hay `express`, `socket.io` y `pg`; three.js se carga por CDN en el navegador, con la versión fijada en el `importmap` y en la ruta del decodificador Draco de `board3d.js`).
- Si un cambio no aparece en el navegador, recarga sin caché: Ctrl+Shift+R.
