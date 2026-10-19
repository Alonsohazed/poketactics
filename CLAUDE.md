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
| `test/smoke.js` | Prueba automática: cuentas, seguridad básica, emparejamiento y 2 jugadores jugando 12 rondas. |
| `render.yaml` | Configuración de Render (Node 20, health check en `/health`, `DATABASE_URL` secreta). |

`public/game.js` está dividido en secciones con cabeceras `/* ==== [NOMBRE] ==== */`: `[DATA]` (sinergias, Pokémon, entrenadores), `[ABILITIES]`, `[ITEMS]`, `[CORE]`, `[COMBAT]`, `[BOTS]`, `[AUGMENTS]`, `[LOOT]`, `[FLOW]` (rondas, emparejamiento, carrusel), `[NET]`, `[MUSIC]`, `[UI]` (canvas, arenas pixel art, paneles, cuentas, escena del menú) y `[SERVER API]`.

## Ideas clave de la arquitectura

- **Un solo motor para cliente y servidor.** `server.js` carga `public/game.js` en un contexto `vm` aislado por sala (`__SERVER__` definido, `HEADLESS` true) y usa `serverCreate/serverTick/serverAct/serverLeave/serverInfo`. En el navegador, `boot()` arranca la interfaz. Cualquier código fuera de `[UI]` debe funcionar sin `document`.
- **Combates deterministas.** Cada combate usa una semilla (`mulberry32`). El servidor envía semilla + equipos (`teamSnap`) y cada cliente los anima: el resultado es idéntico. Nunca uses `Math.random()` dentro de la lógica de combate; usa `cb.rng`. Gracias a esto se puede **ver en directo el combate de otros** (`spectate()`, `G.view`): se recrea el combate con la misma semilla y se adelanta hasta el mismo segundo.
- **Mensajes de red** (servidor → clientes): `pub` (estado público), `priv` (estado de cada jugador; recortado si pasa de unos 3,9 KB), `cmb` (tu combate), `cmbs` (todos los combates de la ronda), `car` (carrusel; posiciones normalizadas al centro y radio del carrusel). Los jugadores solo envían `act` (acciones validadas en `applyAct`).
- **Nombre y entrenador salen de la cuenta**, nunca de lo que mande el navegador (`seatFor` en `server.js`).
- **Emparejamiento tipo TFT** (`makeFights` en `[FLOW]`): prueba todas las combinaciones posibles y elige la de menor coste. Nunca repite rival dos rondas seguidas y completa un ciclo contra todos antes de repetir. `possibleOpps()` alimenta la marca ⚔️ de la lista de jugadores.
- **Geometría del tablero**: `computeGeo(W)`, con rejilla hexagonal 7×8, banquillo de 9 y un lateral a cada lado para los entrenadores (estrategas).

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
npm start          # http://localhost:3000 (cuentas en data/db.json)
npm test           # prueba de humo; debe terminar en "OK: prueba de humo superada"
```

- Necesitas Node 18 o superior.
- Para probar el multijugador, abre dos ventanas con cuentas distintas (por ejemplo, una en incógnito).
- Tras cambiar `public/game.js`, comprueba la sintaxis con `node -e "require('vm').createScript(require('fs').readFileSync('public/game.js','utf8'))"` y ejecuta `npm test`.
- En Windows, git puede no estar en el PATH del shell: está en `C:\Program Files\Git\cmd`.

## Convenciones

- Código compacto, como el existente: funciones cortas en una línea cuando caben y comentarios en español solo donde explican el porqué.
- Sin dependencias nuevas salvo que hagan falta de verdad (ahora solo hay `express`, `socket.io` y `pg`).
- Si un cambio no aparece en el navegador, recarga sin caché: Ctrl+Shift+R.
