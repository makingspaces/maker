# Wanderbuddy

Pick a Pokémon, drop into any city, and explore it from your couch. Lives at `/explore/` on the site.
Personal fan project: Pokémon data, sprites and cries are loaded at runtime from PokéAPI, not stored in this repo.

- **Partner:** search any of the 1,025 Pokémon (by name or number), optional shiny, nickname. Its animated sprite walks the map and turns to face where it's going.
- **Controls:** on-screen joystick, **Run** toggle, or tap the map to walk there. Keyboard: arrows/WASD, hold Shift to run.
- **Travel:** start from your real location or search any city/address; jump anywhere from the ⚙︎ menu.
- **Fog of war:** the map starts dark; moving clears ~55 m blocks.
- **Places:** show as `?` until you get within ~40 m. Two free, keyless sources: Wikipedia's nearby-articles search (reliable: landmarks, parks, museums, statues, famous restaurants) and OpenStreetMap via Overpass (cafés, fountains, playgrounds; often overloaded, so it tries four mirrors and retries later).
- **Map:** OpenStreetMap's standard tiles (no key needed).
- **Friendship:** the Pokémon's primary type decides what it loves (Fire → food, Water/Ice → water, Grass/Bug/Poison → parks, Rock/Ground/Steel/Dark → history, Psychic/Ghost → museums & libraries, Fairy/Flying/Dragon → art & views, Electric/Fighting → play). Loved places give more friendship and a cry.
- Everything is saved in the browser (localStorage). Installable via *Add to Home Screen*.

No build step. Leaflet 1.9.4 is vendored in `vendor/`.
