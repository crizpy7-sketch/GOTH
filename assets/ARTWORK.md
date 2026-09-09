# Artwork provenance

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
