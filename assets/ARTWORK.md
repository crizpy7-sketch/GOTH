# Artwork provenance

## Important conversations (v4)

Generated on 2026-09-09 using the built-in `image_gen` tool in text-to-image mode,
without reference images. Original transparent PNG portraits are preserved as
`gran-willow.png`, `mayor-bramble.png`, and `ash-north.png`; their WebP copies are
336×384 and render at 112×128 logical pixels. The source `hearth-conversation.png`
is optimized to a 640×360 WebP backdrop. `scripts/prepare-story-art.mjs` performs
only trimming, resizing, and WebP encoding, preserving portrait alpha. The village
story scene reuses the existing hearth-valley artwork; the rival scene reuses the
forest clearing. Exact generation prompts follow.

### gran-willow

> Use case: stylized-concept. Production portrait sprite for Guardians of the Hearth, an original cozy pixel fantasy RPG. ONE waist-up elderly grandmother, Gran Willow, isolated on a genuinely TRANSPARENT alpha background. Warm fair skin with smile lines and wrinkles, kind brown eyes, silver-white hair swept into a neat bun, lavender dress, pale lilac knitted shawl with a tiny rose clasp. Gentle wise welcoming smile, relaxed shoulders, hands lightly holding a simple earthenware teacup at waist height. Three-quarter view looking toward screen right, facing an unseen young adventurer. Entire hair bun, head, shoulders, elbows and cup fully contained; flat waist crop at the bottom. Portrait occupies central85 percent of tall4:5 frame. Rich handcrafted premium32-bit RPG pixel art, deliberate crisp square pixel clusters and detailed fabric/facial planes, soft golden fireside light from upper right, plum shadows. Expressive believable mature face, cozy storybook character design. NO scenery, no furniture, no text, no labels, no border, no panel, no frame, no watermark. Not vector, not3D, not photoreal. Readable at about112x128 logical pixels.

### mayor-bramble

> Use case: stylized-concept. Production portrait sprite for Guardians of the Hearth, an original cozy pixel fantasy RPG. ONE waist-up elderly village mayor, Mayor Bramble, isolated on genuinely TRANSPARENT alpha background. Warm fair skin, rounded kind face with age lines and expressive hazel eyes, balding with soft gray hair around sides, a modest tall forest-green village hat with a narrow gold ribbon. Deep leaf-green coat over a mustard-gold waistcoat and cream shirt, simple brown leather belt. Welcoming yet slightly worried expression, one hand resting over his waistcoat. Three-quarter view looking screen right, toward an unseen visitor. Entire hat, shoulders and elbows contained with clear padding; waist crop at bottom. Portrait occupies central85 percent of tall4:5 frame. Rich handcrafted premium32-bit RPG pixel art, deliberate crisp square pixel clusters, warm top-right late-afternoon sunlight, deep olive-brown shadows, detailed woven clothes and expressive believable mature face. Cozy woodland village elder. NO scenery, furniture, text, labels, border, panel, frame or watermark. Not vector, not3D, not photoreal. Readable at112x128 logicalpixels. Match lavender-dressed silver-haired grandma portrait craftsmanship.

### ash-north

> Use case: stylized-concept. Production portrait sprite for Guardians of the Hearth, original cozy pixel fantasy RPG. ONE waist-up young adult traveler called Ash-of-the-North, isolated on genuinely TRANSPARENT alpha background. Fair skin, short swept silver-white hair with pale ice-blue shadows, thoughtful slate-blue eyes, determined skeptical but approachable expression. Weathered navy-blue tunic, blue travel cloak draped over shoulders, soft ivory high collar, simple plain clasp and brown leather strap. NO hat, no weapon. Three-quarter view looking screen right toward an unseen village adventurer, one hand lightly touching cloak clasp. Entire swept hair, head, shoulders, elbows contained with transparent padding; flat waist crop at bottom. Portrait fills central85 percent of tall4:5 frame. Premium handcrafted32-bit RPG pixel art with crisp square pixel clusters, rich woven fabric and expressive face, cool daylight with warm golden right rimlight and deep indigo shadows. Original storybook northern traveler. NO scenery, text, label, panel, border, watermark. Not vector, not3D, not photoreal. Readable at112x128 logicalpixels, same detailed character sprite craftsmanship as kindly silver-haired grandmother in lavender and green-coated village mayor.

### hearth-conversation

> Use case: stylized-concept. Finished environment artwork for an important character conversation scene in an original cozy fantasy pixel RPG, Guardians of the Hearth. Wide cinematic16:9 view across Gran Willow's warm welcoming cottage at seated eye level. Lush handcrafted premium32-bit RPG pixel art, crisp square clustered details and warm painterly depth. In the background on the RIGHT HALF, a glowing stone hearth with a copper kettle, stacks of split logs, shelves of earthenware cups and herbs, oak beams, small window with soft golden afternoon light and glimpses of green garden. Center midground a small round wooden tea table with three tiny folded blankets for young animal companions. LEFT THIRD is quieter muted amber wood and soft lit wall, kept open and low detail for an overlaid character portrait. Lower third dark warm wood and gentle shadow suitable for a dialogue overlay; important scenic elements above bottom third. Intimate, safe, emotionally warm, beautiful light, visual depth, no harsh bloom. NO people, NO creatures, NO lettering, NO text, NO UI, NO border, NO collage, NO watermark. Camera eye-level story scene, not a top-down map, not3D. Exactly one coherent full-bleed16:9 background.


Generated on 2026-09-09 with the built-in `image_gen` tool. PNG originals are preserved in this directory. Optimized WebP copies are consumed by the build and embedded into `index.html`; the game never depends on an external image URL.

The optional `scripts/prepare-world-art.mjs` and `scripts/prepare-guardian-art.mjs`
conversion helpers require Sharp (`npm install --no-save sharp`). They accept a
source PNG path and asset name, preserve alpha, and produce the runtime WebP files.
Normal builds use the committed WebP files and do not require Sharp.

| Asset | Original | Game copy | Use |
| --- | --- | --- | --- |
| Hearth valley | `hearth-valley.png` | `hearth-valley.webp` (1280×720) | Native title background |
| Forest clearing | `forest-clearing.png` | `forest-clearing.webp` (640×360) | Battle environment, rendered at logical 320×180 |

## Valley prompt

Use case: stylized-concept. Asset type: polished landscape background art for the title screen of Guardians of the Hearth, an original cozy creature-bonding village RPG. Wide cinematic 16:9 composition, richly painted 2D game art with deliberate crisp clustered details and warm storybook atmosphere. View from a grassy overlook over an inviting little village of timber cottages with teal and terracotta roofs, a glowing ancient hearth monument, winding sandy paths, a sparkling turquoise river and stone bridge, layered green forest and distant blue mountains under bright soft clouds. Right foreground: a small backpack-wearing young adventurer viewed from behind, beside an original adorable orange ember fox guardian with a leafy flame-shaped tail, both looking over the village. Flowers and wood fence at right edges. Left third is darker forest foliage with low detail, intentionally suitable for clean overlaid game title and menu. World and characters toward the center and right, open sky upper right. Strong sense of depth, sunlit and lush. No lettering, text, logos, watermarks, UI, borders, or collage. Finished professional indie game illustration. Save as project game artwork.

## Clearing prompt

Use case: stylized-concept. Asset type: game battle environment background for original cozy fantasy creature RPG Guardians of the Hearth. Wide 16:9 landscape, finished professional richly illustrated 2D game art with readable stylized forms and crisp detail suitable for downsampling to pixel RPG. A sun-dappled enchanted woodland clearing, mossy ancient trees and ferns framing both edges, layered deep teal foliage in the distance, warm golden sunlight filtering from upper left. Two clear smooth oval grass-and-earth patches: near platform centered at 24 percent width and 73 percent height, far platform centered at 73 percent width and 47 percent height. Open central space, soft grassy ground, small wildflowers confined to edges, distant narrow sparkling stream. Camera three-quarter side view looking across clearing. Foreground lower quarter subdued earthy green space for command HUD overlay. NO creatures, people, text, UI, borders, lettering, logos or watermark. Beautiful lush calm welcoming mood, strong foreground/background separation, original world identity.
# World art v2

## Aquarabbit starter poses (v3)

Generated with the built-in image generation tool in text-to-image mode on
2026-09-09. `aquarabbit-poses.png` preserves the generated transparent source.
`aquarabbit-front.webp` and `aquarabbit-back.webp` use the shared 160×160 frame
and 80×80 logical footprint, prepared by `scripts/prepare-guardian-art.mjs`.
No reference image was passed to the tool. Exact prompt:

> Production sprite sheet for an ORIGINAL cozy fantasy pixel RPG creature called Aquarabbit, a gentle water guardian. Genuinely transparent background alpha, NO ground NO text NO labels NO borders. Exactly two full-body poses arranged horizontally in equal left and right square cells, no overlap, generous transparent padding. LEFT CELL front three-quarter view looking toward left (opposing creature faces screen left). RIGHT CELL rear three-quarter view looking away toward upper right (player companion viewed from behind, showing back, tail, backs of ears, hint of cheek). Both same adorable small aqua-blue woodland hare with large asymmetrical finlike long ears, pale cream-blue throat and chest fluff, sea-teal lower legs, expressive dark navy eyes with warm bright highlights, small rounded nose, soft cheek tufts, and a distinctive translucent teardrop-shaped tail with tiny ripple ridges. Petite sturdy four-legged crouched rabbit stance, strong clear silhouette, hand-crafted fur and soft water-fin textures. Distinctive pond creature with no accessories or markings from existing franchises. Rich blue pixel clusters and pale aqua rim light, deeper teal undersides, warm top-left sunlight. Premium artisanal 32-bit RPG pixel sprite craft, crisp visible square pixel clusters with refined depth, not smooth vector shapes, no 3D. Each pose silhouette occupies about70% of cell, feet near bottom85%, consistent anatomical scale in both poses. All ear tips and feet fully contained. Friendly woodland companion, same detailed sprite craftsmanship as a warm copper fox cub and a layered green leaf owl.

## Embercub, Leafowl and oak

Embercub battle poses: `embercub-poses.png` is the generated transparent source;
`embercub-front.webp` and `embercub-back.webp` share the Leafowl frame dimensions
and foot baseline. Generated with the built-in image generation tool. Prompt:

> Production sprite sheet for an ORIGINAL cozy fantasy pixel RPG creature called Embercub. Genuinely transparent background alpha, NO ground NO text NO labels NO borders. Exactly two full-body poses arranged horizontally in equal left and right square cells, no overlap, generous transparent padding. LEFT CELL front three-quarter view looking toward left (opposing creature faces screen left). RIGHT CELL rear three-quarter view looking away toward upper right (player companion viewed from behind, showing tail, back, backs of ears, hint of cheek). Both same adorable small fox cub, rich burnt-orange and copper fur, little dark paws, fluffy ivory chest tuft and muzzle, tufted swept-back orange ears, big warm expressive dark eyes, fluffy curling tail ending in a small lively golden flame. Unique original design, no markings/accessories copied from existing franchises. Rich fur pixel clusters and gold rim light, darker rust undersides, chunky charming face and petite four-legged stance. Premium artisanal 32-bit RPG pixel sprite craft, crisp pixel clusters with refined depth, no smooth vector shapes, no 3D. Each pose silhouette occupies about70% of cell, feet near bottom85%, consistent scale. Warm top-left sunlight. All flame tips and feet fully contained. Design to match Leafowl forest creature art but a fox-shaped fire guardian.


Leafowl battle poses: `leafowl-poses.png` is the generated transparent source;
`leafowl-front.webp` and `leafowl-back.webp` preserve alpha and share the same
160×160 runtime frame, 80×80 logical footprint and foot baseline.
Generated with the built-in image generation tool. Prompt:

> Production sprite sheet for an original cozy fantasy pixel RPG creature called Leafowl. Genuinely transparent background alpha, NO ground NO text NO labels NO borders. Exactly two full-body poses arranged horizontally in equal left and right square cells, no overlap, generous transparent padding. LEFT CELL front three-quarter view looking toward left (the opposing creature on right side of battle faces screen left). RIGHT CELL rear three-quarter view looking away toward upper right. Both are same adorable round little owl guardian made of layered moss-green oak leaves, gold cream heart-shaped face, big expressive dark eyes with amber highlights, tiny beak and warm brown talons, two small leaf tufts like ears. Rich individually readable feather-leaf clusters, hand-drawn crisp premium pixel art, woodland olive jade and soft chartreuse palette, cream face with dark eye sockets, deep cel shadows and warm top-left light. Each pose silhouette about 70% of square cell with feet near bottom85%. Consistent anatomical scale in both poses. Charming living creature like the original fantasy references, NOT any existing copyrighted character. Sprite craft of detailed premium 32-bit RPG, visible square pixel clusters, no vector smooth shapes, no photorealism, no UI.


The oak is generated with the built-in image generation tool and shipped as
`forest-oak.png` (source) and `forest-oak.webp` (144×192 runtime sprite).
The generated alpha is preserved. Its world footprint is 48×64 logical pixels;
collision remains on the authored tree roots. This is a reusable game sprite.

Prompt:

> Create one production-ready 2D game sprite: a magnificent lush broadleaf oak tree for an original cozy fantasy top-down pixel RPG. Single entire tree centered, isolated on genuinely TRANSPARENT background with alpha, no ground tile, no scene, no text, no border, no cast shadow beyond tiny roots. View from overhead at 3/4 RPG angle: see broad upper canopy and short thick gnarled trunk below. Dense asymmetrical rounded clusters of moss-green leaves, lime and golden sunlit leaf clusters top-left, dark teal forest shadows below, deeply textured cinnamon brown bark, roots. Shape clear like premium artisanal pixel art: crisp square pixel clusters at a notional 96 by 128 game sprite resolution, restrained painterly depth, no smooth vector shapes, no glossy 3D. Tree canopy nearly fills width, trunk visible lower quarter, all tips contained with transparent margins. Warm welcoming woodland, exceptionally rich textured foliage and readable silhouette.
