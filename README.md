# Jace Drive Portfolio

A playable portfolio inspired by the interaction model of Bruno Simon's open-source portfolio, rebuilt with original Jace-specific content, world geometry, UI, routes, copy, and assets.

## What it is

The navigation is the game: drive a low-poly car through an isometric world, discover project structures, and interact with them to open real GitHub project portals. The app also includes search/fast travel, a world map, achievements, a timed checkpoint circuit, mobile touch controls, local progress, settings, and a server-backed visitor radio.

## Run

Requires Node.js 20+ and no npm install.

```bash
node server.mjs
# open http://127.0.0.1:4177
```

Optional:

```bash
PORT=8080 node server.mjs
npm test
```

## GitHub Pages

`npm run build:pages` creates the static `dist/` site for the `portfolio-v1` project page. The Pages build serves the interactive portfolio and 4Runner from the repository path. Whispers and lap times are saved in each visitor's browser on Pages; the Node server version keeps its server-backed API and shared persistence.

## Controls

- WASD / arrows: drive
- Shift: boost
- Space: jump
- Enter: interact
- M: map
- /: search
- R: respawn
- H: horn
- L: mute

Touch devices get an on-screen joystick plus boost, jump, and interact controls.

## SEO and routes

Each project has a clean route at `/project/<slug>`. The server injects a project-specific title, description, Open Graph copy, and canonical URL. `/sitemap.xml` is generated from the project catalog and uses the current host.

## API

- `GET /health`
- `GET /api/projects`
- `GET /api/projects/:slug`
- `GET /api/whispers`
- `POST /api/whispers`

Visitor-radio writes are validated, length-limited, rate-limited, and retained as the newest 30 messages in `data/whispers.json`.

## Design note

This project borrows the broad interaction concept of a vehicle-driven portfolio, but does not copy Bruno Simon's source, 3D assets, personal copy, project data, or branded world. It uses an original Three.js world and Jace-specific project structures.

## Vehicle

The playable car is Jace's exact Toyota Showroom **2024 Toyota 4Runner TRD Pro** model (`modsnation_7416_assets_assembled.glb`), served locally with the app. The aftermarket rims and undersized baked-in tires are replaced at the model's four authored mounts with the supplied TRD Pro wheel and BFGoodrich KO3 tire assets; front wheels steer and all four assemblies spin. Three.js, its GLTF/Draco loaders, postprocessing, and Draco decoder are self-hosted so boot does not depend on a CDN or a remote model fallback. If any local vehicle asset cannot be decoded, the game reports that failure and displays its lightweight 4Runner-shaped fallback.
