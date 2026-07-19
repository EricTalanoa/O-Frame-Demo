/* Upload page: create a trip, drop its pin on a map, send photos.
 *
 * Photos are prepared ON THE PHONE before upload: whatever the picker hands
 * over (HEIC from an iPhone camera roll, a 12MP JPEG, a PNG) is decoded by
 * the browser, downscaled to frame size, and re-encoded as JPEG. The server
 * stays dumb and zero-dependency, uploads are small, and the frame never
 * sees a format it can't display. Each file succeeds or fails on its own.
 *
 * Talks to the API in server.js; see CLAUDE.md for the data model. */
(function () {
  'use strict';

  const MAX_DIMENSION = 2560; // longest edge after resize — plenty for a 4K frame
  const JPEG_QUALITY = 0.85;

  const $ = (id) => document.getElementById(id);
  const status = $('status');

  // Location picker map. Unlike the frame, the picker WANTS labels and
  // street-level detail — you're aiming at a specific lake or town — so it
  // uses the remote style as-is when online, and the bundled world map when
  // offline.
  const p = window.CONFIG.palette;
  function offlinePickerStyle() {
    return {
      version: 8,
      sources: { world: { type: 'geojson', data: window.WORLD_GEOJSON, attribution: 'Natural Earth' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': p.ocean } },
        { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': p.land } },
        { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': p.border, 'line-width': 0.6, 'line-opacity': 0.55 } },
      ],
    };
  }
  const map = new maplibregl.Map({
    container: 'picker',
    style: offlinePickerStyle(),
    center: [12, 22],
    zoom: 0.8,
    attributionControl: { compact: true },
    dragRotate: false,
    touchPitch: false,
  });
  fetch(window.CONFIG.styleUrl)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((style) => map.setStyle(style))
    .catch(() => { /* offline — keep the bundled world map */ });

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

  // -------------------------------------------------------- photo preparation

  // Decode via <img> for browsers where createImageBitmap can't take this
  // file. The browser applies EXIF orientation itself when drawing.
  function decodeViaImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('cannot decode this image')); };
      img.src = url;
    });
  }

  // File -> { blob, name } ready to upload: oriented, resized, JPEG.
  async function prepPhoto(file) {
    if (/\.svg$/i.test(file.name)) return { blob: file, name: file.name };
    let source;
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      source = await decodeViaImg(file);
    }
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    if (!w || !h) throw new Error('cannot decode this image');
    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('could not encode JPEG');
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  }

  // ---------------------------------------------------------------- API layer

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.status + ' ' + res.statusText);
    return body;
  }

  // Upload files one at a time; a bad photo doesn't sink the rest.
  async function uploadPhotos(slug, files, report) {
    const failed = [];
    let done = 0;
    for (const file of files) {
      report(`Uploading photo ${done + failed.length + 1} of ${files.length}…`);
      try {
        const { blob, name } = await prepPhoto(file);
        await api(`/api/photos?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob,
        });
        done++;
      } catch (err) {
        failed.push(`${file.name} (${err.message})`);
      }
    }
    return { done, failed };
  }

  function reportUpload(tripName, { done, failed }) {
    if (!failed.length) {
      status.className = '';
      status.textContent = `Added ${done} photo${done === 1 ? '' : 's'} to "${tripName}" — on the frame.`;
    } else {
      status.className = 'error';
      status.textContent =
        `${done} of ${done + failed.length} photos uploaded to "${tripName}". Failed: ${failed.join(', ')}`;
    }
  }

  // ----------------------------------------------------------- submit / edit

  let editSlug = null; // non-null while editing an existing trip

  function exitEdit() {
    editSlug = null;
    $('submit').textContent = 'Add to the frame';
    $('cancel-edit').style.display = 'none';
    $('form').reset();
    if (markerSet) { marker.remove(); markerSet = false; }
  }

  function enterEdit(trip) {
    editSlug = trip.slug;
    $('name').value = trip.name;
    $('start').value = trip.startDate;
    $('end').value = trip.endDate;
    const stop = trip.stops[0] || {};
    $('place').value = stop.place || '';
    if (typeof stop.lat === 'number') {
      setPin(stop.lng, stop.lat);
      map.jumpTo({ center: [stop.lng, stop.lat], zoom: 8 });
    }
    $('submit').textContent = 'Save changes';
    $('cancel-edit').style.display = 'block';
    status.className = '';
    status.textContent = `Editing "${trip.name}" — move the pin or change details, then save.`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('cancel-edit').addEventListener('click', () => { exitEdit(); status.textContent = ''; });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('submit');
    btn.disabled = true;
    status.className = '';
    try {
      const lat = parseFloat($('lat').value);
      const lng = parseFloat($('lng').value);
      const details = {
        name: $('name').value.trim(),
        startDate: $('start').value,
        endDate: $('end').value,
        stops: [{ place: $('place').value.trim(), lat, lng }],
      };
      let trip;
      if (editSlug) {
        status.textContent = 'Saving changes…';
        ({ trip } = await api(`/api/trips/${editSlug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(details),
        }));
      } else {
        status.textContent = 'Creating trip…';
        ({ trip } = await api('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(details),
        }));
      }

      const files = [...$('photos').files];
      const result = await uploadPhotos(trip.slug, files, (msg) => { status.textContent = msg; });
      if (files.length) reportUpload(trip.name, result);
      else status.textContent = editSlug ? `Saved "${trip.name}".` : `Added "${trip.name}" — it's on the frame.`;
      exitEdit();
      loadTrips();
    } catch (err) {
      status.className = 'error';
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // -------------------------------------------------------------- trip list

  // One hidden picker, reused for "Add photos" on any existing trip.
  const addInput = document.createElement('input');
  addInput.type = 'file';
  addInput.accept = 'image/*';
  addInput.multiple = true;
  addInput.style.display = 'none';
  document.body.appendChild(addInput);
  let addTarget = null; // { slug, name }

  addInput.addEventListener('change', async () => {
    if (!addTarget || !addInput.files.length) return;
    const target = addTarget;
    const files = [...addInput.files];
    addInput.value = '';
    status.className = '';
    const result = await uploadPhotos(target.slug, files, (msg) => { status.textContent = msg; });
    reportUpload(target.name, result);
    loadTrips();
  });

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
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'del';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => enterEdit(t));
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'del';
        add.textContent = 'Add photos';
        add.addEventListener('click', () => {
          addTarget = { slug: t.slug, name: t.name };
          addInput.click();
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = 'Remove';
        del.addEventListener('click', async () => {
          if (!confirm(`Remove "${t.name}" from the frame? Photo files stay on disk.`)) return;
          await api(`/api/trips/${t.slug}`, { method: 'DELETE' });
          loadTrips();
        });
        row.append(info, edit, add, del);
        list.appendChild(row);
      }
    } catch {
      list.innerHTML = '<div class="trip-item"><span>Server not reachable — run <code>node server.js</code>.</span></div>';
    }
  }

  loadTrips();
})();
