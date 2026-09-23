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

This project borrows the broad interaction concept of a vehicle-driven portfolio, but does not copy Bruno Simon's source, 3D assets, personal copy, project data, or branded world. The implementation is dependency-free Canvas 2D with original isometric rendering and Jace-specific project structures.

## Vehicle

The playable car is Jace's exact Toyota Showroom **2024 Toyota 4Runner TRD Pro** model (`modsnation_7416_assets_assembled.glb`). The app loads that owned GLB from the `jnibarger01/toyota-showroom` repository and renders it with Three.js + Draco. If the remote model or CDN is unavailable, the game fails soft to a lightweight 4Runner-shaped fallback so navigation still works.
