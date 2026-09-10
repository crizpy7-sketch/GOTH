# Guardians of the Hearth

A cozy creature-bonding and village-building RPG. Explore Emberhollow, meet its residents, befriend Guardians, and bring the village to life through shared family missions.

## Play

[Play on GitHub Pages](https://crizpy7-sketch.github.io/GOTH/) or open **index.html** in a modern browser. All code, sprites, and illustration assets are embedded, so the delivered game also works offline. Saves stay in that browser on that device. For a consistent local save origin, run `npm run preview` and open http://127.0.0.1:4173.

| Action | Keyboard | Controller | Touch |
| --- | --- | --- | --- |
| Move / choose | WASD or arrows | Stick / D-pad | Stick |
| Interact / confirm | E, Enter, Space, Z | A | A |
| Back | Escape, X | B | B |
| Run | Shift | X | Hold outer stick |
| Journal | M | Menu | Menu |
| Village shortcut | C | View | Journal → Village |

On phones, play in landscape. Translucent controls overlay the playfield edges, move clear of dialogue, and switch to precise arrows in menus. The fullscreen button appears on supported browsers. The title menu supports mouse, touch, keyboard, and controller. Settings include sound, volume, text speed, journey hints, and reduced motion.

## Important conversations v4

Talk to Gran Willow to see the new story presentation. Existing saves receive a
one-time reunion; new players choose their first companion inside the same scene.

- Important exchanges have large character portraits, illustrated settings, quiet music, and player-paced dialogue.
- Gran's starter welcome, the Mayor's welcome/reflection and Level 4 milestone, and the first rival meeting use this presentation. Ordinary NPCs, shops, and repeat chats stay quick.
- Preview Embercub, Leafowl, or Aquarabbit, then confirm a companion. Cancelling gives nothing and lets you return later. A successful choice continues into the welcome without reopening dialogue windows.
- Keyboard, touch, and gamepad controls support revealing text, advancing pages, and choosing a Guardian. Reduced motion, reading speed, saved progress, and accessibility labels are respected.
- The scene pauses exploration and restores its music and controls afterward.

Run `npm run test:story` with the preview server running for the dedicated desktop
and mobile conversation checks. New artwork sources, optimized copies, and exact
generation prompts are documented in [assets/ARTWORK.md](assets/ARTWORK.md).

## Bonding and discovery v3

- A dedicated Bond action shows charm stock and the current success chance before an offer. Four woven knots reflect the actual trust beats, with clear welcome and destination feedback.
- Compact forest-green battle cards and a five-action command ribbon leave more room for the Guardians. Empty charm stock points to Cobb's shop.
- Aquarabbit joins Embercub and Leafowl with detailed transparent front and back battle poses, using the same frame size and foot baseline.
- The Guardians screen includes Travelling and At home rosters. Retrieve friends, swap a full team safely, or choose **Travel beside me** to change your walking companion. Tabs and cards support direct taps/clicks; Back returns from home pages to the tabs.
- Facing a villager or useful object shows its actual interaction. Nearby villagers pause so they are easier to talk to; prompts respect the journey-hints setting.
- Cobb in Gladewind Meadow now sells Woven Charms (12 coins) and Warm Salves (18 coins), with stock, balance, purchase feedback and saved receipts in the village ledger.
- The journal shows the current next step and travelling/home counts. Existing saves retain their Guardians and progress.

## World and player experience v2

- Wider exploration camera with a 960×540 render surface and separate, readable UI coordinates.
- Detailed transparent oak sprites, HD terrain, natural path edges, worn paving, timber interiors and seasonal foliage.
- Larger established homes with doors aligned to their entrances; older saves recover safely from expanded footprints.
- Original Embercub and Leafowl battle poses, sharing consistent framing and scale.
- Your lead Guardian follows the route you actually walked, including corners and ledges.
- Compact destination guidance, hints that tuck away, and a minimap that marks the camera, buildings and exits.
- Cached lighting and silhouettes keep the added detail from adding repeated pixel processing to every frame.

## Graphics and experience update

- Original illustrated valley title and woodland battle clearing, embedded as optimized WebP assets.
- Brighter terrain, clear paths, sculpted tree canopies, seasonal foliage, richer roofs and a directional backpack character.
- A distinct Hearthstone monument with visible upgrades.
- Terrain-aware reflections and shadows, butterflies/fireflies, dry interiors and readable nighttime lighting.
- Battle health changes, hit flashes, floating damage and fainting follow their corresponding events. Move choices show type effectiveness; exhausted moves allow Struggle.
- Readable party portraits, mission instructions and rewards; a journal with accurate save feedback; objective and destination guidance.
- Dialogue reveals the current page on the first confirm tap and advances on the next.

## Develop

The illustrated adventure upgrade is in progress on its feature branch. See
[release scope and evidence](ILLUSTRATED_RELEASE.md) and
[production art prompts](assets/ILLUSTRATED_PROMPTS.md). Balanced graphics defaults
to a 960×540 render surface; Settings also offers High detail at 1280×720.
Both modes use the same art, smooth embedded typography, and gameplay coordinates.
The new asset preparation helpers require Sharp; normal builds use committed art.
Run `npm run test:illustrated` with the preview server running to check the new
font, character sheets, and graphics modes at desktop and two mobile sizes.

Requires Node.js 20 or newer. The editable source lives in `src/`; **index.html is generated**. No runtime framework or external network request is required.

```sh
npm run build
npm test
npm run preview
```

The build script resolves dependencies in order, embeds the source modules and artwork into the shell, and keeps the standalone distribution compatible with direct file opening. The manifest lists source module IDs; dependency mappings are rebuilt from source. Add new module IDs to `scripts/module-manifest.json` when adding modules.

For browser regression tests, install development dependencies and Chromium:

```sh
npm install
npx playwright install chromium
npm run preview
# In another terminal:
npm run test:browser
```

The suite uses an isolated browser profile and disposable saves. It writes screenshots and results to ignored `artifacts/`. Tests cover the actual battle engine, bonding rewards, roster conservation, shop purchases, inputs, UI state, weather and terrain behavior, as well as bundle integrity. Browser checks cover onboarding, movement, menus, battles, Bond cancellation, home swaps, companion selection, interaction prompts, save/reload, continuing, mobile controls and portrait guidance. These are Chromium checks; physical iOS/Android and real gamepads still need device testing.

## Artwork

Original illustrations were generated with the built-in image generation tool, then resized and encoded as WebP for distribution. The reference board guided composition and mood; it is not shipped as game art. See [asset provenance and prompts](assets/ARTWORK.md). Existing procedural pixel assets retain their editable painters.
