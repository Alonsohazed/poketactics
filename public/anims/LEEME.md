# Animaciones por estados (prueba)

Los 82 modelos de 1.ª gen que usa el juego (`ANIM_SET` en `board3d.js`; 36 MB en total). El resto de generaciones sigue con Pokemon-3D-api.

- `<n.º>.glb`: modelo animado de [06wj/pokemon](https://github.com/06wj/pokemon) (clips de Escarlata/Púrpura; los 151 de la 1.ª gen). Lleva solo `idle`, `run`, `attack` (recortado alrededor del golpe), `victory` (su `happy`) y `faint` (su `sleep`, 3 s). Texturas WebP a 512 px y mallas con Draco: 230–600 KB cada uno.
- `<n.º>.json`: `"glb": true`, el fotograma de impacto de `attack` y `special` (fracción del clip, de 0 a 1) y `alias` (un clip que hace de otro: `special` usa el de ataque). Lo que falte (`hit`) se genera por código sobre el esqueleto o se queda en el destello.
- El impacto se calcula como el pico de movimiento de los huesos en el clip de ataque original; se guarda desde 0,7 s antes hasta 0,45 s después.
- Los modelos y clips son de Nintendo, Creatures y GAME FREAK (como el resto de modelos 3D del juego).
- Además, 4 de otras generaciones con modelo de Switch de [Unborne-Fetus/Pokedex-3D-Models-Animations](https://github.com/Unborne-Fetus/Pokedex-3D-Models-Animations): Kingdra (230), Ho-Oh (250), Zorua (570) y Zoroark (571) (Lugia se probó y se volvió al modelo de Pokemon-3D-api, que se ve mejor). Llegan sin animaciones: los 7 clips se generan sobre su esqueleto (`synthClips`, con los nombres de huesos de Switch traducidos por `svName`). Se quitaron los LOD 1-3, texturas WebP a 512 px y Draco: 60–170 KB cada uno.
- Del resto de ese repositorio, casi todos los modelos de 2.ª a 9.ª gen traen la textura en blanco (el color de Switch va en capas del shader que no se exportaron): por eso no se usan. Se comprobó midiendo la saturación de cada textura.
- Optimizados con `.claude/skills/pokemon-data-asset-pipeline/scripts/optimizar-modelo.mjs`: se quitan las pistas de los huesos que no se mueven en ningún clip (76.000 → 21.000 pistas en total), fotogramas redundantes y algo de precisión de Draco (posición 12 bits, normales 8). Se ven igual; pesan un 36 % menos (38 → 24 MB; por la red, con Brotli, 19 → 15 MB) y el navegador los prepara mucho antes.

- **152 (Chikorita)**: único modelo con clips hechos a mano en Blender (los 5 clips sobre el esqueleto del modelo de Pokemon-3D-api; ver `crear-clips-blender.py`). Sin las lianas del cuello del modelo original (estaban mal modeladas), que se quitan en el propio script.
