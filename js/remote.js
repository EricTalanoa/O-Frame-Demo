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

  async function loadTrips() {
    const list = $('trips');
    try {
      const { trips } = await (await fetch('/api/trips')).json();
      list.textContent = '';
      if (!trips.length) {
        list.innerHTML = '<div class="trip"><span>No trips yet — <a href="/upload" style="color:inherit">add one</a>.</span></div>';
        return;
      }
      for (const t of trips) {
        const row = document.createElement('div');
        row.className = 'trip';
        const info = document.createElement('span');
        info.innerHTML = `${t.name}<small>${t.stops[0]?.place ?? ''}</small>`;
        const show = document.createElement('button');
        show.textContent = 'Show';
        show.addEventListener('click', () => send({ type: 'show', slug: t.slug }, `Showing "${t.name}".`));
        row.append(info, show);
        list.appendChild(row);
      }
    } catch {
      list.innerHTML = '<div class="trip"><span>Server not reachable — run <code>node server.js</code>.</span></div>';
    }
  }

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
  })();
})();
