/* Wanderbuddy: explore your city with a Pokémon partner.
 * Plain JS, no build step. Leaflet for the map, OpenStreetMap (Overpass + Nominatim)
 * for places, PokéAPI for Pokémon data and sprites, localStorage for progress.
 * Personal fan project; Pokémon art is hot-linked from PokéAPI, not bundled. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const DLAT = 0.0005, DLNG = 0.0007;       // fog cell (~55 m)
  const PLAT = 0.01, PLNG = 0.013;          // place-fetch tile (~1.1 km)
  const DISCOVER_RADIUS = 40;               // metres to "find" a place
  const SHOW_UNKNOWN_WITHIN = 450;          // show "?" markers within this range
  const WALK_SPEED = 28;                    // m/s (game speed, not real life)
  const RUN_SPEED = 85;
  const STORE_KEY = 'wanderbuddy.v2';
  const OVERPASS = 'https://overpass-api.de/api/interpreter';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const POKEAPI = 'https://pokeapi.co/api/v2';
  const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const CRY = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
  const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const sprite = {
    thumb: (id) => `${SPR}/${id}.png`,
    art: (id, shiny) => `${SPR}/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`,
    walk: (id, shiny, back) => `${SPR}/other/showdown/${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${id}.gif`,
    walkFallback: (id, shiny, back) => `${SPR}/${back ? 'back/' : ''}${shiny ? 'shiny/' : ''}${id}.png`,
  };

  const CATS = {
    food:    { label: 'Food & drink',    icon: '🥐' },
    water:   { label: 'Water',           icon: '⛲' },
    green:   { label: 'Parks & gardens', icon: '🌳' },
    history: { label: 'History',         icon: '🏛️' },
    art:     { label: 'Art & views',     icon: '🎨' },
    books:   { label: 'Books & museums', icon: '📚' },
    play:    { label: 'Play & sport',    icon: '🛝' },
  };
  // Primary type -> favourite kind of place
  const TYPE_LOVES = {
    fire: 'food', normal: 'food',
    water: 'water', ice: 'water',
    grass: 'green', bug: 'green', poison: 'green',
    rock: 'history', ground: 'history', steel: 'history', dark: 'history',
    psychic: 'books', ghost: 'books',
    fairy: 'art', flying: 'art', dragon: 'art',
    electric: 'play', fighting: 'play',
  };
  const TYPE_COLOR = {
    normal: '#9fa19f', fire: '#e62829', water: '#2980ef', grass: '#3fa129', electric: '#d4a900', ice: '#3dcef3',
    fighting: '#ff8000', poison: '#9141cb', ground: '#915121', flying: '#81b9ef', psychic: '#ef4179', bug: '#91a119',
    rock: '#afa981', ghost: '#704170', dragon: '#5060e1', dark: '#624d4e', steel: '#60a1b8', fairy: '#ef70ef',
  };
  const FEATURED = [
    [25, 'Pikachu'], [1, 'Bulbasaur'], [4, 'Charmander'], [7, 'Squirtle'], [133, 'Eevee'], [6, 'Charizard'],
    [94, 'Gengar'], [143, 'Snorlax'], [54, 'Psyduck'], [39, 'Jigglypuff'], [151, 'Mew'], [150, 'Mewtwo'],
    [197, 'Umbreon'], [175, 'Togepi'], [448, 'Lucario'], [393, 'Piplup'], [700, 'Sylveon'], [906, 'Sprigatito'],
    [909, 'Fuecoco'], [912, 'Quaxly'],
  ];

  // What your partner says. {p} = place name, {n} = Pokémon name.
  const LINES = {
    food:    { love: ['Do you smell that?! {p}! Let\'s go in!', '{p}! I\'m adding this to my snack map.', 'Stop! {p}. We have to.'],
               idle: ['Is it snack time yet?', 'Every street smells different!'] },
    water:   { love: ['Splash! {p}! Can I jump in?', '{p}! The water here is singing.', 'I found {p}! Best day.'],
               idle: ['Puddle radar: active.', 'I can smell the water from here.'] },
    green:   { love: ['{p}! Look at all the green!', 'Can we sit in {p} for a minute?', 'The trees in {p} are saying hi.'],
               idle: ['Slow down, I\'m looking at a leaf.', 'The city is greener than you think.'] },
    history: { love: ['{p}. This place has stories. Lots of them.', 'Read the plaque at {p}. For me.', '{p}! Old things are the best things.'],
               idle: ['This street used to be something else.', 'I like old corners best.'] },
    art:     { love: ['Whoa, {p}! Hold still, I\'m inspired.', '{p}! Look at it! Now look UP.', 'I want to live inside {p}.'],
               idle: ['Let\'s find something tall.', 'Somebody painted that wall. Who?'] },
    books:   { love: ['{p}!! So many things to learn!', 'Can we go into {p}? Five minutes. Ten. An hour.', '{p}. I feel smarter already.'],
               idle: ['I wonder who lives up there.', 'Every block is a new page.'] },
    play:    { love: ['{p}! Race you!', 'Let\'s train at {p}!', '{p}! I have SO much energy right now.'],
               idle: ['I could go all day!', 'Faster! Let\'s run!'] },
  };
  const LIKE_LINES = ['Ooh, {p}.', '{p}. Adding it to the journal.', 'Nice find: {p}.', '{p}? Huh. Neat.'];
  const IDLE_LINES = ['Where to next?', 'Let\'s go somewhere we\'ve never been.', 'I like exploring with you.'];
  const NEW_BLOCK_LINES = ['New street!', 'We\'ve never been here before!', 'The fog\'s lifting!', 'Uncharted territory!'];
  const PET_LINES = ['♡', '*happy {n} noises*', 'Hehe!', 'Again!', 'Let\'s keep going!'];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const defaultState = () => ({
    active: null,          // key into partners
    partners: {},          // key -> { id, species, nick, shiny, types, xp }
    explored: [],
    places: {},            // osm id -> { name, cat, lat, lng, at, by, quote }
    meters: 0,
    lastPos: null,
  });
  let state = load();
  const explored = new Set(state.explored);
  const known = {};                // fetched, undiscovered places
  const fetchedTiles = new Set();
  let fetching = false, nextFetchOK = 0;
  let pos = state.lastPos ? state.lastPos.slice() : null;
  let lastCountedPos = null;
  let followMe = true;
  let saveTimer = null;
  let started = false;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* private mode or corrupt */ }
    return defaultState();
  }
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      state.explored = Array.from(explored);
      state.lastPos = pos;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('Could not save progress'); }
    };
    if (now) write(); else saveTimer = setTimeout(write, 1500);
  }

  const $ = (id) => document.getElementById(id);
  const partner = () => state.partners[state.active];
  const nameOf = (p) => p.nick || p.species;
  const lovesOf = (p) => TYPE_LOVES[(p.types && p.types[0]) || 'normal'] || 'food';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fill = (s, place) => s.replace('{p}', place || '').replace('{n}', partner() ? partner().species : '');
  const pretty = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
    .replace(/^Mr /, 'Mr. ').replace(/ Jr$/, ' Jr.').replace(/^Nidoran F$/, 'Nidoran♀').replace(/^Nidoran M$/, 'Nidoran♂');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------
  const levelFor = (xp) => Math.floor(Math.sqrt(xp / 300)) + 1;
  const xpForLevel = (lv) => 300 * (lv - 1) * (lv - 1);
  function addXP(n) {
    const p = partner(); if (!p) return;
    const before = levelFor(p.xp);
    p.xp += n;
    const after = levelFor(p.xp);
    if (after > before) {
      say(`Friendship level ${after}! I think we make a great team.`, true);
      hop(); cry();
      toast(`💛 ${nameOf(p)} reached friendship ${after}`);
    }
    renderHUD();
  }

  function haversine(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const keyOf = (i, j) => i + ',' + j;

  // ---------------------------------------------------------------------------
  // Map + fog
  // ---------------------------------------------------------------------------
  const map = L.map('map', { zoomControl: false, attributionControl: false, maxZoom: 19, minZoom: 3, keyboard: false })
    .setView(pos || [40.7128, -74.006], pos ? 17 : 12);
  L.tileLayer(TILES, {
    subdomains: 'abcd', maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  }).addTo(map);
  L.control.attribution({ position: 'topright', prefix: false }).addAttribution('<a href="https://leafletjs.com">Leaflet</a>').addTo(map);
  map.on('dragstart', () => { followMe = false; $('btnCenter').classList.remove('on'); });

  const Fog = L.GridLayer.extend({
    createTile(coords) {
      const c = document.createElement('canvas');
      const s = this.getTileSize();
      c.width = s.x; c.height = s.y;
      drawFogTile(c, coords, this._map, s);
      return c;
    },
  });
  const fog = new Fog({ pane: 'overlayPane', zIndex: 300, updateWhenZooming: false }).addTo(map);

  function drawFogTile(canvas, coords, m, size) {
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.fillStyle = 'rgba(27,31,51,0.62)';
    ctx.fillRect(0, 0, size.x, size.y);
    const z = coords.z, nwPt = coords.scaleBy(size);
    const nw = m.unproject(nwPt, z), se = m.unproject(nwPt.add(size), z);
    const i0 = Math.floor(se.lat / DLAT) - 1, i1 = Math.floor(nw.lat / DLAT) + 1;
    const j0 = Math.floor(nw.lng / DLNG) - 1, j1 = Math.floor(se.lng / DLNG) + 1;
    const cells = [];
    if ((i1 - i0 + 1) * (j1 - j0 + 1) <= explored.size) {
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (explored.has(keyOf(i, j))) cells.push([i, j]);
    } else {
      explored.forEach((k) => {
        const p = k.split(','); const i = +p[0], j = +p[1];
        if (i >= i0 && i <= i1 && j >= j0 && j <= j1) cells.push([i, j]);
      });
    }
    if (!cells.length) return;
    ctx.globalCompositeOperation = 'destination-out';
    for (const [i, j] of cells) {
      const a = m.project([(i + 0.5) * DLAT, (j + 0.5) * DLNG], z).subtract(nwPt);
      const b = m.project([(i + 1) * DLAT, (j + 1) * DLNG], z).subtract(nwPt);
      const r = Math.max(2, Math.hypot(b.x - a.x, b.y - a.y) * 1.25);
      const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(a.x - r, a.y - r, r * 2, r * 2);
    }
  }
  function refreshFog(newCells) {
    const tiles = fog._tiles, size = fog.getTileSize();
    for (const k in tiles) {
      const t = tiles[k]; if (!t.el || !t.coords) continue;
      const nwPt = t.coords.scaleBy(size);
      const nw = map.unproject(nwPt, t.coords.z), se = map.unproject(nwPt.add(size), t.coords.z);
      const hit = newCells.some(([i, j]) => {
        const lat = (i + 0.5) * DLAT, lng = (j + 0.5) * DLNG;
        return lat <= nw.lat + 2 * DLAT && lat >= se.lat - 2 * DLAT && lng >= nw.lng - 2 * DLNG && lng <= se.lng + 2 * DLNG;
      });
      if (hit) drawFogTile(t.el, t.coords, map, size);
    }
  }

  // ---------------------------------------------------------------------------
  // Your Pokémon on the map
  // ---------------------------------------------------------------------------
  let meMarker = null, meImg = null;
  let facing = { back: false, flip: false };
  function buildMarker() {
    if (meMarker) meMarker.remove();
    const p = partner();
    const icon = L.divIcon({ className: 'me-marker', html: '<div class="me-inner"><div class="me-shadow"></div><img alt=""></div>', iconSize: [96, 96], iconAnchor: [48, 92] });
    meMarker = L.marker(pos, { icon, zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(map);
    meImg = meMarker.getElement().querySelector('img');
    meImg.onerror = () => {
      // Some Pokémon lack an animated sprite: fall back to the static one.
      const fb = sprite.walkFallback(p.id, p.shiny, facing.back);
      if (meImg.src !== fb) meImg.src = fb;
    };
    // Showdown GIFs are drawn at their native size; scale small ones up a little.
    meImg.onload = () => { const s = Math.min(2, 80 / Math.max(meImg.naturalWidth, meImg.naturalHeight)); meImg.style.width = Math.round(meImg.naturalWidth * Math.max(1, s)) + 'px'; };
    setFacing(false, false, true);
  }
  function setFacing(back, flip, force) {
    if (!meImg) return;
    if (!force && back === facing.back && flip === facing.flip) return;
    const p = partner();
    if (back !== facing.back || force) meImg.src = sprite.walk(p.id, p.shiny, back);
    facing = { back, flip };
    // Front sprites face left; back sprites face right.
    meImg.classList.toggle('flip', back ? !flip : flip);
  }
  function hop() {
    const el = meMarker && meMarker.getElement(); if (!el) return;
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
  }
  let audio = null;
  function cry() {
    const p = partner(); if (!p) return;
    try { audio = new Audio(`${CRY}/${p.id}.ogg`); audio.volume = 0.35; audio.play().catch(() => {}); } catch (e) { /* no audio */ }
  }

  // ---------------------------------------------------------------------------
  // Places
  // ---------------------------------------------------------------------------
  let placeLayer = L.layerGroup().addTo(map);
  let unknownLayer = L.layerGroup().addTo(map);
  function drawPlaces() {
    placeLayer.clearLayers();
    const loves = partner() ? lovesOf(partner()) : null;
    for (const id in state.places) {
      const p = state.places[id];
      const icon = L.divIcon({ className: '', html: `<div class="place-marker${p.cat === loves ? ' loved' : ''}">${CATS[p.cat].icon}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([p.lat, p.lng], { icon, keyboard: false }).bindPopup(`<b>${esc(p.name)}</b><br><i>${esc(p.quote || '')}</i>`).addTo(placeLayer);
    }
  }
  const qIcon = L.divIcon({ className: '', html: '<div class="place-marker unknown">?</div>', iconSize: [30, 30], iconAnchor: [15, 15] });
  function drawUnknown() {
    unknownLayer.clearLayers();
    if (!pos) return;
    for (const id in known) {
      const p = known[id];
      if (Math.abs(p.lat - pos[0]) > 0.006 || Math.abs(p.lng - pos[1]) > 0.008) continue;
      if (haversine(pos, [p.lat, p.lng]) > SHOW_UNKNOWN_WITHIN) continue;
      L.marker([p.lat, p.lng], { icon: qIcon, keyboard: false }).bindPopup('Something\'s here… get closer!').addTo(unknownLayer);
    }
  }

  function categorize(t) {
    const a = t.amenity, l = t.leisure, tr = t.tourism;
    if (/^(restaurant|cafe|bakery|ice_cream|pub|bar|marketplace|food_court)$/.test(a) || /^(bakery|pastry|confectionery|deli)$/.test(t.shop)) return 'food';
    if (/^(fountain|drinking_water)$/.test(a) || t.natural === 'water' || /^(river|canal)$/.test(t.waterway)) return 'water';
    if (/^(park|garden|nature_reserve)$/.test(l)) return 'green';
    if (t.historic) return 'history';
    if (/^(artwork|viewpoint|attraction|gallery)$/.test(tr) || a === 'arts_centre') return 'art';
    if (a === 'library' || tr === 'museum' || t.shop === 'books') return 'books';
    if (/^(playground|sports_centre|pitch|stadium|skatepark)$/.test(l)) return 'play';
    return null;
  }
  function fallbackName(cat, t) {
    return {
      food: 'a little café', water: t.amenity === 'drinking_water' ? 'a water fountain' : t.amenity === 'fountain' ? 'a fountain' : 'some water',
      green: 'a patch of green', history: 'an old landmark', art: t.tourism === 'artwork' ? 'a piece of street art' : 'a cool spot',
      books: 'a place full of books', play: 'a playground',
    }[cat];
  }
  // Places are fetched in ~1 km tiles: entering an unfetched tile loads it plus its neighbours.
  async function maybeFetchPlaces(force) {
    if (!pos || fetching || Date.now() < nextFetchOK) return;
    const ti = Math.floor(pos[0] / PLAT), tj = Math.floor(pos[1] / PLNG);
    if (!force && fetchedTiles.has(keyOf(ti, tj))) return;
    fetching = true;
    const s = ((ti - 1) * PLAT).toFixed(5), n = ((ti + 2) * PLAT).toFixed(5);
    const w = ((tj - 1) * PLNG).toFixed(5), e = ((tj + 2) * PLNG).toFixed(5);
    const bb = `(${s},${w},${n},${e})`;
    const q = `[out:json][timeout:25];(
      nwr${bb}["amenity"~"^(restaurant|cafe|bakery|ice_cream|pub|marketplace|library|arts_centre|fountain)$"]["name"];
      node${bb}["amenity"="fountain"];
      nwr${bb}["shop"~"^(bakery|books)$"]["name"];
      nwr${bb}["leisure"~"^(park|garden|nature_reserve|playground|skatepark)$"];
      nwr${bb}["historic"]["name"];
      nwr${bb}["tourism"~"^(museum|viewpoint|attraction|artwork|gallery)$"];
      nwr${bb}["natural"="water"]["name"];
    );out center 1500;`;
    try {
      const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      let added = 0;
      for (const el of data.elements || []) {
        const t = el.tags || {};
        const cat = categorize(t); if (!cat) continue;
        const id = el.type[0] + el.id;
        if (state.places[id] || known[id]) continue;
        const la = el.lat ?? el.center?.lat, ln = el.lon ?? el.center?.lon;
        if (la == null) continue;
        known[id] = { name: t.name || fallbackName(cat, t), cat, lat: la, lng: ln };
        added++;
      }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) fetchedTiles.add(keyOf(ti + di, tj + dj));
      nextFetchOK = Date.now() + 3000;
      drawUnknown();
      if (force) toast(added ? `Found ${added} new spots around here` : 'No new spots around here');
    } catch (err) {
      nextFetchOK = Date.now() + 20000;
      if (force) toast('Could not reach OpenStreetMap. Try again in a bit.');
    }
    fetching = false;
  }
  function checkDiscoveries() {
    const p = partner(); if (!pos || !p) return;
    const loves = lovesOf(p);
    for (const id in known) {
      const k = known[id];
      if (Math.abs(k.lat - pos[0]) > 0.001) continue;
      if (haversine(pos, [k.lat, k.lng]) > DISCOVER_RADIUS) continue;
      delete known[id];
      const isLove = k.cat === loves;
      const quote = fill(pick(isLove ? LINES[k.cat].love : LIKE_LINES), k.name);
      state.places[id] = Object.assign(k, { at: Date.now(), by: nameOf(p), quote });
      say(quote, true);
      toast(`${CATS[k.cat].icon} Discovered ${k.name}`);
      if (isLove) { hop(); cry(); }
      addXP(isLove ? 150 : 50);
      if (navigator.vibrate) navigator.vibrate(isLove ? [60, 40, 60] : 30);
      drawPlaces(); drawUnknown(); save();
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Movement: joystick, keyboard, tap-to-go
  // ---------------------------------------------------------------------------
  const stickIn = { x: 0, y: 0, active: false };   // y > 0 = north
  const keys = new Set();
  let runToggle = false;
  let target = null, targetMarker = null;

  // Joystick
  const stick = $('stick'), knob = $('knob');
  let stickId = null;
  function stickMove(e) {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 14;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stickIn.x = dx / max; stickIn.y = -dy / max;
  }
  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
    stick.classList.add('active'); stickIn.active = true; clearTarget(); stickMove(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
  const stickEnd = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; stick.classList.remove('active');
    stickIn.active = false; stickIn.x = stickIn.y = 0; knob.style.transform = '';
  };
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);

  // Keyboard
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); clearTarget(); e.preventDefault(); }
    if (e.key === 'Shift') keys.add('run');
  });
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
    if (e.key === 'Shift') keys.delete('run');
  });
  window.addEventListener('blur', () => keys.clear());

  $('btnRun').onclick = () => { runToggle = !runToggle; $('btnRun').classList.toggle('on', runToggle); };

  // Tap the map to walk there
  map.on('click', (e) => {
    if (!started || !pos) return;
    target = [e.latlng.lat, e.latlng.lng];
    if (!targetMarker) targetMarker = L.marker(target, { icon: L.divIcon({ className: '', html: '<div class="target-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), interactive: false, keyboard: false }).addTo(map);
    else targetMarker.setLatLng(target).addTo(map);
    followMe = true; $('btnCenter').classList.add('on');
  });
  function clearTarget() { target = null; if (targetMarker) targetMarker.remove(); }

  let lastFrame = 0, lastLogic = 0, moving = false;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - (lastFrame || t)) / 1000); lastFrame = t;
    if (!started || !pos) return;

    let vx = stickIn.x, vy = stickIn.y;
    if (!stickIn.active) {
      vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      vy = (keys.has('u') ? 1 : 0) - (keys.has('d') ? 1 : 0);
      const m = Math.hypot(vx, vy); if (m > 1) { vx /= m; vy /= m; }
    }
    let mag = Math.hypot(vx, vy);
    let speed = (runToggle || keys.has('run')) ? RUN_SPEED : WALK_SPEED;

    if (mag < 0.15 && target) {
      const dN = (target[0] - pos[0]) * 111320;
      const dE = (target[1] - pos[1]) * 111320 * Math.cos(pos[0] * Math.PI / 180);
      const dist = Math.hypot(dN, dE);
      if (dist > 600) speed = RUN_SPEED;
      if (dist < speed * dt) { pos = target.slice(); clearTarget(); vx = vy = 0; mag = 0; step(0, 0); }
      else { vx = dE / dist; vy = dN / dist; mag = 1; }
    } else if (mag < 0.15) mag = 0;

    if (mag > 0) {
      const v = speed * Math.min(1, mag) * dt / mag;
      step(vy * v, vx * v);
      // Face the way we're going
      if (Math.abs(vy) > Math.abs(vx) * 0.6) setFacing(vy > 0, vx > 0.2);
      else setFacing(false, vx > 0);
      moving = true;
    } else if (moving) { moving = false; setFacing(false, facing.flip); }

    if (t - lastLogic > 100 && moving) { lastLogic = t; onMoved(); }
  }
  function step(north, east) {
    pos[0] += north / 111320;
    pos[1] += east / (111320 * Math.cos(pos[0] * Math.PI / 180));
    meMarker.setLatLng(pos);
    if (followMe) map.setView(pos, map.getZoom(), { animate: false });
  }
  requestAnimationFrame(frame);

  // Game logic, run ~10x/second while moving and after any jump.
  let lastNewBlockLine = 0, lastUnknownDraw = 0;
  function onMoved() {
    if (lastCountedPos) {
      const d = haversine(lastCountedPos, pos);
      if (d < 300) { state.meters += d; addXP(d / 40); }
    }
    lastCountedPos = pos.slice();

    const ci = Math.floor(pos[0] / DLAT), cj = Math.floor(pos[1] / DLNG);
    const fresh = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const k = keyOf(ci + di, cj + dj);
      if (!explored.has(k)) { explored.add(k); fresh.push([ci + di, cj + dj]); }
    }
    if (fresh.length) {
      refreshFog(fresh);
      addXP(fresh.length * 2);
      if (Date.now() - lastNewBlockLine > 40000 && fresh.length >= 3 && Date.now() - lastSpoke > 8000) { say(pick(NEW_BLOCK_LINES)); lastNewBlockLine = Date.now(); }
    }
    checkDiscoveries();
    maybeFetchPlaces(false);
    if (Date.now() - lastUnknownDraw > 700) { drawUnknown(); lastUnknownDraw = Date.now(); }
    renderHUD();
    save();
  }
  function jumpTo(lat, lng, label) {
    clearTarget();
    pos = [lat, lng]; lastCountedPos = null;
    if (meMarker) meMarker.setLatLng(pos);
    followMe = true; $('btnCenter').classList.add('on');
    map.setView(pos, 17, { animate: false });
    if (started) { onMoved(); if (label) say(`${label}! Let's look around.`, true); }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  let lastSpoke = 0;
  function say(text, important) {
    const b = $('bubble');
    b.textContent = text;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    if (important) lastSpoke = Date.now();
  }
  setInterval(() => {
    const p = partner();
    if (!started || !p || Date.now() - lastSpoke < 45000) return;
    say(fill(pick(LINES[lovesOf(p)].idle.concat(IDLE_LINES)))); lastSpoke = Date.now();
  }, 15000);

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function renderHUD() {
    const p = partner(); if (!p) return;
    const lv = levelFor(p.xp), lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
    $('hudName').textContent = nameOf(p) + (p.nick && p.nick !== p.species ? ` (${p.species})` : '') + (p.shiny ? ' ✨' : '');
    $('hudLvl').textContent = `Friend ${lv}`;
    $('xpFill').style.width = Math.round(((p.xp - lo) / (hi - lo)) * 100) + '%';
    $('stCells').textContent = explored.size.toLocaleString();
    $('stKm').textContent = (state.meters / 1000).toFixed(1);
    $('stPlaces').textContent = Object.keys(state.places).length;
    $('stBond').textContent = '♥'.repeat(Math.min(5, Math.ceil(lv / 2))) || '♡';
  }
  function renderPartner() {
    const p = partner();
    $('avatar').innerHTML = `<img src="${sprite.art(p.id, p.shiny)}" alt="">`;
    buildMarker();
    drawPlaces();
    renderHUD();
  }

  function renderJournal() {
    const list = Object.entries(state.places).sort((a, b) => b[1].at - a[1].at);
    const byCat = {};
    list.forEach(([, p]) => { byCat[p.cat] = (byCat[p.cat] || 0) + 1; });
    $('journalSub').textContent = list.length ? Object.entries(byCat).map(([k, n]) => `${CATS[k].icon} ${n}`).join('   ') : '';
    $('journalList').innerHTML = list.length ? list.map(([id, p]) => `
      <div class="entry" data-id="${id}"><div class="ico">${CATS[p.cat].icon}</div><div>
        <div class="t">${esc(p.name)}</div>
        <div class="q">“${esc(p.quote)}” ${p.by ? '— ' + esc(p.by) : ''}</div>
        <div class="d">${new Date(p.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      </div></div>`).join('')
      : '<p class="empty">Nothing yet. Head toward a <b>?</b> on the map to discover it.</p>';
  }
  $('journalList').addEventListener('click', (e) => {
    const en = e.target.closest('.entry'); if (!en) return;
    const p = state.places[en.dataset.id];
    $('journalBg').classList.remove('open');
    followMe = false; $('btnCenter').classList.remove('on');
    map.setView([p.lat, p.lng], 18);
  });

  function openSheet(id) { $(id).classList.add('open'); }
  document.querySelectorAll('.sheet-bg').forEach((bg) => {
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.hasAttribute('data-close')) bg.classList.remove('open'); });
  });

  $('btnCenter').onclick = () => { followMe = true; $('btnCenter').classList.add('on'); if (pos) map.setView(pos, Math.max(map.getZoom(), 16)); };
  $('btnJournal').onclick = () => { renderJournal(); openSheet('journalBg'); };
  $('btnMenu').onclick = () => openSheet('menuBg');
  $('avatar').onclick = () => { say(fill(pick(PET_LINES))); hop(); cry(); };
  $('mSwap').onclick = () => { $('menuBg').classList.remove('open'); openOnboard(); };
  $('mRefresh').onclick = () => { $('menuBg').classList.remove('open'); nextFetchOK = 0; maybeFetchPlaces(true); };
  $('mHere').onclick = () => {
    locateMe((lat, lng) => { $('menuBg').classList.remove('open'); jumpTo(lat, lng, 'Home turf'); });
  };
  $('mReset').onclick = () => {
    if (!confirm('Erase your whole explored map, journal and partners?')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  };

  function locateMe(cb) {
    if (!('geolocation' in navigator)) { toast('This browser can\'t share your location'); return; }
    toast('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => cb(p.coords.latitude, p.coords.longitude),
      () => toast('Location blocked. Search for a place instead.'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  }

  // Place search (Nominatim)
  function wirePlaceSearch(inputId, resultsId, onPick) {
    let timer = null, seq = 0;
    $(inputId).addEventListener('input', () => {
      clearTimeout(timer);
      const q = $(inputId).value.trim();
      if (q.length < 3) { $(resultsId).innerHTML = ''; return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const res = await fetch(`${NOMINATIM}?format=json&limit=5&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
          const list = await res.json();
          if (my !== seq) return;
          $(resultsId).innerHTML = list.length
            ? list.map((r, i) => `<button data-i="${i}">${esc(r.display_name)}</button>`).join('')
            : '<button disabled>No matches</button>';
          $(resultsId).onclick = (e) => {
            const b = e.target.closest('button[data-i]'); if (!b) return;
            const r = list[+b.dataset.i];
            $(resultsId).innerHTML = ''; $(inputId).value = '';
            onPick(+r.lat, +r.lon, r.display_name.split(',')[0]);
          };
        } catch (err) { $(resultsId).innerHTML = '<button disabled>Search unavailable right now</button>'; }
      }, 450);
    });
  }
  wirePlaceSearch('tpSearch', 'tpResults', (lat, lng, label) => { $('menuBg').classList.remove('open'); jumpTo(lat, lng, label); });

  // ---------------------------------------------------------------------------
  // Onboarding: pick a Pokémon + a starting place
  // ---------------------------------------------------------------------------
  let allPokemon = null;      // [[id, slug], ...]
  let sel = null;             // { id, species, types }
  let startPos = null, startLabel = null;
  const typeCache = {};

  async function loadPokemonList() {
    if (allPokemon) return allPokemon;
    try {
      const cached = JSON.parse(localStorage.getItem('wanderbuddy.dex') || 'null');
      if (cached && cached.length > 800) return (allPokemon = cached);
    } catch (e) { /* ignore */ }
    try {
      const res = await fetch(`${POKEAPI}/pokemon-species?limit=1025`);
      const data = await res.json();
      allPokemon = data.results.map((r) => [+r.url.match(/\/(\d+)\/?$/)[1], r.name]);
      try { localStorage.setItem('wanderbuddy.dex', JSON.stringify(allPokemon)); } catch (e) { /* ignore */ }
    } catch (e) { allPokemon = null; }
    return allPokemon;
  }
  function renderPicker(list) {
    $('picker').innerHTML = list.slice(0, 60).map(([id, name]) =>
      `<button class="pick${sel && sel.id === id ? ' sel' : ''}" data-id="${id}" data-name="${esc(name)}"><img class="px" src="${sprite.thumb(id)}" alt="" loading="lazy"><span class="n">${esc(name)}</span></button>`).join('')
      || '<p class="empty" style="grid-column:1/-1">No Pokémon by that name.</p>';
  }
  $('pkSearch').addEventListener('input', async () => {
    const q = $('pkSearch').value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!q) { renderPicker(FEATURED); return; }
    const all = await loadPokemonList();
    if (!all) { renderPicker(FEATURED.filter(([, n]) => n.toLowerCase().includes(q))); return; }
    const num = /^\d+$/.test(q) ? +q : null;
    const hits = all.filter(([id, slug]) => (num ? id === num : slug.includes(q)))
      .sort((a, b) => (a[1].startsWith(q) ? 0 : 1) - (b[1].startsWith(q) ? 0 : 1) || a[0] - b[0]);
    renderPicker(hits.map(([id, slug]) => [id, pretty(slug)]));
  });
  $('picker').addEventListener('click', async (e) => {
    const b = e.target.closest('.pick'); if (!b) return;
    const id = +b.dataset.id, species = b.dataset.name;
    sel = { id, species, types: typeCache[id] || null };
    document.querySelectorAll('.pick').forEach((p) => p.classList.toggle('sel', +p.dataset.id === id));
    const prior = state.partners['pk' + id];
    $('nick').value = prior && prior.nick ? prior.nick : '';
    $('shiny').checked = prior ? !!prior.shiny : $('shiny').checked;
    renderDetail(prior);
    if (!sel.types) {
      try {
        const res = await fetch(`${POKEAPI}/pokemon/${id}`);
        const d = await res.json();
        typeCache[id] = d.types.sort((x, y) => x.slot - y.slot).map((t) => t.type.name);
      } catch (err) { typeCache[id] = ['normal']; }
      if (sel && sel.id === id) { sel.types = typeCache[id]; renderDetail(prior); }
    }
    updateGo();
  });
  $('shiny').addEventListener('change', () => sel && renderDetail(state.partners['pk' + sel.id]));
  function renderDetail(prior) {
    const t = sel.types;
    const loves = t ? CATS[TYPE_LOVES[t[0]] || 'food'] : null;
    $('pickDetail').innerHTML = `<img src="${sprite.art(sel.id, $('shiny').checked)}" alt="">
      <div><b>${esc(sel.species)} <span style="font-weight:400;color:#8a8fa8">#${sel.id}</span></b>
      ${t ? t.map((x) => `<span class="chip" style="background:${TYPE_COLOR[x] || '#888'}">${x}</span>`).join('') : '<span>Loading…</span>'}
      ${loves ? `<br><span>Loves ${loves.icon} ${loves.label.toLowerCase()}.${prior ? ` Friendship ${levelFor(prior.xp)} so far.` : ''}</span>` : ''}</div>`;
  }
  $('useHere').onclick = () => locateMe((lat, lng) => setStart(lat, lng, 'Your current location'));
  wirePlaceSearch('placeSearch', 'placeResults', (lat, lng, label) => setStart(lat, lng, label));
  function setStart(lat, lng, label) {
    startPos = [lat, lng]; startLabel = label;
    $('startLoc').innerHTML = `Starting at <b>${esc(label)}</b>`;
    map.setView(startPos, 15, { animate: false });
    updateGo();
  }
  function updateGo() { $('goBtn').disabled = !(sel && sel.types && (startPos || pos)); }

  function openOnboard() {
    sel = null; startPos = null;
    $('pkSearch').value = ''; $('nick').value = ''; $('shiny').checked = false;
    renderPicker(FEATURED);
    $('pickDetail').innerHTML = '<span>Tap a Pokémon to see what it likes.</span>';
    // Already exploring? Keep your spot unless you want to move.
    $('startWrap').hidden = !!pos;
    $('cancelPick').hidden = !state.active;
    updateGo();
    $('onboard').classList.add('open');
    loadPokemonList();
  }
  $('cancelPick').onclick = () => $('onboard').classList.remove('open');

  $('goBtn').onclick = () => {
    if (!sel || !sel.types) return;
    const key = 'pk' + sel.id;
    const prior = state.partners[key];
    const nick = $('nick').value.trim();
    state.partners[key] = Object.assign(prior || { xp: 0 }, { id: sel.id, species: sel.species, types: sel.types, shiny: $('shiny').checked, nick: nick || '' });
    state.active = key;
    if (startPos) { pos = startPos.slice(); lastCountedPos = null; }
    $('onboard').classList.remove('open');
    save(true);
    const p = partner();
    if (!started) startApp();
    else { renderPartner(); jumpTo(pos[0], pos[1]); }
    say(`${nameOf(p)}! ${prior ? 'Back together again!' : `Let's go! I love ${CATS[lovesOf(p)].label.toLowerCase()} ${CATS[lovesOf(p)].icon}`}`, true);
    cry();
  };

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function startApp() {
    started = true;
    $('hud').hidden = false; $('bottom').hidden = false;
    $('btnCenter').classList.add('on');
    renderPartner();
    jumpTo(pos[0], pos[1]);
  }

  if (state.active && state.partners[state.active] && pos) {
    startApp();
    say(`${nameOf(partner())} is ready. Where to?`, true);
  } else openOnboard();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.wanderbuddy = { get state() { return state; }, explored, known, get pos() { return pos; } };
})();
