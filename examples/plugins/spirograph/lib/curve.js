/** Sampled hypotrochoid, in output units, centred in a width x height area. */
exports.hypotrochoid = function hypotrochoid(width, height, petals, ratio, samples) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;
  const inner = radius * ratio;
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2 * petals;
    const k = radius - inner;
    points.push([
      cx + k * Math.cos(t) + inner * Math.cos((k / inner) * t),
      cy + k * Math.sin(t) - inner * Math.sin((k / inner) * t),
    ]);
  }
  return points;
};
