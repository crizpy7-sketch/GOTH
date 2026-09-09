// Fixed-timestep game loop. Logic is exactly 60 Hz; render interpolates so the
// game stays smooth on 120 Hz displays and doesn't speed up on slow frames.

const STEP = 1000 / 60;
const MAX_CATCHUP = 5;   // never simulate more than 5 frames in one rAF

export const Loop = {
  tick: 0,
  paused: false,
  fps: 60,
  running: false,
  // Tests drive the loop deterministically by setting this.
  stepMode: false,
};

export function startLoop({ update, render }) {
  let acc = 0, last = performance.now(), frames = 0, fpsAt = last;
  Loop.running = true;

  function frame(now) {
    if (!Loop.running) return;
    requestAnimationFrame(frame);

    let delta = now - last;
    last = now;
    // Tab was backgrounded / debugger paused: drop the gap rather than fast-forward.
    if (delta > 250) delta = STEP;
    acc += delta;

    let steps = 0;
    while (acc >= STEP && steps < MAX_CATCHUP) {
      acc -= STEP;
      steps++;
      if (!Loop.paused) { Loop.tick++; update(1 / 60, Loop.tick); }
    }
    if (steps === MAX_CATCHUP) acc = 0;   // shed the backlog, keep wall-clock honest

    render(acc / STEP);

    frames++;
    if (now - fpsAt >= 1000) { Loop.fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; }
  }
  requestAnimationFrame(frame);
}

export function stopLoop() { Loop.running = false; }

// Used by the test harness: run N logic frames and one render, synchronously.
export function stepFrames(n, update, render) {
  for (let i = 0; i < n; i++) { Loop.tick++; update(1 / 60, Loop.tick); }
  render(0);
}
