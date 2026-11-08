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
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];
  const WIKI = 'https://en.wikipedia.org/w/api.php';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const POKEAPI = 'https://pokeapi.co/api/v2';
  const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const CRY = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
  // Free, keyless map layers (attribution required).
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const LAYERS = {
    sat: [
      [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }],
      [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 19, opacity: 0.55 }],
      [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 19 }],
    ],
    street: [
      ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }],
    ],
  };

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
    mine:    { label: 'My spots',        icon: '⭐' },
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

  // What your partner says. {p} = place name, {n} = Pokémon name. Lines are drawn without
  // repeats until most of a pool has been used.
  const LINES = {
    food:    { love: ['Do you smell that?! {p}! Let\'s go in!', '{p}! I\'m adding this to my snack map.', 'Stop! {p}. We have to.',
                      '{p}. My stomach just made a noise.', 'Is {p} open? Please say it\'s open.', 'I\'d walk across town for {p}. Oh wait, we did.',
                      '{p}! Order me one of everything.'],
               like: ['{p}. Smells good from here.', 'Ooh, {p}. Let\'s remember that one for later.', '{p}! Is that where the smell is coming from?', 'Food spot: {p}. Noted.'],
               idle: ['Is it snack time yet?', 'Every street smells different!', 'I\'m not hungry. I\'m just… looking.'] },
    water:   { love: ['Splash! {p}! Can I jump in?', '{p}! The water here is singing.', 'I found {p}! Best day.',
                      '{p}. I could stare at this forever.', 'Water! {p}! Hold my bag.', 'Do you hear that? {p}!'],
               like: ['{p}. Water! Nice.', 'Is that {p}? I can hear it.', '{p}. Good spot to cool off.'],
               idle: ['Puddle radar: active.', 'I can smell the water from here.', 'Is it going to rain? I hope so.'] },
    green:   { love: ['{p}! Look at all the green!', 'Can we sit in {p} for a minute?', 'The trees in {p} are saying hi.',
                      '{p}. Finally, real ground.', 'I want to roll around in {p}.', '{p}! I can breathe again.'],
               like: ['{p}. Lots of shade here.', 'Ooh, {p}. Smells like grass.', '{p}! Somebody\'s taking care of these plants.'],
               idle: ['Slow down, I\'m looking at a leaf.', 'The city is greener than you think.', 'That tree is older than both of us.'] },
    history: { love: ['{p}. This place has stories. Lots of them.', 'Read the plaque at {p}. For me.', '{p}! Old things are the best things.',
                      'People have been coming to {p} for a long time.', '{p}. I can feel it. History.', 'Shh. {p} deserves some respect.'],
               like: ['{p}. This looks old.', 'Wonder how long {p} has been here.', '{p}. Somebody important was here once, probably.'],
               idle: ['This street used to be something else.', 'I like old corners best.', 'Look at the brick on that one.'] },
    art:     { love: ['Whoa, {p}! Hold still, I\'m inspired.', '{p}! Look at it! Now look UP.', 'I want to live inside {p}.',
                      '{p}. Somebody made this on purpose and it shows.', 'Okay, {p} is my new favorite thing.', 'Can we take a picture at {p}?'],
               like: ['{p}! That\'s pretty cool.', 'Look, {p}.', '{p}. Somebody made that on purpose.'],
               idle: ['Let\'s find something tall.', 'Somebody painted that wall. Who?', 'Everything looks better from up high.'] },
    books:   { love: ['{p}!! So many things to learn!', 'Can we go into {p}? Five minutes. Ten. An hour.', '{p}. I feel smarter already.',
                      'Imagine everything inside {p}.', '{p}! Quiet voices. QUIET VOICES.', 'I bet {p} has a book about me.'],
               like: ['{p}. Lots of quiet in there.', 'Hm, {p}. Bet it\'s full of stuff to read.', '{p}. Smart-looking place.'],
               idle: ['I wonder who lives up there.', 'Every block is a new page.', 'Did you know I can read? Sort of.'] },
    play:    { love: ['{p}! Race you!', 'Let\'s train at {p}!', '{p}! I have SO much energy right now.',
                      'Last one to {p} is a Slowpoke!', '{p}. This is where champions are made.', 'Can I go on everything at {p}?'],
               like: ['{p}! Looks fun.', 'Ooh, {p}. Somebody\'s been playing here.', '{p}. I could do a lap.'],
               idle: ['I could go all day!', 'Faster! Let\'s run!', 'Bet I can beat you to the corner.'] },
  };
  const TYPE_TICS = {
    fire: '*tail flares*', water: '*splish*', grass: '*leaves rustle*', electric: '*bzzt*', ice: '*shivers happily*',
    psychic: '*eyes glow*', ghost: '*flickers*', dragon: '*proud roar*', fairy: '*sparkles*', fighting: '*punches the air*',
    rock: '*rumbles*', ground: '*digs a little*', steel: '*clank*', bug: '*antennae twitch*', poison: '*bubbles*',
    flying: '*flaps*', dark: '*grins*', normal: '*bounces*',
  };
  const IDLE_LINES = ['Where to next?', 'Let\'s go somewhere we\'ve never been.', 'I like exploring with you.', 'Which way? You pick.'];
  const NEW_BLOCK_LINES = ['New street!', 'We\'ve never been here before!', 'The fog\'s lifting!', 'Uncharted territory!', 'Ooh, haven\'t seen this block.'];
  const MINE_SAVE_LINES = ['{p}. I\'ll remember this one.', 'Got it. {p} is ours now.', '{p}! I can tell this place matters to you.', 'Marking {p}. Good choice.'];
  const MINE_RETURN_LINES = ['Hey, it\'s {p}! Your spot.', '{p} again. I like coming back here.', 'We\'re at {p}! Remember?'];
  const PET_LINES = ['♡', '*happy {n} noises*', 'Hehe!', 'Again!', 'Let\'s keep going!', 'That tickles!', '*nuzzles*', 'Best partner ever.'];

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
  const recentLines = [];
  function pickFresh(arr) {   // avoid repeating anything said recently
    const fresh = arr.filter((l) => !recentLines.includes(l));
    const line = pick(fresh.length ? fresh : arr);
    recentLines.push(line); if (recentLines.length > 30) recentLines.shift();
    return line;
  }
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
  let baseLayers = [];
  function setMapStyle(style) {
    state.mapStyle = LAYERS[style] ? style : 'sat';
    baseLayers.forEach((l) => l.remove());
    baseLayers = LAYERS[state.mapStyle].map(([url, o]) => L.tileLayer(url, Object.assign({ maxZoom: 19, zIndex: 1 }, o)).addTo(map));
    $('styleName').textContent = state.mapStyle === 'sat' ? 'Satellite' : 'Street map';
  }
  setMapStyle(state.mapStyle || 'sat');
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
  let meMarker = null, meImg = null, meBody = null, meShadow = null, floats = false;
  // Pokémon that hover instead of walk: Flying and Ghost types, plus well-known levitators.
  const FLOATERS = new Set([81, 82, 92, 93, 109, 110, 151, 201, 251, 337, 338, 343, 344, 358, 380, 381, 385, 436, 437, 462, 479, 480, 481, 482, 487, 488, 489, 490, 491, 492, 494, 769, 770, 854, 855]);
  function isFloater(p) { return FLOATERS.has(p.id) || (p.types || []).some((t) => t === 'flying' || t === 'ghost'); }
  // Showdown sprites are idle animations, so add a gait: walkers waddle, floaters bob in the air.
  let gait = 0, gaitAmp = 0;
  function animateGait(t, dt, moving, running) {
    if (!meBody) return;
    const target = moving ? 1 : 0;
    gaitAmp += (target - gaitAmp) * Math.min(1, dt * 8);
    if (floats) {
      const bob = Math.sin(t / 1000 * 2.2);
      const lift = 14 + bob * 5;
      const tilt = moving ? (facing.flip ? 6 : -6) * gaitAmp : 0;
      meBody.style.transform = `translateY(${-lift}px) rotate(${tilt}deg)`;
      meShadow.style.transform = `scale(${0.75 - bob * 0.08})`; meShadow.style.opacity = 0.6;
    } else {
      gait += dt * (running ? 7 : 4.5) * gaitAmp;
      const ph = Math.sin(gait * Math.PI);
      const lift = Math.abs(ph) * (running ? 6 : 3.5) * gaitAmp;
      const sway = ph * (running ? 4 : 7) * gaitAmp;
      meBody.style.transform = `translateY(${-lift}px) rotate(${sway}deg)`;
      meShadow.style.transform = `scale(${1 - lift * 0.03})`; meShadow.style.opacity = 1;
    }
  }
  let facing = { back: false, flip: false };
  function buildMarker() {
    if (meMarker) meMarker.remove();
    const p = partner();
    const icon = L.divIcon({ className: 'me-marker', html: '<div class="me-inner"><div class="me-scale"><div class="me-shadow"></div><div class="me-body"><img alt=""></div></div><div class="say"></div></div>', iconSize: [96, 96], iconAnchor: [48, 92] });
    meMarker = L.marker(pos, { icon, zIndexOffset: 1000, interactive: true, keyboard: false, bubblingMouseEvents: false }).addTo(map);
    meMarker.on('click', pet);
    meImg = meMarker.getElement().querySelector('img');
    meBody = meMarker.getElement().querySelector('.me-body');
    meShadow = meMarker.getElement().querySelector('.me-shadow');
    floats = isFloater(p);
    meImg.onerror = () => {
      // Some Pokémon lack an animated sprite: fall back to the static one.
      const fb = sprite.walkFallback(p.id, p.shiny, facing.back);
      if (meImg.src !== fb) meImg.src = fb;
    };
    // Showdown GIFs are drawn at their native size; scale small ones up a little.
    meImg.onload = () => { const s = Math.min(2, 80 / Math.max(meImg.naturalWidth, meImg.naturalHeight)); meImg.style.width = Math.round(meImg.naturalWidth * Math.max(1, s)) + 'px'; scaleMarker(); };
    if (pendingSay) { say(pendingSay[0], pendingSay[1]); pendingSay = null; }
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
      const html = p.cat === 'mine'
        ? `<b>⭐ ${esc(p.name)}</b>${p.note ? `<br>${esc(p.note)}` : ''}<br><small>Marked ${new Date(p.at).toLocaleDateString()}</small><br><a href="#" class="rm-spot" data-id="${id}">Remove</a>`
        : `<b>${esc(p.name)}</b>${p.desc ? `<br><small>${esc(p.desc)}</small>` : ''}<br><i>${esc(p.quote || '')}</i>`
          + (p.fact ? `<br><small>${esc(p.fact.length > 300 ? p.fact.slice(0, 297) + '…' : p.fact)}</small>` : '')
          + (p.wiki ? `<br><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">Read about it ↗</a>` : '');
      L.marker([p.lat, p.lng], { icon, keyboard: false }).bindPopup(html, { maxWidth: 260 }).addTo(placeLayer);
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
  // Places come from two free, keyless sources, loaded per ~1 km tile as you move:
  //  - Wikipedia's nearby-articles search: reliable; landmarks, parks, museums, famous restaurants.
  //  - OpenStreetMap via Overpass: cafés, fountains, playgrounds, murals. Overpass servers are
  //    often overloaded, so it tries several mirrors and quietly retries later if all fail.
  const WIKI_SKIP = /\b(county|capital|largest city|city in|town in|village in|neighbou?rhood|area in|census|street|alley|road|avenue|boulevard|highway|subway|station|metro|railway|office|agency|company|firm|corporation|court(?!house)|electoral|constituency|school district|human settlement|hospital)\b|^\d{3,4}\b|\b(american|british|english|irish|scottish|canadian|french|german|italian|australian)\s+([a-z-]+\s+)?(writer|politician|actor|actress|singer|painter|photographer|businessman|businesswoman|architect|lawyer|judge|journalist|poet|artist|engineer|footballer|player|author|composer|musician|activist|minister|merchant|physician|educator|historian|sculptor)/i;
  const WIKI_CATS = [
    ['water',   /\b(fountain|river|pond|lake|harbou?r|creek|canal|bay|wharf|pier|beach|reservoir|waterfront|aquarium|waterfall|marina|lagoon)\b/i],
    ['food',    /\b(restaurant|tavern|caf[eé]|coffee\w*|bakery|pub|bar|brewery|brewpub|market|diner|eatery|food hall|bistro|pizzeria|ice cream|winery|distillery)\b/i],
    ['books',   /\b(museum|library|athenaeum|archives?|bookstore|bookshop|university|college|planetarium|science cent(er|re))\b/i],
    ['play',    /\b(stadium|arena|ballpark|playground|sports|rink|skate ?park|velodrome|racetrack|golf|zoo|amusement|theme park)\b/i],
    ['green',   /\b(park|gardens?|common|arboretum|forest|woods|nature|botanical|greenway|meadow|reserve|trail)\b/i],
    ['art',     /\b(theat(er|re)|opera|concert|venue|gallery|sculptures?|statues?|murals?|mosaic|artwork|art|arts|skyscraper|tower|bridge|observation|viewpoint|lookout|plaza|square)\b/i],
    ['history', /\b(historic\w*|memorial|monument|church|chapel|cathedral|basilica|synagogue|mosque|temple|meeting ?house|courthouse|city hall|town hall|state ?house|capitol|lighthouse|fort|fortress|castle|palace|jail|gaol|prison|cemetery|graveyard|burying|burial|landmark|mansion|house|building|hall|mill|battlefield|ruins?|shrine|abbey|monastery|tomb|obelisk|arch)\b/i],
  ];
  function categorizeWiki(title, desc) {
    if (WIKI_SKIP.test(desc || title)) return null;
    const text = title + ' ' + (desc || '');
    for (const [cat, re] of WIKI_CATS) if (re.test(text)) return cat;
    return null;
  }
  const normName = (n) => n.toLowerCase().replace(/\(.*?\)|[^a-z0-9 ]/g, '').replace(/\b(the|of)\b/g, '').replace(/\s+/g, ' ').trim();
  function isDuplicate(pl) {
    const n = normName(pl.name); if (!n) return false;
    const near = (o) => Math.abs(o.lat - pl.lat) < 0.001 && Math.abs(o.lng - pl.lng) < 0.0013;
    const same = (o) => { const m = normName(o.name); return m && (m.includes(n) || n.includes(m)); };
    for (const id in known) if (near(known[id]) && same(known[id])) return true;
    for (const id in state.places) if (near(state.places[id]) && same(state.places[id])) return true;
    return false;
  }
  function addKnown(id, pl) {
    if (state.places[id] || known[id] || isDuplicate(pl)) return false;
    known[id] = pl; return true;
  }
  async function fetchWithTimeout(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({ signal: ctl.signal }, opts)); } finally { clearTimeout(t); }
  }

  const wikiTiles = new Set(), osmTiles = new Set(), wikiFailedAt = {}, osmFailedAt = {};
  let wikiBusy = false, osmBusy = false;

  async function fetchWiki(k, c) {
    wikiBusy = true;
    try {
      const url = `${WIKI}?action=query&generator=geosearch&ggscoord=${c[0].toFixed(5)}|${c[1].toFixed(5)}&ggsradius=850&ggslimit=150`
        + '&prop=coordinates|description&colimit=max&format=json&formatversion=2&origin=*';
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      let added = 0;
      for (const pg of (d.query && d.query.pages) || []) {
        const co = pg.coordinates && pg.coordinates[0]; if (!co) continue;
        const cat = categorizeWiki(pg.title, pg.description || ''); if (!cat) continue;
        const name = pg.title.replace(/ \([^)]*\)$/, '').replace(/, [A-Z][a-z]+( [A-Z][a-z]+)?$/, '');
        if (addKnown('w' + pg.pageid, { name, cat, lat: co.lat, lng: co.lon, wiki: pg.title, pageid: pg.pageid, desc: pg.description || '' })) added++;
      }
      wikiTiles.add(k);
      return added;
    } catch (err) { wikiFailedAt[k] = Date.now(); return -1; } finally { wikiBusy = false; }
  }

  function addOSMElements(list) {
    let added = 0;
    for (const el of list) {
      const t = el.tags || {};
      const cat = categorize(t); if (!cat) continue;
      const la = el.lat ?? el.center?.lat, ln = el.lon ?? el.center?.lon;
      if (la == null) continue;
      if (addKnown(el.type[0] + el.id, { name: t.name || fallbackName(cat, t), cat, lat: la, lng: ln })) added++;
    }
    return added;
  }
  async function overpass(server, q) {
    const res = await fetchWithTimeout(server, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 18000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.elements) throw new Error('bad response');
    return { server, elements: data.elements };
  }
  async function fetchOSM(k, ti, tj) {
    osmBusy = true;
    const S = ti * PLAT, W = tj * PLNG, N = (ti + 1) * PLAT, E = (tj + 1) * PLNG;
    const bb = `(${S.toFixed(5)},${W.toFixed(5)},${N.toFixed(5)},${E.toFixed(5)})`;
    const q = `[out:json][timeout:20];(
      nwr${bb}["amenity"~"^(restaurant|cafe|bakery|ice_cream|pub|marketplace|library|arts_centre|fountain)$"]["name"];
      node${bb}["amenity"="fountain"];
      nwr${bb}["shop"~"^(bakery|books)$"]["name"];
      nwr${bb}["leisure"~"^(park|garden|nature_reserve|playground|skatepark)$"];
      nwr${bb}["historic"]["name"];
      nwr${bb}["tourism"~"^(museum|viewpoint|attraction|artwork|gallery)$"];
      nwr${bb}["natural"="water"]["name"];
    );out center 600;`;
    try {
      // Public Overpass servers come and go. Try the one that worked last, then race the others.
      let best = null; try { best = localStorage.getItem('wanderbuddy.osm'); } catch (e) { /* ignore */ }
      let result = null;
      if (best && OVERPASS.includes(best)) { try { result = await overpass(best, q); } catch (e) { /* fall through */ } }
      if (!result) {
        try { result = await Promise.any(OVERPASS.filter((u) => u !== best).map((u) => overpass(u, q))); } catch (e) { /* all failed */ }
      }
      if (result) {
        try { localStorage.setItem('wanderbuddy.osm', result.server); } catch (e) { /* ignore */ }
        osmTiles.add(k);
        return addOSMElements(result.elements);
      }
      // Last resort: OpenStreetMap's search service, one kind of place at a time (it allows ~1 request/second).
      let added = 0, ok = false;
      for (const kind of ['cafe', 'restaurant', 'park', 'playground', 'library', 'fountain', 'museum', 'bakery']) {
        try {
          const res = await fetchWithTimeout(`${NOMINATIM}?amenity=${kind}&viewbox=${W},${N},${E},${S}&bounded=1&limit=40&format=jsonv2`, {}, 10000);
          if (res.ok) {
            ok = true;
            for (const r of await res.json()) {
              const cat = categorize({ [r.category]: r.type }); if (!cat) continue;
              if (addKnown('n' + r.osm_type[0] + r.osm_id, { name: r.name || fallbackName(cat, { [r.category]: r.type }), cat, lat: +r.lat, lng: +r.lon })) added++;
            }
          }
        } catch (e) { /* skip this kind */ }
        drawUnknown();
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (ok) { osmTiles.add(k); return added; }
      osmFailedAt[k] = Date.now();
      return -1;
    } finally { osmBusy = false; }
  }

  function maybeFetchPlaces(force) {
    if (!pos) return;
    const ti = Math.floor(pos[0] / PLAT), tj = Math.floor(pos[1] / PLNG), k = keyOf(ti, tj);
    if (force) { wikiTiles.delete(k); osmTiles.delete(k); delete wikiFailedAt[k]; delete osmFailedAt[k]; }
    const now = Date.now(), jobs = [];
    if (!wikiBusy && !wikiTiles.has(k) && !(now - (wikiFailedAt[k] || 0) < 15000)) jobs.push(fetchWiki(k, [(ti + 0.5) * PLAT, (tj + 0.5) * PLNG]));
    if (!osmBusy && !osmTiles.has(k) && !(now - (osmFailedAt[k] || 0) < 60000)) jobs.push(fetchOSM(k, ti, tj));
    if (!jobs.length) { if (force) toast('Still looking… try again in a moment'); return; }
    Promise.all(jobs).then((r) => {
      drawUnknown();
      if (!force) return;
      const added = r.filter((n) => n > 0).reduce((a, b) => a + b, 0);
      if (r.every((n) => n < 0)) toast('Couldn\'t load places right now. Try again in a bit.');
      else toast(added ? `Found ${added} new spots around here` : 'No new spots around here');
    });
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
      let quote = fill(pickFresh(isLove ? LINES[k.cat].love : LINES[k.cat].like), k.name);
      const tic = TYPE_TICS[(p.types && p.types[0]) || 'normal'];
      if (isLove && tic && Math.random() < 0.4) quote = tic + ' ' + quote;
      state.places[id] = Object.assign(k, { at: Date.now(), by: nameOf(p), quote });
      say(quote, true);
      toast(`${CATS[k.cat].icon} Discovered ${k.name}`);
      if (isLove) { hop(); cry(); }
      addXP(isLove ? 150 : 50);
      if (navigator.vibrate) navigator.vibrate(isLove ? [60, 40, 60] : 30);
      drawPlaces(); drawUnknown(); save();
      lastFound = id;
      if (k.pageid) loadFact(id);
      return;
    }
    // Back at one of your own spots?
    for (const id in state.places) {
      const m = state.places[id];
      if (m.cat !== 'mine' || Math.abs(m.lat - pos[0]) > 0.001) continue;
      if (haversine(pos, [m.lat, m.lng]) > DISCOVER_RADIUS) continue;
      if (Date.now() - (mineGreeted[id] || 0) < 10 * 60000) continue;
      mineGreeted[id] = Date.now();
      say(fill(pickFresh(MINE_RETURN_LINES), m.name), true); hop();
      return;
    }
  }
  const mineGreeted = {};
  let lastFound = null;
  // A real fact from the Wikipedia article, said a moment after the reaction.
  async function loadFact(id) {
    const pl = state.places[id];
    try {
      const res = await fetchWithTimeout(`${WIKI}?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&pageids=${pl.pageid}&format=json&formatversion=2&origin=*`, {}, 10000);
      const d = await res.json();
      const text = ((d.query && d.query.pages && d.query.pages[0] && d.query.pages[0].extract) || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
      // The first sentence is usually "X is a building in Y"; the next one is often more interesting.
      let fact = (sentences.length > 1 ? sentences[1] : sentences[0]).trim();
      if (fact.length > 190) fact = fact.slice(0, 187).replace(/\s+\S*$/, '') + '…';
      pl.fact = text; save(); drawPlaces();
      // Only say it if nothing newer was found meanwhile; it's kept in the journal either way.
      setTimeout(() => { if (lastFound === id) say('Did you know? ' + fact, true); }, 3800);
    } catch (e) { /* no fact this time */ }
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

  // Mark your own spots: the 📌 button marks where your Pokémon stands; long-press the map to mark anywhere.
  let markAt = null;
  function openMark(latlng, label) {
    markAt = latlng;
    $('markWhere').textContent = label;
    $('markName').value = ''; $('markNote').value = '';
    openSheet('markBg');
    setTimeout(() => $('markName').focus(), 50);
  }
  $('btnMark').onclick = () => { if (pos) openMark(pos.slice(), `Where ${nameOf(partner())} is standing.`); };
  map.on('contextmenu', (e) => { if (started) { clearTarget(); openMark([e.latlng.lat, e.latlng.lng], 'Where you long-pressed the map.'); } });
  $('markSave').onclick = () => {
    const name = $('markName').value.trim() || 'My spot';
    const id = 'm' + Date.now();
    state.places[id] = { name, note: $('markNote').value.trim(), cat: 'mine', lat: markAt[0], lng: markAt[1], at: Date.now(), by: nameOf(partner()) };
    mineGreeted[id] = Date.now();
    $('markBg').classList.remove('open');
    drawPlaces(); renderHUD(); save();
    say(fill(pickFresh(MINE_SAVE_LINES), name), true); hop();
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.rm-spot'); if (!a) return;
    e.preventDefault();
    if (!confirm('Remove this spot?')) return;
    delete state.places[a.dataset.id];
    map.closePopup(); drawPlaces(); renderHUD(); save();
  });

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

    animateGait(t, dt, moving, speed === RUN_SPEED);
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
      if (Date.now() - lastNewBlockLine > 40000 && fresh.length >= 3 && Date.now() - lastSpoke > 8000) { say(pickFresh(NEW_BLOCK_LINES)); lastNewBlockLine = Date.now(); }
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
  let pendingSay = null, sayTimer = null;
  function say(text, important) {
    const b = meMarker && meMarker.getElement() && meMarker.getElement().querySelector('.say');
    if (!b) { pendingSay = [text, important]; return; }
    b.textContent = text;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => b.classList.remove('show'), Math.max(3500, text.length * 70));
    if (important) lastSpoke = Date.now();
  }
  // Shrink the sprite when zoomed out so it doesn't cover whole neighbourhoods.
  function scaleMarker() {
    const el = meMarker && meMarker.getElement(); if (!el) return;
    const z = map.getZoom(), k = z >= 17 ? 1 : Math.max(0.35, 1 - (17 - z) * 0.16);
    el.querySelector('.me-scale').style.transform = `scale(${k})`;
    const h = meImg && meImg.offsetHeight ? meImg.offsetHeight : 64;
    el.querySelector('.say').style.bottom = Math.round(h * k + 2) + 'px';
  }
  map.on('zoomend', scaleMarker);
  function pet() { say(fill(pickFresh(PET_LINES))); hop(); cry(); }
  setInterval(() => {
    const p = partner();
    if (!started || !p || Date.now() - lastSpoke < 45000) return;
    say(fill(pickFresh(LINES[lovesOf(p)].idle.concat(IDLE_LINES)))); lastSpoke = Date.now();
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
  }
  function renderPartner() {
    const p = partner();
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
        <div class="q">${p.cat === 'mine' ? esc(p.note || 'Your spot') : `“${esc(p.quote)}” ${p.by ? '— ' + esc(p.by) : ''}`}</div>
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
  $('mStyle').onclick = () => { setMapStyle(state.mapStyle === 'sat' ? 'street' : 'sat'); save(); };
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  $('mInstall').hidden = !(isIOS && !standalone);
  $('mSwap').onclick = () => { $('menuBg').classList.remove('open'); openOnboard(); };
  $('mRefresh').onclick = () => { $('menuBg').classList.remove('open'); maybeFetchPlaces(true); };
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
  if (isIOS && !standalone && !state.installTip) {
    state.installTip = true; save();
    setTimeout(() => toast('Tip: Share → Add to Home Screen for full screen'), 4000);
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.wanderbuddy = { get state() { return state; }, explored, known, get pos() { return pos; } };
})();
