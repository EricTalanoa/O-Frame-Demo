/* Upload page: create a trip, drop its pin on a map, send photos.
 * Talks to the API in server.js; see CLAUDE.md for the data model. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const status = $('status');

  // Location picker map — same offline-safe approach as the frame.
  const p = window.CONFIG.palette;
  const map = new maplibregl.Map({
    container: 'picker',
    style: {
      version: 8,
      sources: { world: { type: 'geojson', data: window.WORLD_GEOJSON, attribution: 'Natural Earth' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': p.ocean } },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': p.land } },
        { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': p.border, 'line-width': 0.6, 'line-opacity': 0.55 } },
      ],
    },
    center: [12, 22],
    zoom: 0.8,
    attributionControl: { compact: true },
    dragRotate: false,
    touchPitch: false,
  });

  const dot = document.createElement('div');
  dot.className = 'pin-dot';
  const marker = new maplibregl.Marker({ element: dot });
  let markerSet = false;

  function setPin(lng, lat) {
    marker.setLngLat([lng, lat]);
    if (!markerSet) { marker.addTo(map); markerSet = true; }
    $('lat').value = lat.toFixed(4);
    $('lng').value = lng.toFixed(4);
  }

  map.on('click', (e) => setPin(e.lngLat.lng, e.lngLat.lat));
  for (const id of ['lat', 'lng']) {
    $(id).addEventListener('change', () => {
      const lat = parseFloat($('lat').value);
      const lng = parseFloat($('lng').value);
      if (!isNaN(lat) && !isNaN(lng)) setPin(lng, lat);
    });
  }

  // ------------------------------------------------------------------ submit

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.status + ' ' + res.statusText);
    return body;
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('submit');
    btn.disabled = true;
    status.className = '';
    try {
      const lat = parseFloat($('lat').value);
      const lng = parseFloat($('lng').value);
      status.textContent = 'Creating trip…';
      const { trip } = await api('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('name').value.trim(),
          startDate: $('start').value,
          endDate: $('end').value,
          stops: [{ place: $('place').value.trim(), lat, lng }],
        }),
      });

      const files = [...$('photos').files];
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Uploading photo ${i + 1} of ${files.length}…`;
        await api(`/api/photos?slug=${encodeURIComponent(trip.slug)}&name=${encodeURIComponent(files[i].name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: files[i],
        });
      }

      status.textContent = `Added "${trip.name}" — it's on the frame.`;
      $('form').reset();
      if (markerSet) { marker.remove(); markerSet = false; }
      loadTrips();
    } catch (err) {
      status.className = 'error';
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // -------------------------------------------------------------- trip list

  async function loadTrips() {
    const list = $('trips');
    try {
      const { trips } = await api('/api/trips');
      list.textContent = '';
      if (!trips.length) {
        list.innerHTML = '<div class="trip-item"><span>Nothing uploaded yet.</span></div>';
        return;
      }
      for (const t of trips) {
        const row = document.createElement('div');
        row.className = 'trip-item';
        const info = document.createElement('span');
        info.innerHTML = `${t.name}<small>${t.stops[0]?.place ?? ''} · ${t.photos.length} photo${t.photos.length === 1 ? '' : 's'}</small>`;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = 'Remove';
        del.addEventListener('click', async () => {
          if (!confirm(`Remove "${t.name}" from the frame? Photo files stay on disk.`)) return;
          await api(`/api/trips/${t.slug}`, { method: 'DELETE' });
          loadTrips();
        });
        row.append(info, del);
        list.appendChild(row);
      }
    } catch {
      list.innerHTML = '<div class="trip-item"><span>Server not reachable — run <code>node server.js</code>.</span></div>';
    }
  }

  loadTrips();
})();
