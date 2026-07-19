/* Phone remote: posts commands to the server, which relays them live to the
 * frame over SSE. Settings (theme, order, timings) persist server-side so
 * the frame keeps them after a restart. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const status = $('status');

  async function send(cmd, note) {
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      status.textContent = note || 'Sent.';
    } catch (err) {
      status.textContent = 'Could not reach the frame server: ' + err.message;
    }
  }

  // ---------------------------------------------------------------- playback

  $('pause').addEventListener('click', () => send({ type: 'pause' }, 'Paused.'));
  $('resume').addEventListener('click', () => send({ type: 'resume' }, 'Resumed.'));
  $('next').addEventListener('click', () => send({ type: 'next' }, 'Skipping ahead.'));
  $('zoom-out').addEventListener('click', () => send({ type: 'zoomOut' }, 'Zooming out.'));
  $('map-only').addEventListener('click', () => send({ type: 'mapOnly', on: true }, 'Just the map.'));
  $('map-only-off').addEventListener('click', () => send({ type: 'mapOnly', on: false }, 'Slideshows back on.'));

  // ------------------------------------------------------------------ themes

  const themes = window.CONFIG.themes;
  const themesEl = $('themes');
  for (const [name, p] of Object.entries(themes)) {
    const b = document.createElement('button');
    b.className = 'theme';
    b.dataset.theme = name;
    b.innerHTML = `<div class="sea" style="background:${p.ocean}; --swatch-land:${p.land}"></div>` +
      `<div class="label">${name}</div>`;
    b.addEventListener('click', () => {
      selectTheme(name);
      send({ type: 'theme', name }, `Theme: ${name}.`);
    });
    themesEl.appendChild(b);
  }

  function selectTheme(name) {
    for (const b of themesEl.children) b.classList.toggle('selected', b.dataset.theme === name);
  }

  // ------------------------------------------------------------------- order

  $('order-shuffle').addEventListener('click', () => send({ type: 'order', mode: 'shuffle' }, 'Order: shuffle.'));
  $('order-chrono').addEventListener('click', () => send({ type: 'order', mode: 'chronological' }, 'Order: walk through time.'));

  // ------------------------------------------------------------------- trips

  let allTrips = [];

  async function loadTrips() {
    const list = $('trips');
    try {
      ({ trips: allTrips } = await (await fetch('/api/trips')).json());
      list.textContent = '';
      if (!allTrips.length) {
        list.innerHTML = '<div class="trip"><span>No trips yet — <a href="/upload" style="color:inherit">add one</a>.</span></div>';
        return;
      }
      for (const t of allTrips) {
        const row = document.createElement('div');
        row.className = 'trip' + (t.hidden ? ' hidden-trip' : '');
        const info = document.createElement('span');
        info.innerHTML = `${t.name}<small>${t.stops[0]?.place ?? ''}${t.hidden ? ' · hidden' : ''}</small>`;
        const hide = document.createElement('button');
        hide.textContent = t.hidden ? 'Unhide' : 'Hide';
        hide.addEventListener('click', async () => {
          try {
            await api(`/api/trips/${t.slug}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hidden: !t.hidden }),
            });
            status.textContent = t.hidden ? `"${t.name}" is back on the frame.` : `"${t.name}" hidden (not deleted).`;
            loadTrips();
          } catch (err) {
            status.textContent = err.message;
          }
        });
        const show = document.createElement('button');
        show.textContent = 'Show';
        show.disabled = !!t.hidden;
        show.addEventListener('click', () => send({ type: 'show', slug: t.slug }, `Showing "${t.name}".`));
        row.append(info, hide, show);
        list.appendChild(row);
      }
      renderCollectionPicker();
    } catch {
      list.innerHTML = '<div class="trip"><span>Server not reachable — run <code>node server.js</code>.</span></div>';
    }
  }

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }

  // ------------------------------------------------------------- collections

  async function loadCollections() {
    const box = $('collections');
    try {
      const { collections, active } = await api('/api/collections');
      box.textContent = '';
      const all = document.createElement('button');
      all.className = 'chip' + (active ? '' : ' active');
      all.textContent = 'All trips';
      all.addEventListener('click', async () => {
        await api('/api/collections/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: null }),
        });
        status.textContent = 'Showing all trips.';
        loadCollections();
      });
      box.appendChild(all);
      for (const c of collections) {
        const chip = document.createElement('button');
        chip.className = 'chip' + (c.id === active ? ' active' : '');
        chip.innerHTML = `${c.name} <span style="opacity:.6">(${c.slugs.length})</span> <span class="x">✕</span>`;
        chip.addEventListener('click', async (e) => {
          if (e.target.classList.contains('x')) {
            if (!confirm(`Delete collection "${c.name}"? Trips are not affected.`)) return;
            await api(`/api/collections/${c.id}`, { method: 'DELETE' });
            status.textContent = `Deleted "${c.name}".`;
          } else {
            await api('/api/collections/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: c.id }),
            });
            status.textContent = `Collection "${c.name}" is on the frame.`;
          }
          loadCollections();
        });
        box.appendChild(chip);
      }
    } catch {
      box.textContent = 'Server not reachable.';
    }
  }

  function renderCollectionPicker() {
    const box = $('col-trips');
    box.textContent = '';
    for (const t of allTrips) {
      const label = document.createElement('label');
      label.style.display = 'block';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = t.slug;
      label.append(cb, ' ' + t.name);
      box.appendChild(label);
    }
  }

  $('col-save').addEventListener('click', async () => {
    const name = $('col-name').value.trim();
    const slugs = [...$('col-trips').querySelectorAll('input:checked')].map((c) => c.value);
    if (!name) { status.textContent = 'Give the collection a name.'; return; }
    if (!slugs.length) { status.textContent = 'Pick at least one trip.'; return; }
    try {
      const { settings } = await api('/api/settings');
      await api('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slugs, settings }),
      });
      status.textContent = `Collection "${name}" saved with the current theme & timing.`;
      $('col-name').value = '';
      $('new-collection').open = false;
      loadCollections();
    } catch (err) {
      status.textContent = err.message;
    }
  });

  // ------------------------------------------------------------------ timing

  const dwell = $('dwell');
  const photo = $('photo');

  function showVals() {
    $('dwell-val').textContent = dwell.value + 's';
    $('photo-val').textContent = photo.value + 's';
  }

  let settingsTimer = null;
  function sendSettings() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      send({ type: 'settings', worldDwellSeconds: +dwell.value, photoSeconds: +photo.value }, 'Timing updated.');
    }, 400);
  }

  dwell.addEventListener('input', () => { showVals(); sendSettings(); });
  photo.addEventListener('input', () => { showVals(); sendSettings(); });

  // -------------------------------------------------------------------- boot

  (async function boot() {
    dwell.value = window.CONFIG.worldDwellSeconds;
    photo.value = window.CONFIG.photoSeconds;
    try {
      const { settings } = await (await fetch('/api/settings')).json();
      if (settings.theme) selectTheme(settings.theme);
      else selectTheme(window.CONFIG.theme);
      if (settings.worldDwellSeconds) dwell.value = settings.worldDwellSeconds;
      if (settings.photoSeconds) photo.value = settings.photoSeconds;
    } catch {
      selectTheme(window.CONFIG.theme);
    }
    showVals();
    loadTrips();
    loadCollections();
  })();
})();
