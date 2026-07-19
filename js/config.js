// All timings and behavior live here — nothing is hard-coded elsewhere.
window.CONFIG = {
  // 'shuffle' (default) or 'chronological' ("walk through time")
  orderMode: 'shuffle',

  // Map interactivity: pan/zoom and pin clicks are enabled; the ambient loop
  // holds while someone is exploring and resumes after this much idle time.
  interactIdleSeconds: 45,

  // No place-name labels — the map should read as wall art, not an atlas.
  showLabels: false,

  // When a server is running (node server.js), the frame re-checks it for
  // newly uploaded trips this often (seconds).
  tripsRefreshSeconds: 120,

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

  // Photo deck (the slideshow): current card takes most of the screen and
  // sizes itself to each photo's aspect ratio; previous/next peek in from
  // the sides.
  deck: {
    cardWidthVw: 68,       // max width of the current card
    cardHeightVh: 76,      // max height of the current card
    peekVw: 8,             // how much of the prev/next cards stays visible
    sideScale: 0.88,       // scale of the peeking cards
    kenBurnsScale: 1.07,   // slow zoom on the current card's photo
    swipePx: 60,           // drag distance that counts as a swipe
  },

  // Map style: remote vector tiles when online, bundled world GeoJSON
  // otherwise. Both get recolored to the active theme.
  styleUrl: 'https://tiles.openfreemap.org/styles/positron',

  // ------------------------------------------------------------------ themes
  // Press `t` on the frame to cycle; the choice is remembered (localStorage).
  // Each theme styles the map (ocean/land/borders), the pins, and the deck.
  //   muteMix/muteTone control how the online vector style is pulled toward
  //   the theme; `darken` scales it for dark themes. The offline fallback map
  //   is built from ocean/land/border/coast directly.
  theme: 'ink',
  themes: {
    // Deep ink ocean, parchment land — the original look.
    ink: {
      ocean: '#22333e', land: '#d8cfc0', border: '#8f867a', coast: '#e8dcc8',
      pin: '#c94f4f', wishlist: '#5f8fa8',
      card: '#f3ede2', text: '#f3ede2', backdrop: 'rgba(10, 14, 18, 0.78)',
      muteMix: 0.55, muteTone: [216, 207, 192], darken: 1,
    },
    // Aged atlas: warm paper sea, sepia land, ochre pins.
    atlas: {
      ocean: '#c9bda1', land: '#eadfc3', border: '#a28f6c', coast: '#8a7a58',
      pin: '#8a4f34', wishlist: '#4f6f68',
      card: '#f6efdd', text: '#f2e8d2', backdrop: 'rgba(46, 38, 26, 0.82)',
      muteMix: 0.6, muteTone: [232, 221, 194], darken: 1,
    },
    // Midnight: near-black chart, slate land, brass pins.
    midnight: {
      ocean: '#0c111c', land: '#2a3245', border: '#48546e', coast: '#3a4257',
      pin: '#e0a458', wishlist: '#6fa8bf',
      card: '#e9e5da', text: '#e9e5da', backdrop: 'rgba(4, 6, 12, 0.82)',
      muteMix: 0.6, muteTone: [70, 80, 100], darken: 0.42,
    },
    // Porcelain: pale gallery-wall minimalism.
    porcelain: {
      ocean: '#d7dee2', land: '#f6f3ec', border: '#b9b1a4', coast: '#a8b4ba',
      pin: '#c94f4f', wishlist: '#7292a4',
      card: '#ffffff', text: '#33404a', backdrop: 'rgba(228, 232, 234, 0.86)',
      muteMix: 0.5, muteTone: [242, 239, 232], darken: 1,
    },
  },
};

// The active palette (app.js switches CONFIG.theme at runtime).
Object.defineProperty(window.CONFIG, 'palette', {
  get() { return this.themes[this.theme] || this.themes.ink; },
});
