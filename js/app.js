/* O-Frame v0.3 — interactive ambient map + photo-deck slideshow + themes.
 *
 * Flow: world view (dwell) -> flyTo a trip pin -> photo deck of that trip's
 * showcase photos (current card dominant, prev/next peeking at the sides) ->
 * zoom back out -> next trip.
 *
 * Interaction: pan/zoom the map freely (the loop holds and resumes after
 * idle), click a pin to show that trip now, swipe / click the peeking cards /
 * arrow keys to move through photos. Keyboard: space = pause/resume,
 * n = skip ahead, t = cycle theme, o = toggle order mode, f = fullscreen.
 *
 * Trips come from three places, merged by slug: hand-written js/trips.js,
 * the committed snapshot data/uploaded-trips.js, and (when `node server.js`
 * is running) the live /api/trips — so the frame works with or without the
 * server, file:// included.
 */
(function () {
  'use strict';

  const cfg = window.CONFIG;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const THEME_KEY = 'oframe-theme';
  const themeNames = Object.keys(cfg.themes);
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme && cfg.themes[savedTheme]) cfg.theme = savedTheme;

  function handTrips() {
    return (window.TRIPS || []).filter((t) => !t.hidden);
  }

  // Serverless/static mode: hand-written trips + the committed snapshot.
  function bundledTrips() {
    return mergeTrips(handTrips(), (window.UPLOADED_TRIPS || []).filter((t) => !t.hidden));
  }

  let trips = bundledTrips();

  const el = {
    slideshow: document.getElementById('slideshow'),
    caption: document.getElementById('caption'),
    captionName: document.querySelector('#caption .trip-name'),
    captionMeta: document.querySelector('#caption .trip-meta'),
    toast: document.getElementById('toast'),
  };
  const root = document.documentElement.style;
  root.setProperty('--fade', cfg.crossfadeSeconds + 's');
  root.setProperty('--deck-peek', cfg.deck.peekVw + 'vw');
  root.setProperty('--deck-side-scale', cfg.deck.sideScale);
  root.setProperty('--deck-kb-scale', cfg.deck.kenBurnsScale);
  root.setProperty('--kb-duration', cfg.photoSeconds + cfg.crossfadeSeconds + 's');

  // ------------------------------------------------------------------ themes

  function applyThemeVars() {
    const p = cfg.palette;
    root.setProperty('--t-ocean', p.ocean);
    root.setProperty('--t-card', p.card);
    root.setProperty('--t-text', p.text);
    root.setProperty('--t-backdrop', p.backdrop);
    // Light text needs a dark glow to stay readable over pale maps; porcelain
    // is the only theme with dark text (and so a light glow).
    const lightText = cfg.theme !== 'porcelain';
    root.setProperty('--t-text-glow', lightText ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)');
    const darkMap = cfg.theme === 'ink' || cfg.theme === 'midnight';
    root.setProperty('--t-vignette', darkMap ? 'rgba(10,14,18,0.32)' : 'rgba(90,88,80,0.22)');
  }

  // ---------------------------------------------------------------- map style

  // Pull a color toward the theme's muted tone: desaturate, warm-tint, and
  // (for dark themes) darken.
  function muteColor(str) {
    const rgba = parseColor(str);
    if (!rgba) return str;
    let [r, g, b, a] = rgba;
    const p = cfg.palette;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const d = p.muteMix;
    r += (lum - r) * d;
    g += (lum - g) * d;
    b += (lum - b) * d;
    const tint = 0.22;
    const [tr, tg, tb] = p.muteTone;
    r *= 1 - tint + (tint * tr) / 255;
    g *= 1 - tint + (tint * tg) / 255;
    b *= 1 - tint + (tint * tb) / 255;
    r *= p.darken; g *= p.darken; b *= p.darken;
    return `rgba(${Math.round(Math.min(255, r))},${Math.round(Math.min(255, g))},${Math.round(Math.min(255, b))},${a})`;
  }

  function parseColor(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    let m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
    m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(',').map(parseFloat);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = s.match(/^hsla?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(',').map(parseFloat);
      const [r, g, b] = hslToRgb(p[0] / 360, p[1] / 100, p[2] / 100);
      return [r, g, b, p.length > 3 ? p[3] : 1];
    }
    return null;
  }

  function hslToRgb(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  // Recurse through paint values (plain colors or style expressions).
  function muteValue(v) {
    if (typeof v === 'string') return parseColor(v) ? muteColor(v) : v;
    if (Array.isArray(v)) return v.map(muteValue);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) out[k] = muteValue(v[k]);
      return out;
    }
    return v;
  }

  function isWaterLayer(layer) {
    const hay = `${layer.id} ${layer['source-layer'] || ''}`.toLowerCase();
    return /water|ocean|marine/.test(hay);
  }

  // Recolor the remote vector style to the active theme: water becomes the
  // theme ocean, everything else is muted toward the theme tone, labels drop.
  function themedRemoteStyle(raw) {
    const style = JSON.parse(JSON.stringify(raw));
    const p = cfg.palette;
    if (!cfg.showLabels) {
      style.layers = (style.layers || []).filter((l) => l.type !== 'symbol');
    }
    for (const layer of style.layers || []) {
      if (isWaterLayer(layer)) {
        layer.paint = layer.paint || {};
        for (const key of Object.keys(layer.paint)) {
          if (key.endsWith('-color')) layer.paint[key] = p.ocean;
        }
        continue;
      }
      if (layer.type === 'background') {
        layer.paint = { ...layer.paint, 'background-color': p.land };
        continue;
      }
      // Administrative boundaries: theme muting washes these out, so pin them
      // to the theme border color — and surface state/province lines at the
      // resting zoom instead of only when deep-zoomed.
      if (layer.type === 'line' && /boundary/.test(`${layer.id} ${layer['source-layer'] || ''}`)) {
        layer.paint = { ...layer.paint, 'line-color': p.border };
        if (cfg.showStateLines && /4|state|province/.test(layer.id + JSON.stringify(layer.filter || ''))) {
          layer.minzoom = Math.min(layer.minzoom ?? 24, cfg.stateLinesMinZoom);
        }
        continue;
      }
      for (const section of ['paint', 'layout']) {
        const props = layer[section];
        if (!props) continue;
        for (const key of Object.keys(props)) {
          if (key.endsWith('-color')) props[key] = muteValue(props[key]);
        }
      }
    }
    return style;
  }

  // Offline / local-first fallback: themed world polygons from the bundled
  // Natural Earth GeoJSON, with a soft coast glow. No network, no tiles.
  function fallbackStyle() {
    const p = cfg.palette;
    const style = {
      version: 8,
      sources: {
        world: { type: 'geojson', data: window.WORLD_GEOJSON, attribution: 'Natural Earth' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': p.ocean } },
        {
          id: 'coast-glow', type: 'line', source: 'world',
          paint: { 'line-color': p.coast, 'line-width': 5, 'line-blur': 8, 'line-opacity': 0.35 },
        },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': p.land } },
        {
          id: 'borders', type: 'line', source: 'world',
          paint: { 'line-color': p.border, 'line-width': 0.6, 'line-opacity': 0.55 },
        },
      ],
    };
    if (cfg.showStateLines && window.US_STATES_GEOJSON) {
      style.sources.usStates = { type: 'geojson', data: window.US_STATES_GEOJSON };
      style.layers.push({
        id: 'state-lines', type: 'line', source: 'usStates', minzoom: cfg.stateLinesMinZoom,
        paint: { 'line-color': p.border, 'line-width': 0.5, 'line-opacity': 0.4 },
      });
    }
    return style;
  }

  let usingFallbackStyle = false;
  let rawRemoteStyle = null;

  async function loadStyle() {
    try {
      const res = await fetch(cfg.styleUrl);
      if (!res.ok) throw new Error('style fetch failed: ' + res.status);
      rawRemoteStyle = await res.json();
      return themedRemoteStyle(rawRemoteStyle);
    } catch (err) {
      console.warn('[o-frame] remote style unavailable, using offline fallback —', err.message);
      usingFallbackStyle = true;
      return fallbackStyle();
    }
  }

  function applyTheme(name) {
    cfg.theme = name;
    localStorage.setItem(THEME_KEY, name);
    applyThemeVars();
    if (map) {
      map.setStyle(usingFallbackStyle ? fallbackStyle() : themedRemoteStyle(rawRemoteStyle), { diff: false });
      buildMarkers();
      if (state.lastSlug && state.activeMarkerEl !== null) setActivePin(state.lastSlug);
    }
  }

  // ------------------------------------------------------------ ambient state

  const state = {
    paused: false,        // explicit pause (space)
    userHold: false,      // someone is exploring the map — loop waits
    skip: null,           // resolver for the active wait, honored by skip()
    orderMode: cfg.orderMode,
    queue: [],
    queuePos: 0,
    lastSlug: null,
    forcedSlug: null,     // pin click: show this trip next
    mapOnly: false,       // remote "just sit on the map" mode
    inSlideshow: false,
    deckIndex: 0,
    activeMarkerEl: null,
  };

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rebuildQueue() {
    if (state.orderMode === 'chronological') {
      state.queue = trips.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
    } else {
      state.queue = shuffled(trips);
      // avoid showing the same trip twice in a row across reshuffles
      if (trips.length > 1 && state.queue[0].slug === state.lastSlug) {
        state.queue.push(state.queue.shift());
      }
    }
    state.queuePos = 0;
  }

  function nextTrip() {
    if (state.forcedSlug) {
      const forced = trips.find((t) => t.slug === state.forcedSlug);
      state.forcedSlug = null;
      if (forced) {
        state.lastSlug = forced.slug;
        return forced;
      }
    }
    if (state.queuePos >= state.queue.length) rebuildQueue();
    const trip = state.queue[state.queuePos++];
    state.lastSlug = trip.slug;
    return trip;
  }

  // Pausable, skippable wait. Holds while paused or while a person is
  // exploring the map.
  function wait(seconds) {
    return new Promise((resolve) => {
      let remaining = seconds * 1000;
      state.skip = () => { clearInterval(timer); state.skip = null; resolve('skipped'); };
      const timer = setInterval(() => {
        if (state.paused || state.userHold) return;
        remaining -= 100;
        if (remaining <= 0) { clearInterval(timer); state.skip = null; resolve('done'); }
      }, 100);
    });
  }

  function skip() {
    if (state.skip) state.skip();
  }

  // Someone touched the map: hold the loop, resume after idle.
  let idleTimer = null;
  function userInteracted() {
    if (state.inSlideshow) return; // deck has its own gestures
    state.userHold = true;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { state.userHold = false; }, cfg.interactIdleSeconds * 1000);
  }

  // --------------------------------------------------------------------- UI

  function formatDates(startISO, endISO) {
    const s = new Date(startISO + 'T00:00:00');
    const e = new Date(endISO + 'T00:00:00');
    const month = (d) => d.toLocaleString('en', { month: 'long' });
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.getDate()}–${e.getDate()} ${month(s)} ${s.getFullYear()}`;
    }
    if (s.getFullYear() === e.getFullYear()) {
      return `${s.getDate()} ${month(s)} – ${e.getDate()} ${month(e)} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${month(s)} ${s.getFullYear()} – ${e.getDate()} ${month(e)} ${e.getFullYear()}`;
  }

  function showCaption(trip, stop) {
    el.captionName.textContent = trip.name;
    el.captionMeta.textContent = `${stop.place} · ${formatDates(trip.startDate, trip.endDate)}`;
    el.caption.classList.add('visible');
  }

  function hideCaption() {
    el.caption.classList.remove('visible');
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 1800);
  }

  // --------------------------------------------------------------- photo deck

  let deckCards = [];

  // Size a card to its photo's aspect ratio, capped by the deck config box —
  // portraits stay portrait instead of being cropped to a landscape card.
  function sizeCard(card, img) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const maxW = (window.innerWidth * cfg.deck.cardWidthVw) / 100;
    const maxH = (window.innerHeight * cfg.deck.cardHeightVh) / 100;
    const ar = img.naturalWidth / img.naturalHeight;
    let w = maxW;
    let h = w / ar;
    if (h > maxH) { h = maxH; w = h * ar; }
    card.style.width = Math.round(w) + 'px';
    card.style.height = Math.round(h) + 'px';
  }

  function buildDeck(trip, photos) {
    el.slideshow.textContent = '';
    deckCards = photos.map((photo) => {
      const card = document.createElement('div');
      card.className = 'card card--off-right';
      const img = document.createElement('img');
      img.src = `photos/${trip.slug}/${photo.file}`;
      img.alt = '';
      if (img.complete) sizeCard(card, img);
      else img.addEventListener('load', () => sizeCard(card, img));
      card.appendChild(img);
      card.addEventListener('click', () => {
        if (card.classList.contains('card--prev')) deckGo(-1);
        else if (card.classList.contains('card--next')) deckGo(1);
      });
      el.slideshow.appendChild(card);
      return card;
    });
  }

  window.addEventListener('resize', () => {
    for (const card of deckCards) {
      const img = card.querySelector('img');
      if (img) sizeCard(card, img);
    }
  });

  function renderDeck(index) {
    deckCards.forEach((card, i) => {
      card.className = 'card ' + (
        i < index - 1 ? 'card--off-left' :
        i === index - 1 ? 'card--prev' :
        i === index ? 'card--current' :
        i === index + 1 ? 'card--next' :
        'card--off-right');
    });
  }

  // Manual navigation while the deck is up. +1 past the last card ends the
  // slideshow (same as letting it play out).
  function deckGo(delta) {
    if (!state.inSlideshow) return;
    const next = state.deckIndex + delta;
    if (next < 0) return;
    state.deckIndex = next;
    skip();
  }

  async function runSlideshow(trip) {
    const photos = trip.photos.filter((p) => p.showcase);
    if (!photos.length) return;
    buildDeck(trip, photos);
    state.inSlideshow = true;
    state.deckIndex = 0;
    el.slideshow.classList.add('visible');
    while (state.deckIndex < photos.length) {
      renderDeck(state.deckIndex);
      const shown = state.deckIndex;
      await wait(cfg.photoSeconds);
      if (state.deckIndex === shown) state.deckIndex++; // auto-advance unless someone navigated
    }
    state.inSlideshow = false;
    el.slideshow.classList.remove('visible');
    // let the overlay fade reveal the map again before flying out
    await wait(cfg.crossfadeSeconds);
    el.slideshow.textContent = '';
    deckCards = [];
  }

  // Swipe on the deck (touch or mouse).
  let swipeStartX = null;
  el.slideshow.addEventListener('pointerdown', (e) => { swipeStartX = e.clientX; });
  el.slideshow.addEventListener('pointerup', (e) => {
    if (swipeStartX === null) return;
    const dx = e.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) >= cfg.deck.swipePx) deckGo(dx < 0 ? 1 : -1);
  });

  function preloadTrip(trip) {
    for (const p of trip.photos) {
      if (p.showcase) new Image().src = `photos/${trip.slug}/${p.file}`;
    }
  }

  // ----------------------------------------------------------- trips loading

  async function fetchServerTrips() {
    // visible=1: the server applies hidden flags and the active collection
    const res = await fetch('/api/trips?visible=1', { cache: 'no-store' });
    if (!res.ok) throw new Error('trips fetch failed: ' + res.status);
    return (await res.json()).trips || [];
  }

  // Later sources override earlier ones with the same slug, else append.
  function mergeTrips(base, extra) {
    const bySlug = new Map(base.map((t) => [t.slug, t]));
    for (const t of extra) bySlug.set(t.slug, t);
    return [...bySlug.values()];
  }

  async function refreshTrips() {
    try {
      const merged = mergeTrips(handTrips(), await fetchServerTrips());
      if (JSON.stringify(merged) !== JSON.stringify(trips)) {
        trips = merged;
        // apply right away — pins, queue, and resting view all track the list
        const hadActive = !!state.activeMarkerEl;
        buildMarkers();
        if (hadActive) setActivePin(state.lastSlug);
        rebuildQueue();
        homeView = computeHomeView();
        toast('Trips updated');
      }
    } catch {
      /* no server running — bundled data only */
    }
  }

  // -------------------------------------------------------------------- loop

  let map;
  let markers = [];
  let markersBySlug = {};

  function flyAndWait(opts) {
    return new Promise((resolve) => {
      map.once('moveend', resolve);
      if (reducedMotion) {
        map.jumpTo({ center: opts.center, zoom: opts.zoom });
      } else {
        map.flyTo({ ...opts, speed: cfg.flySpeed, curve: cfg.flyCurve, essential: false });
      }
    });
  }

  function setActivePin(slug) {
    if (state.activeMarkerEl) state.activeMarkerEl.classList.remove('pin--active');
    state.activeMarkerEl = slug ? markersBySlug[slug] : null;
    if (state.activeMarkerEl) state.activeMarkerEl.classList.add('pin--active');
  }

  // MapLibre positions the marker element itself via CSS transform, so the
  // visible (and animatable) dot lives in a child element.
  function addPin(className, color, lngLat, onClick) {
    const wrap = document.createElement('div');
    const dot = document.createElement('div');
    dot.className = 'pin ' + className;
    dot.style.setProperty('--pin-color', color);
    wrap.appendChild(dot);
    if (onClick) {
      wrap.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    }
    const marker = new maplibregl.Marker({ element: wrap }).setLngLat(lngLat).addTo(map);
    markers.push(marker);
    return dot;
  }

  function buildMarkers() {
    for (const m of markers) m.remove();
    markers = [];
    markersBySlug = {};
    state.activeMarkerEl = null;
    for (const trip of trips) {
      for (const stop of trip.stops) {
        const dot = addPin('pin--trip', cfg.palette.pin, [stop.lng, stop.lat], () => showTripNow(trip.slug));
        if (stop.order === 0) markersBySlug[trip.slug] = dot;
      }
    }
    for (const wish of window.WISHLIST || []) {
      addPin('pin--wishlist', cfg.palette.wishlist, [wish.lng, wish.lat]);
    }
  }

  // Pin click or remote "Show": break out of whatever the loop is doing
  // (mid-slideshow included) and show this trip.
  function showTripNow(slug) {
    state.forcedSlug = slug;
    state.userHold = false;
    state.paused = false;
    if (state.inSlideshow) state.deckIndex = Infinity; // ends the deck loop
    skip();
  }

  // ------------------------------------------------------- home (rest) view
  // If every trip clusters in one region — one state, one country, one
  // continent — the frame rests zoomed to that region instead of the whole
  // world. Falls back to the world view for a global spread or no trips.

  let homeView = cfg.world;

  function computeHomeView() {
    if (!map) return cfg.world;
    const pts = [];
    for (const t of trips) for (const s of t.stops) pts.push([s.lng, s.lat]);
    if (!pts.length) return cfg.world;
    const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
    for (const p of pts) bounds.extend(p);
    const cam = map.cameraForBounds(bounds, { padding: 140, maxZoom: cfg.homeMaxZoom });
    if (!cam) return cfg.world;
    return { center: cam.center, zoom: Math.max(cfg.world.zoom, cam.zoom) };
  }

  // ------------------------------------------------ server settings + remote

  function applySettings(s) {
    if (!s) return;
    if (s.theme && cfg.themes[s.theme] && s.theme !== cfg.theme) applyTheme(s.theme);
    if (s.orderMode && s.orderMode !== state.orderMode) {
      state.orderMode = s.orderMode;
      rebuildQueue();
    }
    if (s.worldDwellSeconds) cfg.worldDwellSeconds = +s.worldDwellSeconds;
    if (s.photoSeconds) {
      cfg.photoSeconds = +s.photoSeconds;
      root.setProperty('--kb-duration', cfg.photoSeconds + cfg.crossfadeSeconds + 's');
    }
  }

  // Live commands from the phone remote, relayed by the server.
  function connectRemote() {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      let cmd;
      try { cmd = JSON.parse(e.data); } catch { return; }
      if (cmd.type === 'theme' && cfg.themes[cmd.name]) {
        applyTheme(cmd.name);
        toast('Theme: ' + cmd.name[0].toUpperCase() + cmd.name.slice(1));
      } else if (cmd.type === 'next') {
        skip();
      } else if (cmd.type === 'pause') {
        state.paused = true;
        toast('Paused');
      } else if (cmd.type === 'resume') {
        state.paused = false;
        state.userHold = false;
        toast('Resumed');
      } else if (cmd.type === 'order' && cmd.mode) {
        state.orderMode = cmd.mode;
        rebuildQueue();
        toast(cmd.mode === 'shuffle' ? 'Order: shuffle' : 'Order: walk through time');
      } else if (cmd.type === 'show' && cmd.slug) {
        showTripNow(cmd.slug);
      } else if (cmd.type === 'zoomOut') {
        goHome();
      } else if (cmd.type === 'mapOnly') {
        setMapOnly(!!cmd.on);
      } else if (cmd.type === 'tripsChanged') {
        refreshTrips();
      } else if (cmd.type === 'settings') {
        applySettings(cmd);
      }
    };
  }

  // Pull back to the resting view right now (remote "Zoom out").
  function goHome() {
    if (state.inSlideshow) {
      state.deckIndex = Infinity;
      skip();
    }
    state.userHold = false;
    map.flyTo({ center: homeView.center, zoom: homeView.zoom, speed: cfg.flySpeed, curve: cfg.flyCurve });
  }

  // "Just sit on the map": no fly-ins, no slideshows, until switched off.
  function setMapOnly(on) {
    state.mapOnly = on;
    toast(on ? 'Map only' : 'Slideshows resumed');
    if (on) goHome();
    else skip();
  }

  async function ambientLoop() {
    rebuildQueue();
    while (true) {
      if (state.mapOnly || !trips.length) { await wait(cfg.worldDwellSeconds); continue; }
      if (!state.forcedSlug) await wait(cfg.worldDwellSeconds);
      const trip = nextTrip();
      const stop = trip.stops[0]; // fly to the first stop
      preloadTrip(trip);

      setActivePin(trip.slug);
      // The offline world map has no city-level detail, so don't dive as deep.
      const zoom = usingFallbackStyle ? Math.min(cfg.flyToZoom, cfg.fallbackFlyToZoom) : cfg.flyToZoom;
      await flyAndWait({ center: [stop.lng, stop.lat], zoom });
      showCaption(trip, stop);
      await wait(cfg.arriveHoldSeconds);

      await runSlideshow(trip);

      hideCaption();
      setActivePin(null);
      if (!state.forcedSlug) {
        await flyAndWait({ center: homeView.center, zoom: homeView.zoom });
      }
    }
  }

  // ---------------------------------------------------------------- controls

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      state.paused = !state.paused;
      toast(state.paused ? 'Paused' : 'Resumed');
    } else if (e.key === 'n') {
      skip();
    } else if (e.key === 'ArrowRight') {
      if (state.inSlideshow) deckGo(1);
    } else if (e.key === 'ArrowLeft') {
      if (state.inSlideshow) deckGo(-1);
    } else if (e.key === 't') {
      const next = themeNames[(themeNames.indexOf(cfg.theme) + 1) % themeNames.length];
      applyTheme(next);
      toast('Theme: ' + next[0].toUpperCase() + next.slice(1));
    } else if (e.key === 'o') {
      state.orderMode = state.orderMode === 'shuffle' ? 'chronological' : 'shuffle';
      rebuildQueue();
      toast(state.orderMode === 'shuffle' ? 'Order: shuffle' : 'Order: walk through time');
    } else if (e.key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
  });

  // -------------------------------------------------------------------- boot

  async function boot() {
    applyThemeVars();
    let serverPresent = false;
    try {
      trips = mergeTrips(handTrips(), await fetchServerTrips());
      serverPresent = true;
      const { settings } = await (await fetch('/api/settings', { cache: 'no-store' })).json();
      applySettings(settings);
    } catch {
      /* no server running — bundled data + local prefs only */
    }

    const style = await loadStyle();
    map = new maplibregl.Map({
      container: 'map',
      style,
      center: cfg.world.center,
      zoom: cfg.world.zoom,
      attributionControl: { compact: true },
      // Pan and zoom, but keep the frame flat: no rotate, no pitch.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();

    // A person exploring holds the ambient loop; it resumes after idle.
    for (const ev of ['dragstart', 'wheel', 'touchstart', 'dblclick']) {
      map.on(ev, userInteracted);
    }

    buildMarkers();
    setInterval(refreshTrips, cfg.tripsRefreshSeconds * 1000);
    if (serverPresent) connectRemote();

    map.once('load', () => {
      homeView = computeHomeView();
      map.jumpTo({ center: homeView.center, zoom: homeView.zoom });
      window.__oframe = { map, state, applyTheme }; // hook for automated smoke tests
      window.__oframeReady = true;
      ambientLoop();
    });
  }

  boot();
})();
