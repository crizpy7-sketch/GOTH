// Compatibility menu module. Full menu surfaces are registered by pause/party/UI
// modules; this shim prevents a false boot warning in the bundled standalone build.
export function register() { return true; }
