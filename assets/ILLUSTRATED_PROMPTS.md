# Illustrated production prompts

Built-in image generation tool; no paid API or CLI generation path used. Output must pass alpha, frame and visual checks before becoming runtime artwork. Defective intermediate generations are not production assets.

## Hero source sheet

Accepted files: `illustrated/hero-source.png`, `illustrated/hero-down.webp`, `illustrated/hero-up.webp`, `illustrated/hero-left.webp`. East mirrors the clean west frames at runtime. The defective fourth source row is never sliced into the game. The two attempted repair images had opaque checkerboards and were rejected.

Use case: stylized-concept. Production game sprite sheet for Guardians of the Hearth, a warm illustrated 2D fantasy adventure for children. A genuinely TRANSPARENT background. EXACTLY 16 separate full-body sprites in a perfectly regular 4 COLUMN x 4 ROW grid. Each cell equally sized, substantial transparent padding, no overlap. SAME original young adventurer in every frame: tousled dark brown hair, expressive brown eyes, warm tan skin, short forest-green travel tunic with a little gold hearth clasp, dark brown trousers, brown boots, small rust-red backpack. Cute storybook proportions, head about one third of height, consistent silhouette and face. Smooth professionally painted fantasy mobile-game art, soft sculpted shading, warm golden upper-left light, finely detailed leather and cloth. NO pixel art, no pixel outlines, no text, labels, borders, or ground plane. Top-down three-quarter RPG camera, showing top of head and shoulders. ROW1 faces viewer/south: stand, left-foot-forward, stand, right-foot-forward. ROW2 faces away/north: same four walking poses, backpack visible. ROW3 faces screen-left/west: same four poses. ROW4 faces screen-right/east: same four poses. Every foot baseline aligned within its cell, identical scale throughout, all limbs completely contained. This is usable transparent sprite artwork, not a mockup.

## Hero cleanup

Edit this exact 4 by 4 transparent game sprite sheet. Preserve the same character identity, painterly art, all sixteen poses, grid positions, scale and transparent background. Remove the unwanted white horizontal ribbon/smoke/streak and colored debris crossing the BOTTOM ROW characters. Restore unobstructed green tunics, forearms, backpack straps, brown pants and boots in those four east-facing characters. Nothing should surround or connect the characters. Clean truly transparent alpha background between and around all sixteen complete full-body figures. No ground, no smoke, no weapons, no text. Do not alter the top three rows.

## Hero transparency correction

Rejected correction; not used in the game.

Remove ONLY the gray-and-white checkerboard background from this supplied character sheet. Deliver a PNG with real transparent alpha: every checkerboard square must become fully transparent, NOT a drawing of transparency. Preserve all sixteen characters at identical positions, size, colors, poses and detailed edges. The entire area between characters must be empty alpha=0. Do not add ground, shadows outside the feet, new checkerboards, gradients, smoke, outlines, or other content. The output is a transparent cutout sprite sheet used over a game map.

## Scenery source sheet

Use case stylized-concept. Production transparent environment sprite atlas for a premium illustrated 2D fantasy game for kids, Guardians of the Hearth. EXACTLY SIX individual scenery objects arranged in a precise 3 column by 2 row grid with equal cells and generous transparent margins. Full objects never touch and fit entirely inside their own cells. TOP ROW, left to right: one magnificent broad round leafy oak tree with warm olive-green leaves and strong brown trunk; one tall deep evergreen pine tree; one rounded flowering bush with tiny cream and pink flowers. BOTTOM ROW left to right: one mossy rounded boulder; one old wooden signpost without writing; one glowing amber lantern on a crooked wooden post. Camera consistent elevated three-quarter top-down orthographic RPG view, ground-contact point at bottom center of each object. Smooth painted storybook fantasy art with finely sculpted foliage clusters, soft warm light from upper left, rich natural greens, cool blue-green shadows, delicate highlighted edges. NO pixel art, no outlines made of pixels, no photographic texture. No ground plane, no background, no platform or scenery connecting objects, no text, no watermark, genuinely TRANSPARENT alpha background. Objects have distinct readable silhouettes at small scale.

## Scenery transparency correction

Rejected correction; not used in the game.

Cut out all SIX scenery objects from this exact image onto a genuinely transparent PNG alpha background. Remove ALL of the blurry colored background, the gold/green light hazes between objects and dark backdrop. Preserve the oak, pine, flowering bush, rock, signpost and lantern post at their existing sizes and positions. Preserve their leaves and roots with clean edges. Every pixel outside the objects must be transparent alpha=0, including all gaps between objects. No checkerboard painted in the image, no solid background. This must be a usable six-object transparent sprite sheet.

## Individual oak (accepted)

Production sprite, ONE oak tree isolated on a genuinely TRANSPARENT alpha background. Entire tree with roots, full foliage and branches contained, clear padding on all sides. Smooth hand-painted storybook fantasy game art, rich olive green foliage, rounded clustered leaves, warm golden light from upper left, cool forest shadows, sculpted brown trunk. Elevated three-quarter orthographic camera for a top-down RPG, same viewpoint as a little adventurer seen from above. Organic silhouette, intricate readable leaves, trunk bottom at center. No scene or backdrop, NO colored halo, NO gradient, NO checkerboard, NO ground, NO sky, NO grass landscape, NO text. One cutout game object, transparent PNG. Not pixel art, not photograph.

Saved original and optimized asset: `illustrated/oak-source.png`, `illustrated/oak.webp`. The generated alpha is preserved. This replaces the rejected multi-object scenery sheet.

## Woodland battle clearing (accepted)

Use case: stylized-concept. A finished 16:9 background painting for a children's premium fantasy creature-bonding game called Guardians of the Hearth. A beautiful welcoming woodland clearing at late afternoon. Smooth richly illustrated storybook rendering, luminous soft sunlight through high leafy oak branches, sculpted mossy rocks, delicate ferns and wildflowers framing the edges, layered deep emerald forest in the distance. Warm gold and blue-green palette, painterly depth and charming handcrafted detail. Camera low three-quarter eye level across a gently curved clearing. Broad uncluttered moss-and-earth stage across the middle and bottom, with LEFT foreground and RIGHT middle distance kept open for two creature sprites. Scenic focal point small distant ancient stone arch glimpsed through the central trees. Full bleed landscape, no characters, no creatures, no UI, no text, no labels, no borders, no watermark. Not pixel art, not photographic, no visible square pixel clusters. Light, warm and safe rather than scary. Clear silhouettes and quiet detail in the playing area.

Saved original and optimized asset: `illustrated/woodland-battle-source.png`, `illustrated/woodland-battle.webp`.

## Gran Willow walk sheet (accepted)

Accepted files: `illustrated/gran-source.png` and the four `illustrated/gran-{down,up,left,right}.webp` sheets. Each contains four frames with a shared scale and bottom-center anchor.

Use case: stylized-concept. Production game sprite sheet for Guardians of the Hearth, a warm illustrated 2D fantasy adventure for children. Genuinely TRANSPARENT alpha background. EXACTLY 16 separate full-body sprites in a perfectly regular 4 COLUMN x 4 ROW grid. Each cell equal size with generous empty padding. SAME elderly grandmother in every frame: Gran Willow, friendly wrinkled face, silver white hair in a neat bun, round warm face, lavender long dress to ankles, lilac knitted shawl, simple dark shoes. Short rounded storybook proportions, head one third of height. Smooth professionally painted fantasy game art, softly sculpted shading, warm golden light upper-left, matching a brown-haired young traveler in green tunic. NO pixel art, no text, no borders, no scenery, no ground plane. Elevated three-quarter top-down RPG camera. ROW1 faces viewer/south: stand, left foot forward, stand, right foot forward. ROW2 faces away/north: same four walking poses. ROW3 faces screen-left/west: same four poses. ROW4 faces screen-right/east: same four poses. Walking is subtle and dignified with gentle dress movement. All figures entirely contained, identical scale, consistent face and costume, baseline aligned per cell. Truly transparent sprite sheet, no background.

## Font licensing

Nunito variable TrueType from https://github.com/google/fonts/tree/main/ofl/nunito. Embedded for offline use. License retained in `fonts/OFL.txt`.
