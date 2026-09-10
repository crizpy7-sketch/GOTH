# Building crop validation

The original equal-cell crop for the two-by-two Hearthstone sheet included a flame tip from the next source row in tier 2. That stray orange fragment appeared below the pedestal in menus and also enlarged the crop used to calculate the shared tier scale.

`scripts/prepare-illustrated-building.mjs` now finds each complete structural alpha component and orders those bounds by source row and column. A 96-alpha connectivity threshold avoids joining neighboring roof eaves through faint edge pixels in the tightly spaced kitchen source. The output uses the original image pixels and original alpha; the threshold only finds bounds. Two pixels of padding preserve antialiasing at each crop edge.

All 12 building families were reprocessed from their saved source PNGs. Their 33 tier sprites retain canonical logical dimensions, a shared scale within each family, and bottom-center placement. The three authored cottages/workshop entrance sprites retain their existing frame sizes and door-anchor calculation at 40 logical pixels from the left edge. No collision or map data changed.

The isolated orange fragment is gone from Hearthstone tier 2. Visual inspection of every tier found no remaining adjacent-row or adjacent-cell bleed. Dimension and alpha verification covers all 33 tiers plus the three authored entrance sprites.

Evidence (local, ignored QA artifacts): `../artifacts/cast-review-building-lineup.png` and `../artifacts/building-crop-validation.json`. The original generation prompts remain in `ILLUSTRATED_SCENERY_PROMPTS.md`.
