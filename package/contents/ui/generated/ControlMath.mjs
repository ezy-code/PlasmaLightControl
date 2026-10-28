// src/panel/controlMath.ts
function wheelPick(dx, dy, radius) {
  const distance = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx);
  if (angle < 0)
    angle += 2 * Math.PI;
  return { hue01: angle / (2 * Math.PI), saturation01: Math.min(1, distance / radius) };
}
function wheelSelector(hue, saturation, radius) {
  const angle = hue * 2 * Math.PI;
  return {
    x: Math.cos(angle) * saturation * radius,
    y: Math.sin(angle) * saturation * radius
  };
}
function brightnessStep(brightness, deltaPercent) {
  const percent = Math.max(0, Math.min(100, Math.round(brightness / 255 * 100) + deltaPercent));
  const next = Math.round(percent * 255 / 100);
  return next === brightness ? null : next;
}
function brightnessPercent(brightness) {
  return Math.round(brightness / 255 * 100);
}
function effectIndex(effects, current) {
  if (!Array.isArray(effects))
    return 0;
  return Math.max(0, effects.indexOf(current));
}
export {
  brightnessPercent,
  brightnessStep,
  effectIndex,
  wheelPick,
  wheelSelector
};
