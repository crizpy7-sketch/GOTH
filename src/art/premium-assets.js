// Premium vertical-slice sheet overrides v1.
import { Atlas } from './atlas.js';
const ASSETS = {
  emberOW: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAYAAAB3AH1ZAAABRElEQVR4nGNgGC4gQlX2PznqWZAFVtx+zEiKAejqkcX+dxlhOIix7BwjumNZkBWQYwA2hy1PFcUq97/L6H/k7NcoYkzYDMBmOcwAXJbDHI7LchiAycPUwx1ArgG4gN6kV3j5MI9ghACpBuACl/LEGBjC8iAYxscCcDqAWAOQwYrbjxnR4xgdwOSXr41liFCV/Y/iAHIMQJaLUJX932/KBVfDsGoSBGPRGxm8mGHF7ceMGNmo35SLofD0N6xpAZsB2PQzMDAwFJ7+hqEfZjayPhYMVVCF2EICZgCjXhvB8gLmEEIAqwNIMQAdFJ7+hlMvtlDBSITYFBEjx8CAyJrY1MHE0KMNIyhhCQvdF7gMwAY0JGUCDHgY1yOLXfjyP/DG8ycb0NWiGKYhKRMAY2MzAMbGZhC6fnwAWT9W3+AyCJfFlOgHAEhXxImSjL6xAAAAAElFTkSuQmCC",
};
export function register() {
  Atlas.defineSheet('t.tree.oak', 48, 64, 1, '__OAK_ART__', {frameW:144,frameH:192,pixelRatio:3,premium:true});
  Atlas.defineSheet('g.leafowl.front', 80, 80, 1, '__LEAFOWL_FRONT_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.leafowl.back', 80, 80, 1, '__LEAFOWL_BACK_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('scene.battle', 320, 180, 1, '__BATTLE_ART__', { frameW:640, frameH:360, pixelRatio:2, premium:true });
  Atlas.defineSheet('g.embercub.front', 80, 80, 1, '__EMBERCUB_FRONT_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.embercub.back', 80, 80, 1, '__EMBERCUB_BACK_ART__', {frameW:160,frameH:160,pixelRatio:2,premium:true});
  Atlas.defineSheet('g.embercub.ow', 16, 16, 2, ASSETS.emberOW, { frameW:16, frameH:16, premium:true });
}
