# Phase 2–3a captures

Visual set from the running app (headless Chrome, 1440×900 unless noted). `00_`
is retained as the pre-replacement baseline; everything else is the completed
circular-meadow / dirt-trail / branched-backdrop pass plus the Phase 3a
autonomous-behaviour checks.

| file | view |
|---|---|
| `00_before_grass_and_trees.webp` | earlier grass/tree pass, before the dense scatter, rounded crowns and detailed villas |
| `01_meadow_gameplay.webp` | gameplay camera with the Aero/MSN UI, detailed villas and Studio portal house |
| `02_meadow_clean.webp` | same meadow view without UI |
| `03_villas_skyline_overview.webp` | elevated overview: eight Aero villas, Studio House, pond, paths, skyline and wind turbines |
| `04_aero_villas.webp` | close view of the new villa entry drums, doorframes and Studio House |
| `05_morning_mist.webp` | forced morning-mist check (the in-game mist is probabilistic) |
| `06_night_aurora_moon.webp` | night overview with aurora, moon, lit windows and fireflies |
| `07_leafy_tree_close.webp` | close view of the merged leafy tree and meadow grass |
| `08_meadow_detail_controls.webp` | Wind / canopy / leaf size / grass coverage / draw-distance controls |
| `09_studio_house_front.webp` | layered Studio House facade: solid volumes, flush glazing, rounded glass corner and portal |
| `10_studio_house_corner.webp` | three-quarter view of the rounded glazed corner, balcony and roof garden |
| `11_studio_house_night.webp` | Studio House night lighting |
| `12_fireflies_night.webp` | lit firefly swarm on looping paths at night |
| `13_mobile_portrait.webp` | phone portrait layout with the new Hide UI control |
| `14_villa_entry_fixed.webp` | close view of the body-coloured entry drum that keeps the tall glazed door flush to a curved villa |
| `15_phone_ui_hidden.webp` | 390×844 phone view with every overlay hidden; only Show UI remains |
| `16_water_anime_pattern.webp` | pond close-up with the denser 4× anime cell pattern, foam and reflection |
| `17_ground_grass_detail.webp` | close-up of the fine grass ground texture and clean dirt hub |
| `18_ai_hopping.webp` | mid-hop capture of an autonomous bear travelling toward food |
| `19_ai_eating.webp` | bear at a jelly-flower source; buddy status reads “nibbling a jelly flower” |
| `20_ai_drinking.webp` | bear at a validated pond-shore approach; status reads “sipping from the pond” |
| `21_food_sources.webp` | fallen jelly fruit and grass at a tree base |
| `22_ai_debug.webp` | field AI debug panel with needs, forced state, live plan readout and selected-bear route |
| `23_ai_debug_mobile.webp` | 390×844 AI debug panel layout |

Profile (headless Chrome, DPR 2, 1440×900, six bears, forced GPU sync):
the stable circular-pass reading was **32.1 ms / 565 calls / 3.67 M triangles**.
The later close-up-ground/sheen/water spot check was noisy at **39.7–44.3 ms**
baseline and **24.8–26.6 ms** at quality 3; a clean rerun is still pending.
Grass fill/geometry remains the largest single GPU item. Phase 3a AI updates
measured **0.007–0.045 ms per update** for six bears in headless QA; the full
frame profile has not been re-run. Full method and the earlier supplied
baselines are in [../PERFORMANCE.md](../PERFORMANCE.md).
