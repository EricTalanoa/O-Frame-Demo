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
`o` toggle shuffle vs. "walk through time" · `f` fullscreen.

## Add your own trips

Open http://localhost:3000/upload on your phone (or laptop): name the trip,
tap the map to drop the pin, pick photos, done — it shows up on the frame.
Uploads are stored in `data/oframe.db` + `photos/<slug>/`.

Or edit `js/trips.js` by hand and drop photos into `photos/<trip-slug>/`.
Timings and behavior live in `js/config.js`. The bundled sample trips use
generated placeholder art.

See `CLAUDE.md` for the project vision, data model, and roadmap.
