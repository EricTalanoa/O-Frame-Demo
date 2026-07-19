# O-Frame

A wall-mounted digital world map that displays your travel history. Pins mark
every trip; the map periodically "comes alive" — flying into a pinned location
and cycling through photos from that trip before pulling back out to the world
view. Part digital photo frame, part travel journal, part wall art.

**This repo is the v0.1 demo**: the core ambient loop in a browser, no
hardware, no backend.

## Run it

```
node server.js
```

(Node 22+, no dependencies) then open http://localhost:3000 in Chrome (press
`f` for fullscreen). The map is interactive — pan and zoom freely, click a pin
to visit that trip now; the ambient loop resumes after you go idle.

Frame-only mode also works with any static server (`npx serve`) or by opening
`index.html` directly — no build step.

Optional keys: `space` pause · `n` skip ahead · `←`/`→` move through photos ·
`t` cycle theme · `o` toggle shuffle vs. "walk through time" · `f` fullscreen.

Four themes are built in — ink, atlas, midnight, porcelain — press `t` to
cycle; the choice is remembered.

## The remote

Open http://localhost:3000/remote on your phone: pick the theme, pause or
skip, zoom out, switch to "just the map" (no slideshows), fly to any trip,
hide trips without deleting them, group trips into collections (each keeps
its own theme and timing, activate one to show only those trips), and tune
the timings — the frame reacts live, and settings stick across restarts.

Editing a trip on the upload page also shows its photos: bench one from the
slideshow or remove it entirely.

If every trip is in one region, the frame rests zoomed to that region
instead of the whole world; it pulls back automatically once trips span the
globe.

## Add your own trips

Open http://localhost:3000/upload on your phone (or laptop): name the trip,
tap the map to drop the pin, pick photos straight from the camera roll
(HEIC is fine — photos are converted and resized before upload), done — it
shows up on the frame.

**To keep your trips**, commit `data/uploaded-trips.js` and `photos/` — the
server keeps that snapshot in sync with everything you upload, the frame can
run from it without the server, and a fresh clone re-seeds its database
from it.

Or edit `js/trips.js` by hand (wishlist pins live there too). Timings,
behavior, and themes live in `js/config.js`.

See `CLAUDE.md` for the project vision, data model, and roadmap.
