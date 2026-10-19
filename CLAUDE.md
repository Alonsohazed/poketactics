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
| `test/smoke.js` | Prueba automática: cuentas, seguridad básica, emparejamiento y 2 jugadores jugando 12 rondas. |
| `test/augments.js` | Pruebas del sistema de aumentos: ofertas, efectos, rachas, emblemas, Caos, topes, combates deterministas y partidas completas (`npm run test:aug`). |
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
npm start          # http://localhost:3000 (cuentas en data/db.json)
npm test           # prueba de humo; debe terminar en "OK: prueba de humo superada"
npm run test:aug   # pruebas de aumentos; debe terminar en "OK: pruebas de aumentos superadas"
```

- Necesitas Node 18 o superior.
- Para probar el multijugador, abre dos ventanas con cuentas distintas (por ejemplo, una en incógnito).
- Para añadir un aumento, añade un `AG({...})` en `augments.js` con sus eventos (`on`), su efecto de combate (`combat` + `snap`, siempre determinista) y su progreso (`ui`); no hace falta tocar el motor.
- Tras cambiar `public/game.js`, comprueba la sintaxis con `node -e "require('vm').createScript(require('fs').readFileSync('public/game.js','utf8'))"` y ejecuta `npm test`.
- En Windows, git puede no estar en el PATH del shell: está en `C:\Program Files\Git\cmd`.

## Convenciones

- Código compacto, como el existente: funciones cortas en una línea cuando caben y comentarios en español solo donde explican el porqué.
- Sin dependencias nuevas salvo que hagan falta de verdad (ahora solo hay `express`, `socket.io` y `pg`; three.js se carga por CDN en el navegador, con la versión fijada en el `importmap` y en la ruta del decodificador Draco de `board3d.js`).
- Si un cambio no aparece en el navegador, recarga sin caché: Ctrl+Shift+R.
