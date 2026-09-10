# Illustrated adventure release

## Product target

A complete opening adventure for the owner's kids to play, using the supplied smooth illustrated fantasy reference. Preserve exploration, battles, creature bonding, village building, real-world family missions, and existing saves. This is an art and usability upgrade, not a habit-dashboard replacement or 3D engine rewrite.

The first release covers Emberhollow, the connecting meadow, Hollowpine Wood, Gran's cottage, battles, important conversations and shared menus. Do not restrict access to other areas. Cover all encounter species and NPCs in these areas, not only the three starters. Later-region exclusive art may follow in a subsequent release.

## Art direction

- Smooth painted storybook forms, warm directional light, natural greens and blue-green shadows. No enlarged pixel clusters in replacement assets.
- Original young traveler: brown hair, green tunic, leather boots and rust-red backpack. Preserve Wren's existing playable role and companions.
- Expressive creatures with consistent silhouettes and proportions across battle and overworld poses.
- Charcoal and antique-gold primary panels; warm cream dialogue and inset cards; Nunito for readable body text. Decorative treatment must not reduce legibility.
- Separate reusable transparent sprites from scenery backgrounds. Reject opaque or painted checkerboard sprite backgrounds, clipped limbs, inconsistent anchors, and broken animation.
- Fixed logical coordinates and collision footprints; higher resolution is a presentation property, not a world-scale change.

## Marketing Chief

Shia Factory's `agents/gary/README.md` maps Marketing Chief to GARY-001. Its runtime charter is brand/growth critique, not game-code implementation. Design Director owns visual and usability direction. Gary's principles emphasize the actual product, honest evidence, clear audience and one next action.

Brief: audience is the owner's kids/family; offer is an inviting creature-and-village adventure; objective is a coherent playable opening in the supplied visual direction; success is completion of the opening play loop with readable controls and consistent art. No claims of engagement or market demand are established by this work.

Live review is NOT YET RUN. The documented local Office endpoint `http://127.0.0.1:8787/hq` refused a connection during preflight. A request for the user's actual Office URL is pending. Reading this package is not Gary answering, and a routed intake must not be labelled a review. Continue independent implementation while resolving runtime access; do not install or change Factory services to manufacture a review.

Sources: https://github.com/crizpy7-sketch/Shia-factory/tree/main/agents/GARY-001 and https://github.com/crizpy7-sketch/Shia-factory/blob/main/boris/src/identity/roster.ts

## Release checklist

- [x] Embedded smooth font with measurement and wrapping tied to the same face.
- [x] 1280x720 backing canvas and filtering metadata for illustrated sprites.
- [x] Rounded shared panels with restrained gold edges.
- [x] Lower-resolution option, persisted and verified without layout changes.
- [ ] Finished hero and all opening NPC walk cycles.
- [ ] Finished opening encounter creatures, front/back and overworld poses.
- [ ] Opening terrain, foliage, buildings, furniture and upgrade stages.
- [ ] Consistent story portraits and battle/conversation backgrounds.
- [ ] Full shared-menu visual pass, including icons and title.
- [ ] Full start/continue, exploration, Gran choice, battle/bond, mission, build and save/reload acceptance.
- [ ] Final visual checks at desktop, 844x390 and 568x320; reduced motion and day/night.
- [ ] Actual Gary review, or explicit unresolved runtime limitation.
- [ ] Verified merge, Pages deployment, and live playthrough.

Current work is LOCAL ONLY on `codex/illustrated-adventure`. Do not call this release finished from preliminary checks. The previous published game remains the last verified release.

## Current implementation checkpoint

Hero and Gran have illustrated overworld walk sheets. The oak and woodland battle background are replaced. Hero east-facing frames mirror the clean west sheet; an unusable generated row and opaque checkerboard repair attempts were rejected. Other opening characters, encounter species, terrain and structures still need the visual pass.

Visual follow-up: Gran's current shared-scale sheet reads shorter than the hero because her wide walking stride determines the fit. Normalize actor framing across the finished cast before calling the scale consistent; retain a shared scale across each walk cycle and do not crop limbs to force a fit.

Input regression repaired: consuming a quick buffered tap after its keyup previously left the next gesture consumed. Consumption now applies to a held gesture only, and a fresh gesture clears old consumption. A targeted regression test and the complete gameplay browser suite cover this.

The first isolated performance measurement found High mode at roughly 40-47 FPS outdoors and Balanced at 60 FPS. High mode now uses a separate 960x540 moving-world surface beneath the 1280x720 interface; close-up scenes retain full resolution. Native text runs and widths are cached with bounded storage. The repeat benchmark still measured High around 44-48 FPS and Balanced at 60 FPS, so Balanced is the default for the kids' playtest. High detail remains an explicit 1280x720 option. This is an evidence-based presentation default, not reduced artwork or gameplay scope. Physical-device performance remains unverified.

Latest local automated coverage: 108 Node tests passed. The full gameplay browser suite passed after the input fix; subsequent Gran/rendering changes require the final regression run before release. `npm run test:illustrated` checks all hero and Gran frames, embedded text, quality switching and desktop/mobile screenshots. `node scripts/measure-illustrated-performance.mjs` records isolated performance without claiming physical-phone results.
