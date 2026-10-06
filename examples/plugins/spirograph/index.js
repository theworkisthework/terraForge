/**
 * Example generator: a spirograph curve built from settings alone.
 *
 * Its manifest declares "source": "none", so it is never handed an image and
 * never offered where one is expected. It also shows two further parts of the
 * contract: requiring a sibling file, and returning named layers so a single
 * render can drive more than one pen.
 */
const { hypotrochoid } = require("./lib/curve");

function toPath(points) {
  return points.map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2)).join(" ");
}

module.exports.render = function render({ settings, width, height }) {
  // A generator has no source image. `width` and `height` describe the area it
  // has been asked to fill, in output units.
  const petals = Math.round(Number(settings.petals));
  const ratio = Number(settings.ratio);
  const points = hypotrochoid(width, height, petals, ratio, petals * 120);

  if (!settings.twoPens) return toPath(points);

  // Returning layers instead of one path: each becomes its own plottable
  // layer, carrying the label and colour through to the canvas and G-code.
  const half = Math.ceil(points.length / 2);
  return [
    { d: toPath(points.slice(0, half)), label: "Outer sweep", color: "#1b6ac9" },
    { d: toPath(points.slice(half - 1)), label: "Return sweep", color: "#c9451b" },
  ];
};
