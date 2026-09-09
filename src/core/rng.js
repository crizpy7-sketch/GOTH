// Seeded RNG (mulberry32). Deterministic so battles and art are reproducible,
// which is what lets tests assert on generated output.

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    get seed() { return s; },
    set seed(v) { s = v >>> 0; },
    float: next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),   // inclusive
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
    weighted(entries) { // [[value, weight], ...]
      let total = 0;
      for (const e of entries) total += e[1];
      let r = next() * total;
      for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
      return entries[entries.length - 1][0];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

// Stable string hash — used to derive per-tile art variation from coordinates so
// the same tile always looks the same without storing anything.
export function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const rng = makeRng(Date.now() & 0x7fffffff);
