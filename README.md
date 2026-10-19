# Poké Tactics

Autochess de Pokémon al estilo Teamfight Tactics, con modo solitario contra bots y multijugador por salas.
Fangame gratuito y sin ánimo de lucro. Los sprites se cargan desde [PokeAPI/sprites](https://github.com/PokeAPI/sprites).

## Cómo está hecho

```
poke-tactics/
├── server.js          Servidor Node.js + Socket.io: salas y partidas
├── auth.js            Cuentas: registro, login, sesiones por cookie
├── db.js              Guarda cuentas en PostgreSQL (o en data/db.json en local)
├── public/
│   ├── index.html     Interfaz del juego
│   ├── board3d.js     Tablero 3D: arenas, modelos de los Pokémon y efectos (three.js, solo navegador)
│   └── game.js        Motor del juego (lo usan el navegador Y el servidor)
├── test/smoke.js      Prueba automática: 2 jugadores juegan 12 rondas
├── render.yaml        Configuración para Render
└── package.json
```

- **Tablero 3D**: el tablero, las arenas y los Pokémon se pintan en 3D con [three.js](https://threejs.org)
  (se carga desde jsDelivr, no hace falta instalar nada). Los modelos de los Pokémon salen de
  [Pokemon-3D-api](https://github.com/Pokemon-3D-api/assets) y se descargan según hacen falta.
- **Solitario**: todo se ejecuta en el navegador.
- **Multijugador**: el servidor es quien manda. Cada sala ejecuta su propia copia del motor
  (`public/game.js`) aislada en el servidor; los jugadores solo envían acciones (comprar, mover, listo…)
  y reciben su estado. Los combates usan una semilla compartida, así que el servidor y cada jugador
  calculan exactamente el mismo resultado.
- Si un jugador se desconecta, un bot sigue jugando por él. Las salas vacías se cierran solas.
- **Cuentas**: hace falta usuario y contraseña para jugar. Cada cuenta guarda su entrenador
  (estratega), sus opciones y sus estadísticas (partidas, victorias, top 4, mejor puesto).
  Las contraseñas se guardan con scrypt y la sesión va en una cookie `HttpOnly`.

## Probarlo en tu ordenador

Necesitas [Node.js 18 o superior](https://nodejs.org).

```bash
npm install
npm start
```

Abre <http://localhost:3000>. Para probar el multijugador, abre una segunda pestaña.

Prueba automática (levanta el servidor, conecta 2 jugadores y juega 12 rondas):

```bash
npm test
```

## Subirlo a GitHub

1. Crea un repositorio vacío en <https://github.com/new> (por ejemplo `poke-tactics`), sin README ni .gitignore.
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Poké Tactics v1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/poke-tactics.git
git push -u origin main
```

## Desplegarlo en Render (gratis)

1. Entra en <https://dashboard.render.com> e inicia sesión con tu cuenta de GitHub.
2. Pulsa **New → Blueprint** y elige el repositorio `poke-tactics`.
   Render lee `render.yaml` y lo configura todo solo (Node 20, `npm install`, `npm start`, comprobación en `/health`).
   - Alternativa manual: **New → Web Service** → elige el repo → Runtime *Node*, Build `npm install`,
     Start `npm start`, plan *Free*.
3. Pulsa **Apply / Create** y espera 2–3 minutos. Tendrás una dirección tipo
   `https://poke-tactics.onrender.com`. Esa es la que compartes con tus amigos.

Cada vez que hagas `git push` a `main`, Render vuelve a desplegar solo.

### Base de datos para las cuentas (Neon, gratis)

En el plan gratis de Render los archivos del servidor se borran en cada despliegue, así que las
cuentas se guardan en una base de datos PostgreSQL de [Neon](https://neon.tech):

1. Crea una cuenta en <https://neon.tech> y un proyecto nuevo (región: la más cercana a tu Render).
2. En **Connection string** copia la URL que empieza por `postgresql://…` (con `?sslmode=require`).
3. En Render: tu servicio → **Environment** → **Add Environment Variable**:
   `DATABASE_URL` = la URL que copiaste. Guarda: Render redespliega solo.

Las tablas se crean solas al arrancar. En tu ordenador, sin `DATABASE_URL`, las cuentas se
guardan en `data/db.json` (no se sube a GitHub).

### A tener en cuenta con el plan gratuito

- El servidor **se duerme tras 15 minutos sin visitas** y tarda ~30–50 s en despertar con la primera visita.
- Al redesplegar o dormirse se pierden las partidas en curso (las cuentas no: están en Neon).
- Si lo juega más gente, cambia a un plan de pago en Render (o mueve el mismo código a Railway): no hay que tocar nada.

## Variables de entorno opcionales

| Variable    | Por defecto | Para qué sirve                    |
|-------------|-------------|-----------------------------------|
| `PORT`      | 3000        | Render la pone automáticamente    |
| `MAX_ROOMS` | 50          | Máximo de salas simultáneas       |
| `DATABASE_URL` | —        | PostgreSQL para las cuentas (Neon) |

## Aviso legal

Pokémon y sus personajes son marcas de Nintendo, Game Freak y The Pokémon Company.
Este proyecto es un fangame gratuito sin afiliación oficial. La música es original.
Sprites de Pokémon y objetos: PokeAPI/sprites. Sprites de entrenadores: Pokémon Showdown.
Modelos 3D de los Pokémon: recopilados por Pokemon-3D-api (propiedad de Nintendo, Creatures Inc. y GAME FREAK inc.).
