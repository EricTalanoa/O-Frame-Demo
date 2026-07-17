# O-Frame

A wall-mounted digital world map that displays your travel history. Pins mark
every trip; the map periodically "comes alive" — flying into a pinned location
and cycling through photos from that trip before pulling back out to the world
view. Part digital photo frame, part travel journal, part wall art.

**This repo is the v0.1 demo**: the core ambient loop in a browser, no
hardware, no backend.

## Run it

```
npx serve
```

then open http://localhost:3000 in Chrome (press `f` for fullscreen). Opening
`index.html` directly also works — there is no build step.

Optional keys: `space` pause · `n` skip ahead · `o` toggle shuffle vs.
"walk through time" · `f` fullscreen.

## Add your own trips

Edit `js/trips.js` and drop photos into `photos/<trip-slug>/`. Timings and
order mode live in `js/config.js`. The bundled sample trips use generated
placeholder art.

See `CLAUDE.md` for the project vision, data model, and roadmap.
