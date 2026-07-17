# O-Frame

A wall-mounted digital world map that displays the owner's travel history. Pins mark
every trip taken; the map periodically "comes alive" — flying/zooming into a pinned
location and cycling through selected photos from that trip before pulling back out
to the world view. Part digital photo frame, part travel journal, part wall art.

**This repo is the v0.1 demo**: prove the core loop in a browser before any hardware.

## Project vision (context for all sessions)

- Final form: large matte display in a frame on a wall, driven by a Pi/mini-PC in
  kiosk mode. This repo only targets a laptop browser for now.
- Interaction priority: (1) phone-as-remote via a local web app, (2) fully ambient/
  automatic. Touch is a distant maybe. Never build features that REQUIRE touch.
- Owner's photos live in iCloud. No iCloud API exists — photos enter via manual
  upload/selection (later: icloudpd sync for auto-detection). Do not build against
  a Google Photos API.
- Design rule: **the wall does the showing, the phone does the choosing.**

## v0.1 scope (build this, nothing more)

A static web app, no backend:

1. Full-screen world map (MapLibre GL JS) with a muted, art-like custom style —
   it should read as wall art, not Google Maps.
2. Trips defined in a plain `trips.js` / `trips.json` data file; sample data with
   3–4 fake trips is fine. Photos are local files in `photos/<trip-slug>/`.
3. Pins rendered for each trip. Wishlist pins render hollow/outlined in a
   distinct color.
4. The ambient loop: world view (dwell) → `flyTo()` a trip pin → full-screen
   slideshow of that trip's photos with slow Ken Burns pan/zoom + caption
   (trip name, place, dates) → zoom back out → next trip.
5. Trip order modes: shuffle (default) and chronological ("walk through time").
6. Runs by opening `index.html` (or `npx serve`) in Chrome fullscreen.

## Architecture decisions (already made — keep these)

- **Web app, single codebase.** Later wrapped in kiosk Chromium on device; a
  second route becomes the phone remote. No Electron, no native apps.
- **Map engine: MapLibre GL JS.** Its `flyTo()` is the cinematic zoom. Style
  with a free vector tile source for the demo; plan for self-hosted PMTiles
  (Protomaps) for offline later.
- **Data model: Trip → Stops → Photos.** A Trip has a name, date range, and one
  or more Stops (lat/lng, place name, order). Photos attach to a trip/stop and
  have a `showcase` flag. Pins derive from Stops; standalone Wishlist pins have
  no photos. Multi-stop trips will later draw dotted routes — model for it now
  even if v0.1 only uses single-stop trips.
- **Local-first.** Everything must work offline with local files. When a backend
  arrives (Phase 2) it's Node or FastAPI + SQLite on the same box.

## Roadmap after v0.1

- Phase 2: small server (SQLite), phone remote page (fly-to buttons, next/pause,
  trip upload from iPhone photo picker), settings (dwell times, order mode).
- Phase 3: EXIF GPS+time clustering to propose trips ("Looks like Portugal,
  May 2019 — add it?"), Walk Through Time film mode with animated routes,
  anniversary bias ("this week in past years").
- Hardware later: matte 4K panel, Pi 5/N100, mmWave presence sensor,
  ambient-light dimming.

## Conventions

- Vanilla JS or a light framework — keep the kiosk footprint small and
  dependency count low.
- All timings/behavior (dwell seconds, slideshow seconds, order mode) live in
  one `config` object, not scattered constants.
- Smooth animation is the product. If a choice trades smoothness for features,
  choose smoothness. Respect `prefers-reduced-motion`.
- Commands: document any build/serve steps here as they're added.
