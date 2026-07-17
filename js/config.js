// All timings and behavior live here — nothing is hard-coded elsewhere.
window.CONFIG = {
  // 'shuffle' (default) or 'chronological' ("walk through time")
  orderMode: 'shuffle',

  // Ambient loop timings (seconds)
  worldDwellSeconds: 10,   // resting on the world view between trips
  arriveHoldSeconds: 2.2,  // hold on the pin after the fly-in, before photos
  photoSeconds: 7,         // each photo is on screen this long
  crossfadeSeconds: 1.6,   // photo-to-photo and overlay fade duration

  // Camera
  world: { center: [12, 22], zoom: 1.6 },
  flyToZoom: 10.5,
  fallbackFlyToZoom: 5.5, // shallower dive when on the offline world map (no street detail)
  flySpeed: 0.45,          // MapLibre flyTo speed — lower = slower, more cinematic
  flyCurve: 1.5,

  // Ken Burns
  kenBurnsScale: 1.14,     // how far each photo drifts/zooms while on screen

  // Map style: remote vector tiles when online, bundled world GeoJSON otherwise.
  styleUrl: 'https://tiles.openfreemap.org/styles/positron',

  // Muted, art-like palette applied to the map (remote style is recolored toward
  // this; the offline fallback is built from it directly).
  palette: {
    ocean: '#22333e',
    land: '#d8cfc0',
    landShade: '#c4b8a4',
    border: '#8f867a',
    muteMix: 0.55,         // 0..1 — how strongly remote style colors pull toward parchment
    muteTone: [216, 207, 192],
    pin: '#c94f4f',        // visited-trip pins
    wishlist: '#5f8fa8',   // wishlist pins (rendered hollow)
  },
};
