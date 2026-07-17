/* O-Frame v0.1 — ambient map + slideshow loop.
 *
 * Flow: world view (dwell) -> flyTo a trip pin -> full-screen Ken Burns
 * slideshow of that trip's showcase photos -> zoom back out -> next trip.
 *
 * Keyboard (optional, nothing REQUIRES it): space = pause/resume,
 * n = skip ahead, o = toggle order mode, f = fullscreen.
 */
(function () {
  'use strict';

  const cfg = window.CONFIG;
  const trips = window.TRIPS;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = {
    slideshow: document.getElementById('slideshow'),
    slides: [document.getElementById('slide-a'), document.getElementById('slide-b')],
    caption: document.getElementById('caption'),
    captionName: document.querySelector('#caption .trip-name'),
    captionMeta: document.querySelector('#caption .trip-meta'),
    toast: document.getElementById('toast'),
  };
  document.documentElement.style.setProperty('--fade', cfg.crossfadeSeconds + 's');

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
    paused: false,
    skip: null,          // resolver for the active wait, honored by skip()
    orderMode: cfg.orderMode,
    queue: [],
    queuePos: 0,
    lastSlug: null,
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
    if (state.queuePos >= state.queue.length) rebuildQueue();
    const trip = state.queue[state.queuePos++];
    state.lastSlug = trip.slug;
    return trip;
  }

  // Pausable, skippable wait.
  function wait(seconds) {
    return new Promise((resolve) => {
      let remaining = seconds * 1000;
      state.skip = () => { clearInterval(timer); state.skip = null; resolve('skipped'); };
      const timer = setInterval(() => {
        if (state.paused) return;
        remaining -= 100;
        if (remaining <= 0) { clearInterval(timer); state.skip = null; resolve('done'); }
      }, 100);
    });
  }

  function skip() {
    if (state.skip) state.skip();
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

  // ---------------------------------------------------------------- slideshow

  let slideFlip = 0;

  function showPhoto(trip, photo, index) {
    const slide = el.slides[slideFlip];
    const other = el.slides[1 - slideFlip];
    slideFlip = 1 - slideFlip;
    const img = slide.querySelector('img');

    // Fresh node so the Ken Burns transition restarts cleanly each time.
    const fresh = img.cloneNode(false);
    fresh.src = `photos/${trip.slug}/${photo.file}`;
    img.replaceWith(fresh);

    if (!reducedMotion) {
      const origins = ['20% 30%', '80% 30%', '30% 75%', '75% 70%', 'center center'];
      slide.style.setProperty('--kb-origin', origins[index % origins.length]);
      slide.style.setProperty('--kb-scale', cfg.kenBurnsScale);
      slide.style.setProperty('--kb-x', (index % 2 ? 1 : -1) * 1.5 + '%');
      slide.style.setProperty('--kb-y', (index % 3 ? -1 : 1) + '%');
      slide.style.setProperty('--kb-duration', cfg.photoSeconds + cfg.crossfadeSeconds * 2 + 's');
    }

    // Force layout so the transform transition starts from the un-showing state.
    void slide.offsetWidth;
    slide.classList.add('showing');
    other.classList.remove('showing');
  }

  async function runSlideshow(trip) {
    const photos = trip.photos.filter((p) => p.showcase);
    if (!photos.length) return;
    el.slideshow.classList.add('visible');
    for (let i = 0; i < photos.length; i++) {
      showPhoto(trip, photos[i], i);
      await wait(cfg.photoSeconds);
    }
    el.slideshow.classList.remove('visible');
    // let the overlay fade reveal the map again before flying out
    await wait(cfg.crossfadeSeconds);
    el.slides.forEach((s) => s.classList.remove('showing'));
  }

  function preloadTrip(trip) {
    for (const p of trip.photos) {
      if (p.showcase) new Image().src = `photos/${trip.slug}/${p.file}`;
    }
  }

  // -------------------------------------------------------------------- loop

  let map;
  const markersBySlug = {};

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

  async function ambientLoop() {
    rebuildQueue();
    while (true) {
      await wait(cfg.worldDwellSeconds);
      const trip = nextTrip();
      const stop = trip.stops[0]; // v0.1: fly to the first stop
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
      await flyAndWait({ center: cfg.world.center, zoom: cfg.world.zoom });
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
    const style = await loadStyle();
    map = new maplibregl.Map({
      container: 'map',
      style,
      center: cfg.world.center,
      zoom: cfg.world.zoom,
      interactive: false, // the wall does the showing; the phone will do the choosing
      attributionControl: { compact: true },
    });

    // MapLibre positions the marker element itself via CSS transform, so the
    // visible (and animatable) dot lives in a child element.
    function addPin(className, color, lngLat) {
      const wrap = document.createElement('div');
      const dot = document.createElement('div');
      dot.className = 'pin ' + className;
      dot.style.setProperty('--pin-color', color);
      wrap.appendChild(dot);
      new maplibregl.Marker({ element: wrap }).setLngLat(lngLat).addTo(map);
      return dot;
    }

    for (const trip of trips) {
      for (const stop of trip.stops) {
        const dot = addPin('pin--trip', cfg.palette.pin, [stop.lng, stop.lat]);
        if (stop.order === 0) markersBySlug[trip.slug] = dot;
      }
    }
    for (const wish of window.WISHLIST || []) {
      addPin('pin--wishlist', cfg.palette.wishlist, [wish.lng, wish.lat]);
    }

    map.once('load', () => {
      window.__oframeReady = true; // hook for automated smoke tests
      ambientLoop();
    });
  }

  boot();
})();
