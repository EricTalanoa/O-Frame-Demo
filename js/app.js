/* O-Frame v0.2 — interactive ambient map + photo-deck slideshow.
 *
 * Flow: world view (dwell) -> flyTo a trip pin -> photo deck of that trip's
 * showcase photos (current card dominant, prev/next peeking at the sides) ->
 * zoom back out -> next trip.
 *
 * Interaction: pan/zoom the map freely (the loop holds and resumes after
 * idle), click a pin to show that trip now, swipe / click the peeking cards /
 * arrow keys to move through photos. Keyboard: space = pause/resume,
 * n = skip ahead, o = toggle order mode, f = fullscreen.
 *
 * With `node server.js` running, trips uploaded from the phone are merged in
 * and re-checked periodically; without a server the bundled js/trips.js data
 * is used alone (file:// still works).
 */
(function () {
  'use strict';

  const cfg = window.CONFIG;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let trips = window.TRIPS.slice();

  const el = {
    slideshow: document.getElementById('slideshow'),
    caption: document.getElementById('caption'),
    captionName: document.querySelector('#caption .trip-name'),
    captionMeta: document.querySelector('#caption .trip-meta'),
    toast: document.getElementById('toast'),
  };
  const root = document.documentElement.style;
  root.setProperty('--fade', cfg.crossfadeSeconds + 's');
  root.setProperty('--deck-card-w', cfg.deck.cardWidthVw + 'vw');
  root.setProperty('--deck-side-scale', cfg.deck.sideScale);
  root.setProperty('--deck-kb-scale', cfg.deck.kenBurnsScale);
  // Side cards sit just inside the viewport edge: half the viewport plus half
  // a scaled card, pulled back in by the configured peek.
  root.setProperty('--deck-shift',
    50 + (cfg.deck.cardWidthVw / 2) * cfg.deck.sideScale - cfg.deck.peekVw + 'vw');
  root.setProperty('--kb-duration', cfg.photoSeconds + cfg.crossfadeSeconds + 's');

  // ---------------------------------------------------------------- map style

  // Pull a color toward the muted parchment tone: desaturate, then warm-tint.
  function muteColor(str) {
    const rgba = parseColor(str);
    if (!rgba) return str;
    let [r, g, b, a] = rgba;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const d = cfg.palette.muteMix;
    r += (lum - r) * d;
    g += (lum - g) * d;
    b += (lum - b) * d;
    const tint = 0.22;
    const [tr, tg, tb] = cfg.palette.muteTone;
    r *= 1 - tint + (tint * tr) / 255;
    g *= 1 - tint + (tint * tg) / 255;
    b *= 1 - tint + (tint * tb) / 255;
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
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

  function muteStyle(style) {
    // Wall art, not an atlas: drop the label layers (all text/icon symbols)
    // unless labels are explicitly enabled.
    if (!cfg.showLabels) {
      style.layers = (style.layers || []).filter((l) => l.type !== 'symbol');
    }
    for (const layer of style.layers || []) {
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

  // Offline / local-first fallback: muted world polygons from the bundled
  // Natural Earth GeoJSON. No network, no glyphs, no tiles.
  function fallbackStyle() {
    const p = cfg.palette;
    return {
      version: 8,
      sources: {
        world: { type: 'geojson', data: window.WORLD_GEOJSON, attribution: 'Natural Earth' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': p.ocean } },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': p.land } },
        {
          id: 'borders', type: 'line', source: 'world',
          paint: { 'line-color': p.border, 'line-width': 0.6, 'line-opacity': 0.55 },
        },
      ],
    };
  }

  let usingFallbackStyle = false;

  async function loadStyle() {
    try {
      const res = await fetch(cfg.styleUrl);
      if (!res.ok) throw new Error('style fetch failed: ' + res.status);
      return muteStyle(await res.json());
    } catch (err) {
      console.warn('[o-frame] remote style unavailable, using offline fallback —', err.message);
      usingFallbackStyle = true;
      return fallbackStyle();
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
    inSlideshow: false,
    deckIndex: 0,
    deckLength: 0,
    activeMarkerEl: null,
    tripsDirty: false,
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

  function buildDeck(trip, photos) {
    el.slideshow.textContent = '';
    deckCards = photos.map((photo, i) => {
      const card = document.createElement('div');
      card.className = 'card card--off-right';
      const img = document.createElement('img');
      img.src = `photos/${trip.slug}/${photo.file}`;
      img.alt = '';
      card.appendChild(img);
      card.addEventListener('click', () => {
        if (card.classList.contains('card--prev')) deckGo(-1);
        else if (card.classList.contains('card--next')) deckGo(1);
      });
      el.slideshow.appendChild(card);
      return card;
    });
  }

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
    state.deckLength = photos.length;
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
    const res = await fetch('/api/trips', { cache: 'no-store' });
    if (!res.ok) throw new Error('trips fetch failed: ' + res.status);
    return (await res.json()).trips || [];
  }

  // Server trips override bundled samples with the same slug, else append.
  function mergeTrips(bundled, server) {
    const bySlug = new Map(bundled.map((t) => [t.slug, t]));
    for (const t of server) bySlug.set(t.slug, t);
    return [...bySlug.values()];
  }

  async function refreshTrips() {
    try {
      const merged = mergeTrips(window.TRIPS, await fetchServerTrips());
      if (JSON.stringify(merged) !== JSON.stringify(trips)) {
        trips = merged;
        state.tripsDirty = true;
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

  // Pin click: break out of whatever the loop is doing and show this trip.
  function showTripNow(slug) {
    if (state.inSlideshow) return;
    state.forcedSlug = slug;
    state.userHold = false;
    state.paused = false;
    skip();
  }

  async function ambientLoop() {
    rebuildQueue();
    while (true) {
      if (state.tripsDirty) {
        state.tripsDirty = false;
        buildMarkers();
        rebuildQueue();
        toast('Trips updated');
      }
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
        await flyAndWait({ center: cfg.world.center, zoom: cfg.world.zoom });
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
    try {
      trips = mergeTrips(window.TRIPS, await fetchServerTrips());
    } catch {
      /* no server running — bundled data only */
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

    map.once('load', () => {
      window.__oframe = { map, state }; // hook for automated smoke tests
      window.__oframeReady = true;
      ambientLoop();
    });
  }

  boot();
})();
