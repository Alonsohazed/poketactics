---
name: pokemon-data-asset-pipeline
description: Gestiona los datos de Pokémon (especies, formas, tipos, roles, estadísticas, evoluciones, habilidades) y los recursos visuales de Poké Tactics (sprites de PokeAPI y Pokémon Showdown, objetos, medallas), con validación de referencias y de archivos que faltan. Incluye scripts/validate.js.
when_to_use: Al añadir o cambiar Pokémon, formas, objetos, entrenadores o sprites, o si algo se ve como un círculo con iniciales o un emoji en vez de su imagen.
---

# Datos de Pokémon y recursos

## Dónde están los datos (`public/game.js`, sección `[DATA]`)
- `UNIT_LIST`: `U(clave, [nombres por forma], [nº Pokédex por forma], coste 1-5, rol, [sinergias], [habilidad por estrella])`.
  - Los roles son `t` tanque, `b` cuerpo a cuerpo, `a` asesino, `r` tirador, `m` mago y `h` soporte (stats base en `ROLE`).
  - Una línea de 2 formas repite la 2.ª forma y su habilidad a 3★ (`nameOf`, `dexOf` y `abOf` usan la última entrada).
- `EVOS`: evoluciones de Eevee (`evoOf:'eevee'`, `mult:1.3`). `DEF[clave]` reúne ambas listas.
- Habilidad: `[tipo, nombre, parámetros]`. Tipos válidos en `KIND_NAME`; el texto se genera en `abDesc`.
- Sinergias: `TRAITS`. Objetos: `COMPS`, `FULL` e `ITEMS`. Entrenadores: `TRAINERS` (`[clave Showdown, nombre, región]`). Insignias: `EMBLEM_OF` y `BADGE_OF`.

## Recursos (todos se cargan en caliente; no hay imágenes en el repo)
| Recurso | URL | Dónde se define |
|---|---|---|
| Pokémon (2D: tienda, paneles y reserva del 3D) | `raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/<dex>.png` | `SPRITE` |
| Pokémon (modelos 3D del tablero) | `cdn.jsdelivr.net/gh/Pokemon-3D-api/assets@main/models/opt/regular/<dex>.glb` (Draco + WebP) | `MODEL_URL` en `board3d.js` |
| Objetos | `…/sprites/items/<nombre-pokeapi>.png` | `ITEM_SPRITE`, tabla `ITEM_ART` |
| Medallas | `…/sprites/badges/<n>.png` (solo 8 de las 28 insignias tienen medalla; el resto usa el icono de su sinergia) | `BADGE_SPRITE`, `BADGE_OF` |
| Sprites de 3.ª gen (menú) | `…/sprites/pokemon/versions/generation-iii/emerald/<dex>.png` | `GEN3` |
| Entrenadores | `play.pokemonshowdown.com/sprites/trainers/<clave>.png` | `TRAINER_SPRITE`, `TRAINERS` |

- Modelos 3D: `board3d.js` los carga bajo demanda, como mucho 4 a la vez. Mientras llegan, o si fallan, se ve el sprite 2D. Las animaciones se eligen por nombre (`RX`: reposo, andar, ataque, habilidad, debilitado) porque cada modelo las llama distinto. Al añadir un Pokémon, comprueba que existe su `.glb` (`curl -I`) y cómo se ve en el tablero.
- Caché: `loadImg(clave,url)` guarda cada imagen una sola vez en `imgCache` (`getImg`, `getTrImg`, `getItemImg`). **No** crees `new Image()` sueltos: reutiliza `loadImg`.
- Fallos de carga:
  - Pokémon: la ficha HTML (`hydrate`) muestra un círculo con iniciales y el canvas (`drawToken`) dibuja ese mismo círculo;
  - objetos: un manejador global de `error` cambia la `<img data-fb>` por su emoji;
  - entrenadores: un círculo con emoji.
- Respeta la estructura de PokeAPI y no descargues los sprites al repositorio salvo que se decida explícitamente (habría que revisar la licencia y el tamaño).

## Validación (ejecútala tras cualquier cambio de datos)
```bash
node .claude/skills/pokemon-data-asset-pipeline/scripts/validate.js        # coherencia de datos, sin red
node .claude/skills/pokemon-data-asset-pipeline/scripts/validate.js --net  # + comprueba que existen las ~260 URLs de sprites
```
Comprueba:
- claves repetidas, roles, costes y sinergias desconocidos, y que haya tantos nombres como números de Pokédex;
- tipos de habilidad válidos;
- breakpoints alcanzables;
- recetas completas, insignias válidas y objetos sin sprite;
- aumentos repetidos;
- entrenadores repetidos;
- y, con `--net`, que cada URL responda 200.

## Añadir un Pokémon (ejemplo)
```js
U('totodile',['Totodile','Croconaw','Feraligatr'],[158,159,160],2,'b',['Agua','Coloso'],
  [['burn','Pistola Agua',{m:1.1}],['line','Hidrobomba',{m:1.3}],['nova','Acua Cola',{r:1,m:1.2,stun:1}]]),
```
1. Comprueba que existen los números de Pokédex y que cada sinergia está en `TRAITS`.
2. Ejecuta `validate.js --net`.
3. Ejecuta `npm test` (el pool se crea solo con `POOL_SIZE[coste-1]`).
4. Mide el balance con `autochess-balance-simulator` (modo `units --cost N`).

Para añadir un entrenador: comprueba la URL de Showdown con `curl -I` antes de añadirlo a `TRAINERS`. El servidor valida la elección contra esa lista.

## Criterios de aceptación
- `validate.js --net` termina sin errores y `npm test` pasa.
- Ningún recurso nuevo rompe la carga: hay alternativa visible si falla.
- Los nombres en español siguen la nomenclatura oficial española cuando existe.

## Animaciones creadas en Blender
- `scripts/crear-clips-generico.py`: los 5 clips del juego (idle, run, attack, victory, faint) para cualquier modelo de Pokemon-3D-api con el esqueleto estándar (cuadrúpedos y bípedos). Revisa siempre las vistas (`render carpeta`) y luego el modelo en el juego (`B3.debugShot(dex, clip, fracción)` con la ficha sola en la banca, que mira a la cámara).
- `scripts/crear-esqueleto.py`: crea un esqueleto completo con los nombres estándar a un modelo que no lo trae (pies por k-medias, cabeza, cola y brazos por la forma; pesos automáticos o por cercanía) y lo exporta; después se anima con `crear-clips-generico.py`. Revisa siempre la imagen `vista=`.
- `scripts/crear-clips-sin-esqueleto.py`: solo para lo que no tiene extremidades (Pupitar, Steelix): anima el cuerpo entero (`flota=1` para fantasmas).
- Opciones del genérico: `flota=1`, `relax=0` (no bajar brazos), `tipo=cuadrupedo|bipedo`, `amp=` (amplitud) y `caer=<prefijo>+<prefijo>:<grados>` (deja colgar cadenas que el modelo trae rectas, p. ej. `caer=LFeeler+RFeeler:75` en Riolu).
- `scripts/crear-clips-blender.py`: el de Chikorita (152), hecho a mano para su esqueleto.
- Después: `scripts/optimizar-modelo.mjs`, el `.json` del modelo en `public/anims/` y el número en `ANIM_SET` de `board3d.js`.
