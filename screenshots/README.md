# Phase 2 captures

Final Phase 2 visual set, rendered from the running app (headless Chrome,
1440×900). `00_` is retained as the pre-replacement baseline; everything else
is the current post-polish meadow and Studio portal house.

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
| `13_mobile_portrait.webp` | phone portrait layout |
| `14_villa_entry_fixed.webp` | close view of the body-coloured entry drum that keeps the tall glazed door flush to a curved villa |

Profile (headless Chrome, DPR 2, 1440×900, six bears, forced GPU sync):
baseline **29.5 ms / 558 calls / 2.43 M triangles**; grass hidden **22.5 ms**;
quality 3 / DPR 1.25 **20.1 ms**. Grass fill/geometry is still the largest
single GPU item, so the detail controls are the first response. Full method and
the earlier supplied baseline are in [../PERFORMANCE.md](../PERFORMANCE.md).
