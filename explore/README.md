# Wanderbuddy

Pick a companion creature and explore your city with it. Lives at `/explore/` on the site.

- **Fog of war:** the map starts dark. Walking clears ~55 m blocks around you.
- **Places:** parks, cafés, fountains, landmarks, libraries, murals and playgrounds come from OpenStreetMap (Overpass API). They show as `?` until you get within ~45 m.
- **Companions:** six original creatures, each excited by a different kind of place, or upload your own picture.
- **Bond:** distance, new blocks and discoveries level up your companion.
- **Installable:** open on your phone → Share → *Add to Home Screen* (iOS) or *Install app* (Android).
- **Private:** everything is stored in the browser (localStorage). Nothing is sent anywhere except the map tile and place lookups.

Limits: browsers pause GPS when the screen is off, so keep it awake while walking (the app requests a wake lock where supported). Use Settings → *Walk by tapping the map* to try it from your couch.

No build step. Leaflet 1.9.4 is vendored in `vendor/`.
