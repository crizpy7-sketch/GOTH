# Illustrated adventure release

## Playtest scope

A complete opening adventure for the owner's kids to play, using the supplied smooth illustrated fantasy reference. Exploration, battles, creature bonding, village building, family missions, and existing saves retain their established rules.

The illustrated opening covers Emberhollow, Gladewind Meadow, Hollowpine Wood, Gran's cottage, all opening NPCs and encounter species, battles, important conversations, and shared menus. Other areas remain accessible; art exclusive to later regions is outside this pass.

## What changed

- Thirteen characters have four directions and four animation frames per direction: 208 runtime frames, with shared scale and complete silhouettes. Hero's east-facing cycle mirrors the clean west-facing cycle. Gran's sheet extraction now isolates each complete figure rather than including adjacent-row pixels.
- Nine opening species have illustrated front/back battle poses and overworld frames: Embercub, Leafowl, Aquarabbit, Voltkit, Florabloom, Wisplet, Terranox, Grovewing, and Drakindle.
- All 33 upgrade tiers across 12 building families, plus three authored entrances, use original illustrated sprites. Door anchors and collision footprints remain consistent. Component-based source crops prevent neighboring building fragments from appearing in game.
- Painted oak/pine foliage, grass/path materials, 16 reusable furniture/environment cutouts, smooth terrain painters, seasonal colors, and subtle fireplace/lantern animation give the opening a consistent presentation.
- Gran, the Mayor, and the rival have large illustrated portraits, with a warm cottage and valley setting. Important conversations pause exploration and use player-paced dialogue; ordinary and repeat conversations remain brief.
- Embedded Nunito typography, charcoal/gold panels, smooth icons and contact shadows, a new title illustration, and corrected mission/build/upgrade layouts improve readability on desktop and landscape phones.
- Quick direction taps turn the hero without requiring a step; fast confirmation taps no longer swallow the next input. NPC wandering avoids authored doors and their approach tiles.

## Rendering and performance

Balanced graphics is the default: a 960×540 backing canvas. High detail uses 1280×720, with a separate 960×540 surface for the moving outdoor world; close-up scenes use full resolution. Both modes use the same artwork and logical gameplay coordinates. The setting persists with saves.

Text runs and measurements use bounded caches. Static ground is cached for the current map and season; water animation, actors, weather, lighting, and village changes remain dynamic. Reduced motion preserves readable feedback while limiting animation.

The final isolated headless Chromium benchmark at a 1280×800 viewport measured Balanced at approximately 60 FPS in the village and 55 FPS in the forest; High measured approximately 48 and 40 FPS. These results are development-machine measurements, not physical-phone performance claims. Physical iOS/Android and real gamepads still require device testing.

## Verification

- 111 automated Node tests pass, including fast-input regression, doors remaining clear, battle/bond conservation, story state, save behavior, and bundle integrity.
- The browser gameplay suite covers boot, seasons, title/onboarding, movement, journal, battle/bond, party/home management, NPCs and shops, missions, village controls, save/reload, and desktop/mobile input.
- The story suite covers all three important characters, starter cancellation and exact-once choice, existing-save reunion, paused exploration, touch choices, reduced motion, and repeat chats.
- The illustrated suite verifies all 208 character frames, nine species, 33 building tiers, three entrances, all rendered opening tiles, story art, font loading/measurement, and graphics switching. It captures desktop, 844×390, and 568×320 layouts.
- The opening-journey suite uses actual controls from a fresh title through Warmhouse entry, Gran's choice, the Mayor, a natural encounter, attack/bond, a family mission, cottage placement, Hearthstone upgrade, forest travel, save/reload, and mobile continuation. It uses a disposable save and fixed battle randomness; it does not teleport or grant progression/currency.

Run browser suites with the preview server running. Results and screenshots are written to ignored `artifacts/`. Production sources and preparation manifests are committed under `assets/illustrated/`.

Final local acceptance on 2026-09-09: all four browser suites passed with zero page errors (24 gameplay, 12 story, 9 illustrated, and 12 opening-journey checks). Visual inspection confirmed the final portraits, building crops, and mobile layouts. One minor existing behavior remains: a rapid sequence of menu actions can leave an older tracking toast queued until exploration resumes; earned progress and the current journal are correct.

## Marketing Chief

Shia Factory's `agents/gary/README.md` identifies Marketing Chief as GARY-001. His package assigns brand/growth critique; the Design Director owns visual and usability direction. The product brief is an inviting creature-and-village adventure for the owner's family, judged by the actual playable opening and clear controls. No engagement or market-demand claims are established by this work.

**Gary has not run a live review.** The documented Office endpoint `http://127.0.0.1:8787/hq` refused a connection. The owner's actual Office URL is still needed to connect his review. Reading his package is not a response from Gary; no Factory service was installed or changed to manufacture one.

Sources: [Gary's package](https://github.com/crizpy7-sketch/Shia-factory/tree/main/agents/GARY-001) and [Factory roster](https://github.com/crizpy7-sketch/Shia-factory/blob/main/boris/src/identity/roster.ts).

## Art provenance

Original raster illustrations were generated with the built-in image generation tool. Source PNGs retain the generated artwork; preparation scripts crop, scale, and encode runtime WebP assets while retaining alpha. Terrain and UI painters remain editable code. The supplied reference image guides mood and finish and is not distributed as game artwork.

Exact prompts: [foundation](assets/ILLUSTRATED_PROMPTS.md), [cast](assets/ILLUSTRATED_CAST_PROMPTS.md), [creatures](assets/ILLUSTRATED_CREATURE_PROMPTS.md), [scenery](assets/ILLUSTRATED_SCENERY_PROMPTS.md), [props](assets/ILLUSTRATED_PROP_PROMPTS.md), and [story](assets/ILLUSTRATED_STORY_PROMPTS.md). See also [building crop validation](assets/ILLUSTRATED_BUILDING_QA.md). The embedded Nunito font includes its OFL license.

## Publication

The standalone `index.html` is the publication artifact. The [Pages deployment history](https://github.com/crizpy7-sketch/GOTH/actions) identifies the published commit. Shipping requires the merge's Pages run to succeed, an HTTP 200 response whose SHA-256 matches the local bundle, and a fresh playthrough against [the live game](https://crizpy7-sketch.github.io/GOTH/).
