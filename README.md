# My Own Geometry Dash

A browser-based recreation of the original Pygame prototype using an HTML5 canvas game loop. The project no longer depends on Python or Pygame; everything runs directly inside the browser.

## Getting started

1. Install a small static file server if you do not already have one. For example:

   ```bash
   npm install --global serve
   ```

2. Serve the `web/` directory:

   ```bash
   serve web/
   ```

3. Open the URL printed by the server (commonly <http://localhost:3000>) in your browser. The game will load automatically once the assets are decoded.

## Controls

- **Space / W / Up Arrow / Z** – Jump.
- **Mouse / touch hold** – Jump (hold while touching orbs to trigger them).
- **R** – Restart the current run immediately.

The game scrolls automatically. Hit boosters to speed up, use orbs for extra air time, and watch out for spikes and gravity portals.

## Project structure

- `web/index.html` – Base HTML page and canvas element.
- `web/styles.css` – Full-viewport styling.
- `web/main.js` – RequestAnimationFrame loop, player physics, parallax background, reusable level segments, and HUD rendering.

All legacy Python sources under `src/geometry_dash_like/` have been retired in favour of the new browser build.
