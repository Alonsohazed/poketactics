---
name: game-performance-optimization
description: Encuentra y corrige problemas de rendimiento en Poké Tactics (canvas, bucle de animación, renderizados del DOM, cálculos repetidos en combate, fugas de memoria, listeners y temporizadores, carga de sprites, red y servidor), midiendo antes y después.
when_to_use: Cuando el juego vaya a tirones, consuma mucha CPU o memoria, tarde en cargar, o antes de añadir algo que se ejecute en cada frame o en cada tick.
---

# Optimización de rendimiento

## Puntos calientes conocidos (dónde mirar primero)
| Zona | Qué ocurre | Archivo / función |
|---|---|---|
| Bucle de dibujo | `requestAnimationFrame(frame)` llama a `draw()` en cada frame: construye `sceneActors()`, llama a `B3.render(...)` (WebGL) y pinta encima la capa 2D (barras, textos y entrenadores) en las posiciones de `B3.project`. También `renderFeed` y la escena del menú (`Scene.frame`, limitada a unos 16 fps). | `[UI]` `frame`, `draw` |
| Tablero 3D | three.js 0.169: arenas, modelos `.glb` (como mucho 4 cargando a la vez), sombras y efectos. Tiene **calidad automática** por FPS (`setQuality(0-2)`, `B3.quality`, `B3.fps`). | `public/board3d.js` |
| Lógica | `setInterval(tick,33)`: planificación, carrusel y avance del combate (`stepVisual`). | `[UI]` `tick` |
| Arenas | `buildArena()` en `board3d.js` crea la escena low-poly con texturas pixel art; se crea una vez por tipo (ruta, estadio o plaza) y se reutiliza (`arenas[kind]`). | `board3d.js` |
| Ambiente | `drawAmbient` dibuja partículas en cada frame (pocas y ajustadas a la rejilla de píxeles). | `drawAmbient` |
| Paneles HTML | `renderUI()` reescribe con `innerHTML` la tienda, las sinergias, los jugadores y la ficha. `renderItems` ya evita repintar si nada cambió (`renderItems.last`). | `renderUI` y siguientes |
| Barras en planificación | `planStats` cachea por versión de interfaz (`G.uiV`), así que no recalcula `makeCombatUnit` en cada frame. | `planStats` |
| Combate | `nearestEnemy` y `nextStep` recorren todas las unidades en cada tick (como máximo unas 20). `simulate` puede hacer hasta 800 ticks. | `[COMBAT]` |
| Servidor | Un `setInterval` de 50 ms por sala. `netFlush` serializa `pub` y `priv` a JSON y solo envía si cambian. | `server.js`, `[NET]` |

## Cómo medir (siempre antes y después)
1. **Combate y lógica, sin navegador**:
   ```bash
   node -e "const vm=require('vm'),fs=require('fs');const c={__SERVER__:true,module:{exports:{}},console,setTimeout,clearTimeout,setInterval,clearInterval};vm.createContext(c);vm.runInContext(['augments.js','game.js'].map(f=>fs.readFileSync('public/'+f,'utf8')).join(String.fromCharCode(10)),c);const E=c.module.exports;const s={m:{},u:[['3,0','charmander',2,['band'],0,0],['2,0','machop',2,[],0,0],['3,3','abra',2,['specs'],0,0]]};const t=process.hrtime.bigint();for(let i=0;i<2000;i++){const cb=E.createCombatSnap(s,s,{s:4,n:2},{seed:i});E.simulate(cb);}console.log('ms por combate',Number(process.hrtime.bigint()-t)/1e6/2000)"
   ```
2. **FPS y tiempo por frame en el navegador**, con Playwright (`npm run test:e2e` como base) o con el MCP `playwright`:
   ```js
   // dentro de page.evaluate: mide 3 s de frames
   await new Promise(r=>{let n=0,t0=performance.now(),worst=0,last=t0;(function f(t){worst=Math.max(worst,t-last);last=t;n++;if(t-t0<3000)requestAnimationFrame(f);else r({fps:n/3,peorFrameMs:worst});})(t0)})
   ```
   Mide en planificación, en un combate con 10 contra 10 Pokémon y en el carrusel.
3. **Tablero 3D**: lee `B3.fps` y `B3.quality` durante un combate de 10 contra 10. Con el MCP `playwright` o Chrome DevTools, mira `renderer.info` (llamadas de dibujo y geometrías) si se expone, y comprueba que las geometrías y los materiales se liberan (`dispose`) al cambiar de arena o de ronda.
4. **Memoria y listeners**: compara `performance.memory.usedJSHeapSize` tras jugar 10 rondas. En Chrome DevTools usa *Performance* y *Memory*; con Playwright, `page.context().tracing`.
5. **Red**: tamaño de `pub` y `priv` (`JSON.stringify(makePriv(p)).length`) y número de mensajes por segundo en una sala de 8.

## Reglas
- En `board3d.js`, reutiliza geometrías y materiales y llama a `dispose()` en lo que se descarta; no crees objetos three.js por frame.
- Nada nuevo en `frame`/`draw` que cree objetos grandes, cambie el DOM o haga `getComputedStyle`. Prepara en caché (como `bgCache`) y dibuja.
- No añadas listeners dentro de funciones que se llaman repetidamente (`renderUI`, `openModal`): usa delegación (como `$('players')`, `$('cards')`) o `onclick` sobre elementos recién creados.
- Los temporizadores de una partida deben morir con ella: `later()` comprueba `G===g`, y los intervalos del servidor se limpian en `closeRoom`.
- Imágenes: siempre con `loadImg` (caché única) y con alternativa si fallan.
- En el servidor no hagas trabajo pesado por tick. Si una simulación es cara, hazla una vez por ronda (como en `startCombat`).
- Mantén el determinismo: optimizar el combate no puede cambiar resultados. Compara ganadores con 200 semillas antes y después.

## Criterios de aceptación
- Hay números de antes y después (ms por combate, FPS o peor frame, tamaño de los mensajes) obtenidos con el mismo procedimiento.
- `npm test` y `npm run test:e2e` pasan, y los resultados de combate con las mismas semillas no cambian.
