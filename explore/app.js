/* Wanderbuddy: walk your city with a companion creature.
 * Plain JS, no build step. Leaflet for the map, OpenStreetMap/Overpass for places,
 * localStorage for progress. */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const DLAT = 0.0005;            // fog cell height (~55 m)
  const DLNG = 0.0007;            // fog cell width (~55 m at mid latitudes)
  const DISCOVER_RADIUS = 45;     // metres to "find" a place
  const FETCH_RADIUS = 700;       // metres around you to look for places
  const REFETCH_AFTER = 400;      // move this far before looking again
  const MAX_ACCURACY = 60;        // ignore GPS fixes worse than this for exploring
  const STORE_KEY = 'wanderbuddy.v1';
  const OVERPASS = 'https://overpass-api.de/api/interpreter';
  const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  // Place categories: what OSM tags map to, and how they look.
  const CATS = {
    food:    { label: 'Food & drink',     icon: '🥐' },
    water:   { label: 'Water',            icon: '⛲' },
    green:   { label: 'Parks & gardens',  icon: '🌳' },
    history: { label: 'History',          icon: '🏛️' },
    art:     { label: 'Art & views',      icon: '🎨' },
    books:   { label: 'Books & museums',  icon: '📚' },
    play:    { label: 'Play & sport',     icon: '🛝' },
  };

  // Original companions. Each has a favourite category and a voice.
  const CREATURES = [
    { id: 'embit',  name: 'Embit',  type: 'Ember',  loves: 'food',    body: '#ff7a45', belly: '#ffe0c2', ear: 'pointy', tail: 'flame',
      blurb: 'A fox-ish spark with a warm nose. Sniffs out bakeries and cafés from blocks away.',
      say: { love: ['Do you smell that?! {p}! Let\'s go in!', 'My tail is glowing. {p} smells AMAZING.', '{p}! I\'m adding this to my snack map.'],
             like: ['{p}. Not food, but I\'ll allow it.', 'Ooh, {p}. Warm vibes.'],
             idle: ['Is it lunchtime yet?', 'I could walk forever. Or at least until snacks.', 'Every street smells different!'] } },
    { id: 'drizl',  name: 'Drizl',  type: 'Tide',   loves: 'water',   body: '#4aa8ff', belly: '#d8f0ff', ear: 'fin', tail: 'fin',
      blurb: 'A pocket-sized otter of rain. Happiest near fountains, ponds and rivers.',
      say: { love: ['Splish! {p}! Can I jump in? Please?', '{p}! The water here is singing.', 'I found {p}! Best day.'],
             like: ['{p}. Nice, but a bit dry.', 'Hmm, {p}. Any puddles nearby?'],
             idle: ['Was that a raindrop? No? Okay.', 'I\'m keeping an eye out for water.', 'Puddle radar: active.'] } },
    { id: 'sprig',  name: 'Sprig',  type: 'Grove',  loves: 'green',   body: '#5cc56b', belly: '#e3f7d6', ear: 'leaf', tail: 'leaf',
      blurb: 'A shy little deer-sprout. Perks up in parks, gardens and anywhere with grass.',
      say: { love: ['{p}! Look at all the green!', 'Can we sit in {p} for a minute?', 'The trees in {p} are saying hi.'],
             like: ['{p}. Hm. Needs more plants.', 'Oh, {p}. I like it here.'],
             idle: ['Slow down, I\'m looking at a leaf.', 'Every crack in the sidewalk has a tiny plant.', 'The city is greener than you think.'] } },
    { id: 'kobble', name: 'Kobble', type: 'Stone',  loves: 'history', body: '#a08c7a', belly: '#e9ddcf', ear: 'horn', tail: 'stub',
      blurb: 'A pebble-backed tortoise who remembers everything. Loves old buildings and monuments.',
      say: { love: ['{p}. This place has stories. Lots of them.', 'I remember when {p} was new. Probably.', 'Stop. Read the plaque at {p}. For me.'],
             like: ['{p}. Young, but promising.', '{p}. I\'ll remember this.'],
             idle: ['No rush. Stones are patient.', 'This street used to be something else.', 'I like old corners best.'] } },
    { id: 'gusto',  name: 'Gusto',  type: 'Breeze', loves: 'art',     body: '#b48cff', belly: '#efe6ff', ear: 'tuft', tail: 'swirl',
      blurb: 'A feathery wisp who chases murals, sculptures and big views.',
      say: { love: ['Whoa, {p}! Hold still, I\'m inspired.', '{p}! I want to live inside this.', 'Look at {p}! Now look UP.'],
             like: ['{p}. It\'s got a mood.', '{p}, nice. Is there a view nearby?'],
             idle: ['The wind says turn left.', 'Somebody painted that wall. Who?', 'Let\'s find something tall.'] } },
    { id: 'pagelet',name: 'Pagelet',type: 'Lore',   loves: 'books',   body: '#ffc145', belly: '#fff3d1', ear: 'round', tail: 'bookmark',
      blurb: 'A round little owl-mouse who collects facts. Loves libraries and museums.',
      say: { love: ['{p}!! So many things to learn!', 'Can we go into {p}? Five minutes. Ten. An hour.', '{p}. My favorite word is "exhibit".'],
             like: ['{p}. I\'m taking notes.', 'Interesting. {p}. Filed.'],
             idle: ['Did you know streets have names for reasons?', 'I wonder who lives up there.', 'Every block is a new page.'] } },
  ];

  const CUSTOM_SAY = {
    love: ['{p}! This is my favorite kind of place!', 'We found {p}! I knew it was close.', '{p}! Can we stay a bit?'],
    like: ['Ooh, {p}.', '{p}. Adding it to the journal.', 'Nice find: {p}.'],
    idle: ['Where to next?', 'I like walking with you.', 'Let\'s go somewhere we\'ve never been.'],
  };
  const NEW_BLOCK_LINES = ['New street! It smells different here.', 'We\'ve never been here before!', 'The fog\'s lifting!', 'Uncharted territory!'];
  const RETURN_LINES = ['We know this block.', 'Familiar territory.', 'Home turf.'];
  const PET_LINES = ['Hehe.', '♡', 'Again!', '*happy noises*', 'Let\'s keep going!'];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const defaultState = () => ({
    active: null,          // companion key
    companions: {},        // key -> { base, nick, xp, custom?: {img, loves} }
    explored: [],          // fog cell keys
    places: {},            // osm id -> { name, cat, lat, lng, at, by, quote }
    meters: 0,
    demo: false,
    lastPos: null,
  });

  let state = load();
  const explored = new Set(state.explored);
  let known = {};          // fetched-but-not-yet-discovered places
  let lastFetch = null;    // [lat, lng] of last Overpass query
  let fetching = false;
  let pos = null;          // current [lat, lng]
  let lastCountedPos = null;
  let followMe = true;
  let saveTimer = null;
  let geoWatch = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* private mode or corrupt; start fresh */ }
    return defaultState();
  }
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      state.explored = Array.from(explored);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
      catch (e) { toast('Could not save progress (storage full?)'); }
    };
    if (now) write(); else saveTimer = setTimeout(write, 1500);
  }

  const $ = (id) => document.getElementById(id);
  const comp = () => state.companions[state.active];
  const baseOf = (c) => CREATURES.find((x) => x.id === c.base);
  const lovesOf = (c) => (c.custom ? c.custom.loves : baseOf(c).loves);
  const linesOf = (c) => (c.custom ? CUSTOM_SAY : baseOf(c).say);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------------------------------------------------------------------------
  // Creature art (inline SVG, generated)
  // ---------------------------------------------------------------------------
  function creatureSVG(cr) {
    const b = cr.body, bl = cr.belly;
    const dark = shade(b, -0.28);
    const ears = {
      pointy: `<path d="M27 44 L22 12 L46 32Z" fill="${b}"/><path d="M73 44 L78 12 L54 32Z" fill="${b}"/>
               <path d="M29 38 L26 20 L40 31Z" fill="${bl}"/><path d="M71 38 L74 20 L60 31Z" fill="${bl}"/>`,
      fin:    `<path d="M24 46 Q14 30 30 26 Q34 36 36 40Z" fill="${dark}"/><path d="M76 46 Q86 30 70 26 Q66 36 64 40Z" fill="${dark}"/>
               <path d="M50 30 Q46 14 56 8 Q58 20 56 32Z" fill="${dark}"/>`,
      leaf:   `<path d="M34 34 Q18 10 26 4 Q40 14 40 32Z" fill="#3e9a4c"/><path d="M66 34 Q82 10 74 4 Q60 14 60 32Z" fill="#3e9a4c"/>
               <path d="M28 8 Q34 20 38 30" stroke="#2c7a38" stroke-width="1.5" fill="none"/><path d="M72 8 Q66 20 62 30" stroke="#2c7a38" stroke-width="1.5" fill="none"/>`,
      horn:   `<path d="M36 32 Q32 18 40 14 Q42 24 42 32Z" fill="#e9ddcf"/><path d="M64 32 Q68 18 60 14 Q58 24 58 32Z" fill="#e9ddcf"/>`,
      tuft:   `<path d="M40 32 Q34 10 44 4 Q46 18 48 30Z" fill="${dark}"/><path d="M50 30 Q52 6 62 6 Q58 18 56 32Z" fill="${b}"/>
               <path d="M58 32 Q70 14 76 20 Q66 26 62 36Z" fill="${dark}"/>`,
      round:  `<circle cx="28" cy="34" r="12" fill="${b}"/><circle cx="72" cy="34" r="12" fill="${b}"/>
               <circle cx="28" cy="34" r="6.5" fill="${bl}"/><circle cx="72" cy="34" r="6.5" fill="${bl}"/>`,
    }[cr.ear];
    const tails = {
      flame:    `<path d="M76 74 Q96 70 92 48 Q88 60 82 58 Q90 44 80 36 Q82 52 72 62Z" fill="#ffc145"/><path d="M78 70 Q90 64 86 54 Q82 62 76 64Z" fill="#ff4d2d"/>`,
      fin:      `<path d="M74 74 Q94 80 96 62 Q86 68 76 64Z" fill="${dark}"/>`,
      leaf:     `<path d="M74 72 Q96 66 94 50 Q80 54 74 64Z" fill="#3e9a4c"/>`,
      stub:     `<path d="M76 76 Q88 78 86 70 Q80 70 76 70Z" fill="${dark}"/>`,
      swirl:    `<path d="M76 70 Q96 66 92 50 Q88 40 80 46 Q76 52 84 54" stroke="${dark}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      bookmark: `<path d="M74 74 L92 70 L92 86 L86 80 L80 86 L80 74Z" fill="#ff7a45"/>`,
    }[cr.tail];
    const shell = cr.tail === 'stub'
      ? `<path d="M28 56 Q50 30 72 56Z" fill="#7d6b5b"/><path d="M38 48 L50 42 L62 48 M44 52 L50 46 L56 52" stroke="#a08c7a" stroke-width="2" fill="none"/>` : '';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="94" rx="24" ry="4" fill="rgba(0,0,0,.18)"/>
      ${tails}${ears}
      <ellipse cx="38" cy="88" rx="8" ry="5" fill="${dark}"/><ellipse cx="62" cy="88" rx="8" ry="5" fill="${dark}"/>
      <ellipse cx="50" cy="62" rx="30" ry="28" fill="${b}"/>
      ${shell}
      <ellipse cx="50" cy="72" rx="17" ry="14" fill="${bl}"/>
      <circle cx="39" cy="57" r="5" fill="#1b1f33"/><circle cx="61" cy="57" r="5" fill="#1b1f33"/>
      <circle cx="40.6" cy="55.2" r="1.8" fill="#fff"/><circle cx="62.6" cy="55.2" r="1.8" fill="#fff"/>
      <ellipse cx="31" cy="66" rx="5" ry="3" fill="#ff8fa3" opacity=".6"/><ellipse cx="69" cy="66" rx="5" ry="3" fill="#ff8fa3" opacity=".6"/>
      <path d="M45 65 Q50 70 55 65" stroke="#1b1f33" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </svg>`;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((c) => c.toString(16).padStart(2, '0')).join('');
  }
  function companionArt(c) {
    if (c.custom) return `<img src="${c.custom.img}" alt="">`;
    return creatureSVG(baseOf(c));
  }

  // ---------------------------------------------------------------------------
  // Progress maths
  // ---------------------------------------------------------------------------
  const levelFor = (xp) => Math.floor(Math.sqrt(xp / 200)) + 1;   // ~1 level per good walk early on
  const xpForLevel = (lv) => 200 * (lv - 1) * (lv - 1);
  function addXP(n) {
    const c = comp();
    const before = levelFor(c.xp);
    c.xp += n;
    const after = levelFor(c.xp);
    if (after > before) {
      say(`Level ${after}! I feel like we really get each other now.`, true);
      hop();
      toast(`💛 ${c.nick} reached bond level ${after}`);
    }
    renderHUD();
  }

  function haversine(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const cellOf = (lat, lng) => [Math.floor(lat / DLAT), Math.floor(lng / DLNG)];
  const keyOf = (i, j) => i + ',' + j;

  // ---------------------------------------------------------------------------
  // Map + fog layer
  // ---------------------------------------------------------------------------
  const map = L.map('map', { zoomControl: false, attributionControl: false, maxZoom: 19, minZoom: 3 })
    .setView(state.lastPos || [40.7128, -74.006], state.lastPos ? 17 : 13);
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

    const z = coords.z;
    const nwPt = coords.scaleBy(size);
    const nw = m.unproject(nwPt, z);
    const se = m.unproject(nwPt.add(size), z);
    // Pad by a cell so soft edges that spill across tile borders are drawn.
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
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.6, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(a.x - r, a.y - r, r * 2, r * 2);
    }
  }
  // Redraw only the tiles that touch newly explored cells.
  function refreshFog(newCells) {
    const tiles = fog._tiles; const size = fog.getTileSize();
    for (const k in tiles) {
      const t = tiles[k]; if (!t.el || !t.coords) continue;
      const nwPt = t.coords.scaleBy(size);
      const nw = map.unproject(nwPt, t.coords.z), se = map.unproject(nwPt.add(size), t.coords.z);
      const hit = newCells.some(([i, j]) => {
        const lat = (i + 0.5) * DLAT, lng = (j + 0.5) * DLNG;
        const padLat = DLAT * 2, padLng = DLNG * 2;
        return lat <= nw.lat + padLat && lat >= se.lat - padLat && lng >= nw.lng - padLng && lng <= se.lng + padLng;
      });
      if (hit) drawFogTile(t.el, t.coords, map, size);
    }
  }

  // ---------------------------------------------------------------------------
  // Markers
  // ---------------------------------------------------------------------------
  let meMarker = null;
  function meIcon() {
    return L.divIcon({ className: 'me-marker', html: `<div class="me-inner">${companionArt(comp())}</div>`, iconSize: [56, 56], iconAnchor: [28, 50] });
  }
  function placeMarkers() {
    // discovered places
    if (!placeMarkers.layer) placeMarkers.layer = L.layerGroup().addTo(map);
    placeMarkers.layer.clearLayers();
    const loves = state.active ? lovesOf(comp()) : null;
    for (const id in state.places) {
      const p = state.places[id];
      const icon = L.divIcon({ className: '', html: `<div class="place-marker${p.cat === loves ? ' loved' : ''}">${CATS[p.cat].icon}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([p.lat, p.lng], { icon, keyboard: false }).bindPopup(`<b>${esc(p.name)}</b><br><i>${esc(p.quote || '')}</i>`).addTo(placeMarkers.layer);
    }
    // known but undiscovered: only show those near explored territory, as "?"
    for (const id in known) {
      const p = known[id];
      if (pos && haversine(pos, [p.lat, p.lng]) > 350) continue;
      const icon = L.divIcon({ className: '', html: '<div class="place-marker unknown">?</div>', iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([p.lat, p.lng], { icon, keyboard: false }).bindPopup(`Something's here… walk closer to find out.`).addTo(placeMarkers.layer);
    }
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------------------
  // Places (Overpass)
  // ---------------------------------------------------------------------------
  function categorize(t) {
    const a = t.amenity, l = t.leisure, tr = t.tourism;
    if (/^(restaurant|cafe|bakery|ice_cream|pub|bar|marketplace|food_court)$/.test(a) || /^(bakery|pastry|confectionery|deli)$/.test(t.shop)) return 'food';
    if (/^(fountain|drinking_water)$/.test(a) || t.natural === 'water' || t.water || /^(river|canal)$/.test(t.waterway)) return 'water';
    if (/^(park|garden|nature_reserve)$/.test(l)) return 'green';
    if (t.historic) return 'history';
    if (/^(artwork|viewpoint|attraction|gallery)$/.test(tr) || a === 'arts_centre') return 'art';
    if (a === 'library' || tr === 'museum' || t.shop === 'books') return 'books';
    if (/^(playground|sports_centre|pitch|stadium|skatepark)$/.test(l)) return 'play';
    return null;
  }
  function fallbackName(cat, t) {
    const by = {
      food: 'a little café', water: t.amenity === 'drinking_water' ? 'a water fountain' : t.amenity === 'fountain' ? 'a fountain' : 'some water',
      green: 'a patch of green', history: 'an old landmark', art: t.tourism === 'artwork' ? 'a piece of street art' : 'a cool spot',
      books: 'a place full of books', play: 'a playground',
    };
    return by[cat];
  }
  async function fetchPlaces(force) {
    if (!pos || fetching) return;
    if (!force && lastFetch && haversine(pos, lastFetch) < REFETCH_AFTER) return;
    fetching = true;
    const [lat, lng] = pos, R = FETCH_RADIUS;
    const around = `(around:${R},${lat.toFixed(5)},${lng.toFixed(5)})`;
    const q = `[out:json][timeout:20];(
      nwr${around}["amenity"~"^(restaurant|cafe|bakery|ice_cream|pub|marketplace|library|arts_centre|fountain|drinking_water)$"];
      nwr${around}["shop"~"^(bakery|books)$"];
      nwr${around}["leisure"~"^(park|garden|nature_reserve|playground|skatepark)$"];
      nwr${around}["historic"]["name"];
      nwr${around}["tourism"~"^(museum|viewpoint|attraction|artwork|gallery)$"];
      nwr${around}["natural"="water"]["name"];
    );out center 250;`;
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
      lastFetch = pos.slice();
      placeMarkers();
      checkDiscoveries();
      if (force) toast(added ? `Found ${added} new spots nearby` : 'No new spots nearby');
    } catch (e) {
      if (force) toast('Could not reach OpenStreetMap. Try again in a bit.');
      setTimeout(() => { fetching = false; }, 15000); // back off
      return;
    }
    fetching = false;
  }
  function checkDiscoveries() {
    if (!pos || !state.active) return;
    const c = comp();
    const loves = lovesOf(c);
    for (const id in known) {
      const p = known[id];
      if (haversine(pos, [p.lat, p.lng]) > DISCOVER_RADIUS) continue;
      delete known[id];
      const isLove = p.cat === loves;
      const lines = linesOf(c);
      const quote = pick(isLove ? lines.love : lines.like).replace('{p}', p.name);
      state.places[id] = Object.assign(p, { at: Date.now(), by: c.nick, quote });
      say(quote, true);
      toast(`${CATS[p.cat].icon} Discovered ${p.name}`);
      if (isLove) hop();
      addXP(isLove ? 120 : 50);
      if (navigator.vibrate) navigator.vibrate(isLove ? [60, 40, 60] : 40);
      placeMarkers();
      save();
      break; // one discovery per fix keeps the bubble readable
    }
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------
  let lastNewBlockLine = 0;
  function onPosition(lat, lng, accuracy) {
    pos = [lat, lng];
    state.lastPos = pos;
    if (!meMarker) {
      meMarker = L.marker(pos, { icon: meIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
      map.setView(pos, Math.max(map.getZoom(), 17), { animate: false });
    } else meMarker.setLatLng(pos);
    if (followMe) map.panTo(pos, { animate: true });

    const note = $('gpsNote');
    if (!state.demo && accuracy > MAX_ACCURACY) {
      note.textContent = `Weak GPS (±${Math.round(accuracy)} m). Step outside for better tracking.`;
      note.classList.add('show');
      return;
    }
    note.classList.remove('show');

    // Distance (skip teleports such as GPS jumps or demo taps across town)
    if (lastCountedPos) {
      const d = haversine(lastCountedPos, pos);
      if (d >= 5 && d < 250) { state.meters += d; addXP(Math.round(d / 10)); lastCountedPos = pos; }
      else if (d >= 250) lastCountedPos = pos;
    } else lastCountedPos = pos;

    // Reveal a 3x3 block of cells around you
    const [ci, cj] = cellOf(lat, lng);
    const fresh = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const k = keyOf(ci + di, cj + dj);
      if (!explored.has(k)) { explored.add(k); fresh.push([ci + di, cj + dj]); }
    }
    if (fresh.length) {
      refreshFog(fresh);
      addXP(fresh.length * 4);
      if (Date.now() - lastNewBlockLine > 45000 && fresh.length >= 3) { say(pick(NEW_BLOCK_LINES)); lastNewBlockLine = Date.now(); }
    }
    checkDiscoveries();
    fetchPlaces(false);
    renderHUD();
    save();
  }

  function startGPS() {
    if (geoWatch != null || state.demo) return;
    if (!('geolocation' in navigator)) { enableDemo('This browser has no GPS. Tap the map to walk.'); return; }
    geoWatch = navigator.geolocation.watchPosition(
      (p) => onPosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      (err) => {
        if (err.code === 1) enableDemo('Location is blocked, so tap the map to walk. You can allow it in your browser settings.');
        else { $('gpsNote').textContent = 'Looking for GPS…'; $('gpsNote').classList.add('show'); }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    requestWakeLock();
  }
  function stopGPS() { if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }

  // Demo walking: tap the map and the buddy walks there in steps.
  let walkTimer = null;
  map.on('click', (e) => {
    if (!state.demo || !state.active) return;
    clearInterval(walkTimer);
    const from = pos || [e.latlng.lat, e.latlng.lng];
    const to = [e.latlng.lat, e.latlng.lng];
    const dist = haversine(from, to);
    if (!pos || dist > 3000) { onPosition(to[0], to[1], 5); return; }
    const steps = Math.max(1, Math.round(dist / 12));
    let n = 0; followMe = true;
    walkTimer = setInterval(() => {
      n++;
      const f = n / steps;
      onPosition(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, 5);
      if (n >= steps) clearInterval(walkTimer);
    }, 60);
  });
  function enableDemo(msg) {
    state.demo = true; stopGPS(); renderMenu(); save();
    if (msg) say(msg, true);
  }

  let wakeLock = null;
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not granted; fine */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && geoWatch != null) requestWakeLock();
    if (document.visibilityState === 'hidden') save(true);
  });

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  function say(text, important) {
    const b = $('bubble');
    b.textContent = text;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    if (important) lastSpoke = Date.now();
  }
  let lastSpoke = 0;
  setInterval(() => {
    if (!state.active || Date.now() - lastSpoke < 60000) return;
    say(pick(linesOf(comp()).idle)); lastSpoke = Date.now();
  }, 20000);

  function hop() {
    const el = meMarker && meMarker.getElement(); if (!el) return;
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function renderHUD() {
    const c = comp(); if (!c) return;
    const lv = levelFor(c.xp), lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
    $('hudName').textContent = `${c.nick}` + (c.custom ? '' : ` · ${baseOf(c).type}`);
    $('hudLvl').textContent = `Bond ${lv}`;
    $('xpFill').style.width = Math.round(((c.xp - lo) / (hi - lo)) * 100) + '%';
    $('stCells').textContent = explored.size.toLocaleString();
    $('stKm').textContent = (state.meters / 1000).toFixed(1);
    $('stPlaces').textContent = Object.keys(state.places).length;
    $('stBond').textContent = '♥'.repeat(Math.min(5, Math.ceil(lv / 2))) || '♡';
  }
  function renderBuddy() {
    $('buddyPic').innerHTML = companionArt(comp());
    if (meMarker) meMarker.setIcon(meIcon());
  }
  function renderMenu() { $('demoState').textContent = state.demo ? 'on' : 'off'; }

  function renderJournal() {
    const list = Object.entries(state.places).sort((a, b) => b[1].at - a[1].at);
    const byCat = {};
    list.forEach(([, p]) => { byCat[p.cat] = (byCat[p.cat] || 0) + 1; });
    $('journalSub').textContent = list.length
      ? Object.entries(byCat).map(([k, n]) => `${CATS[k].icon} ${n}`).join('   ')
      : '';
    $('journalList').innerHTML = list.length ? list.map(([, p]) => `
      <div class="entry"><div class="ico">${CATS[p.cat].icon}</div><div>
        <div class="t">${esc(p.name)}</div>
        <div class="q">“${esc(p.quote)}” ${p.by ? '— ' + esc(p.by) : ''}</div>
        <div class="d">${new Date(p.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      </div></div>`).join('')
      : '<p class="empty">Nothing yet. Walk toward a <b>?</b> on the map to discover it.</p>';
  }

  function openSheet(id) { $(id).classList.add('open'); }
  document.querySelectorAll('.sheet-bg').forEach((bg) => {
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.hasAttribute('data-close')) bg.classList.remove('open'); });
  });

  $('btnCenter').onclick = () => { followMe = true; $('btnCenter').classList.add('on'); if (pos) map.setView(pos, Math.max(map.getZoom(), 17)); };
  $('btnJournal').onclick = () => { renderJournal(); openSheet('journalBg'); };
  $('btnMenu').onclick = () => { renderMenu(); openSheet('menuBg'); };
  $('buddyPic').onclick = () => { say(pick(PET_LINES)); hop(); };
  $('mSwap').onclick = () => { $('menuBg').classList.remove('open'); openOnboard(); };
  $('mDemo').onclick = () => {
    state.demo = !state.demo; renderMenu(); save();
    if (state.demo) { stopGPS(); toast('Tap the map to walk'); } else { startGPS(); toast('Using real GPS'); }
  };
  $('mRefresh').onclick = () => { $('menuBg').classList.remove('open'); fetchPlaces(true); };
  $('mReset').onclick = () => {
    if (!confirm('Erase your whole explored map, journal and companions?')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    location.reload();
  };

  // ---------------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------------
  let selected = null;      // creature id, or 'custom'
  let customImg = null;
  function openOnboard() {
    selected = null; customImg = null;
    const picker = $('picker');
    picker.innerHTML = CREATURES.map((c) => `
      <button class="pick" data-id="${c.id}">${creatureSVG(c)}<span class="n">${c.name}</span><span class="ty">${c.type} · ${CATS[c.loves].icon}</span></button>`).join('')
      + `<button class="pick upload" data-id="custom"><span class="plus">＋</span><span class="n">Your own</span><span class="ty">upload a picture</span></button>`;
    $('customType').innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');
    $('customTypeWrap').hidden = true;
    $('nick').value = '';
    $('goBtn').disabled = true;
    $('pickDetail').innerHTML = '<b>Tap a companion</b><span>Each one has its own favorite kinds of places.</span>';
    $('cancelPick').hidden = !state.active;
    $('onboard').classList.add('open');
  }
  $('cancelPick').onclick = () => $('onboard').classList.remove('open');
  $('picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.pick'); if (!btn) return;
    const id = btn.dataset.id;
    if (id === 'custom') { $('fileIn').click(); return; }
    selectPick(id);
  });
  function selectPick(id) {
    selected = id;
    document.querySelectorAll('.pick').forEach((p) => p.classList.toggle('sel', p.dataset.id === id));
    if (id === 'custom') {
      $('pickDetail').innerHTML = '<b>Your own buddy</b><span>Pick what it gets most excited about, then give it a name.</span>';
      $('customTypeWrap').hidden = false;
    } else {
      const c = CREATURES.find((x) => x.id === id);
      const prior = state.companions[id];
      $('pickDetail').innerHTML = `<b>${c.name} · ${c.type} type</b><span>${c.blurb} Loves: ${CATS[c.loves].icon} ${CATS[c.loves].label}.${prior ? ` You've walked together before (bond ${levelFor(prior.xp)}).` : ''}</span>`;
      $('customTypeWrap').hidden = true;
      $('nick').value = prior ? prior.nick : c.name;
    }
    $('goBtn').disabled = false;
  }
  $('fileIn').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      customImg = await shrinkImage(f, 160);
      const up = document.querySelector('.pick.upload');
      up.innerHTML = `<img src="${customImg}" alt=""><span class="n">Your own</span><span class="ty">tap to change</span>`;
      selectPick('custom');
      $('nick').focus();
    } catch (err) { toast('Could not read that image'); }
    e.target.value = '';
  });
  function shrinkImage(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const ctx = c.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  $('goBtn').onclick = () => {
    if (!selected) return;
    const nick = $('nick').value.trim();
    let key;
    if (selected === 'custom') {
      if (!customImg) return;
      key = 'custom-' + Date.now();
      state.companions[key] = { base: null, nick: nick || 'Buddy', xp: 0, custom: { img: customImg, loves: $('customType').value } };
    } else {
      key = selected;
      const prior = state.companions[key];
      state.companions[key] = prior ? Object.assign(prior, { nick: nick || prior.nick }) : { base: selected, nick: nick || CREATURES.find((c) => c.id === selected).name, xp: 0 };
    }
    state.active = key;
    save(true);
    $('onboard').classList.remove('open');
    if (meMarker) { meMarker.remove(); meMarker = null; }
    if (!started) startApp(true); else { renderBuddy(); renderHUD(); placeMarkers(); say(`Hi! I'm ${comp().nick}. Where are we going?`, true); if (pos) onPosition(pos[0], pos[1], 5); }
  };

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  let started = false;
  function startApp(fresh) {
    started = true;
    $('hud').hidden = false; $('buddy').hidden = false;
    renderBuddy(); renderHUD(); renderMenu(); placeMarkers();
    $('btnCenter').classList.add('on');
    const c = comp();
    const loves = CATS[lovesOf(c)];
    say(fresh ? `Hi! I'm ${c.nick}. Let's go explore! I really love ${loves.label.toLowerCase()} ${loves.icon}` : pick(RETURN_LINES), true);
    if (state.demo) {
      if (state.lastPos) onPosition(state.lastPos[0], state.lastPos[1], 5);
      toast('Tap the map to walk');
    } else startGPS();
  }

  if (state.active && state.companions[state.active]) startApp(false);
  else openOnboard();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Exposed for testing in the console.
  window.wanderbuddy = { state, explored, known, onPosition, fetchPlaces };
})();
