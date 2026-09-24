/**
 * Example bitmap renderer: parallel lines that wobble where the image is dark.
 *
 * Shows the shape of a renderer that needs a source image — its manifest
 * declares "source": "required", so it is offered wherever a bitmap is being
 * rendered and never for a generator.
 *
 * It also shows a renderer anchoring its detail to the pen rather than to the
 * source image. A bitmap can be any resolution, and sampling once per pixel
 * makes the path grow with the picture rather than with the drawing — a
 * 12-megapixel photo produced nearly 25MB of path data that way, most of it
 * detail no pen could ever put on paper.
 */

/**
 * The finest mark a pen can actually make. Nothing below this is worth
 * computing, sampling, or storing: it costs memory and plotting time and
 * cannot appear in the drawing.
 */
const PEN_RESOLUTION_MM = 0.1;

/**
 * Decimal places to write coordinates with, so the grid lands just under the
 * pen's resolution and no finer. Derived from `scale` rather than fixed,
 * because an output unit is a source pixel for a bitmap and a millimetre for
 * a generator — the same number of decimals means very different precision.
 */
function coordinateDecimals(scale) {
  const quantumMM = PEN_RESOLUTION_MM / 2;
  return Math.max(0, Math.ceil(Math.log10(scale / quantumMM)));
}

/** Tone at a point, 0 = black, 255 = white. Outside the image reads as white. */
function toneAt(source, x, y) {
  const sx = Math.round(x);
  const sy = Math.round(y);
  if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) return 255;
  return source.values[sy * source.width + sx] ?? 255;
}

module.exports.render = function render({ source, settings, width, height, scale }) {
  // `scale` is millimetres per output unit. Settings are in millimetres, so
  // divide by it to work in the same units the returned path uses.
  const unitsPerMM = 1 / Math.max(scale, 1e-6);
  const spacing = Math.max(0.2, Number(settings.spacingMM)) * unitsPerMM;
  const amplitude = Math.max(0, Number(settings.amplitudeMM)) * unitsPerMM;
  const vertical = settings.direction === "vertical";
  const skipWhite = settings.skipWhite !== false;

  const alongMax = vertical ? height : width;
  const acrossMax = vertical ? width : height;

  // Sample often enough to draw the wave cleanly, but never finer than the
  // pen can resolve — points closer together than that are indistinguishable
  // on paper.
  const penStep = PEN_RESOLUTION_MM * unitsPerMM;
  const wavelength = Math.max(spacing * 2, penStep * 8);
  const step = Math.max(penStep, wavelength / 8);
  const decimals = coordinateDecimals(scale);

  const commands = [];
  for (let across = spacing / 2; across < acrossMax; across += spacing) {
    let penDown = false;
    for (let along = 0; along <= alongMax; along += step) {
      const x = vertical ? across : along;
      const y = vertical ? along : across;
      const ink = 1 - toneAt(source, x, y) / 255;

      if (skipWhite && ink < 0.05) {
        penDown = false;
        continue;
      }

      // Displace perpendicular to the line, proportional to how dark it is.
      const offset = Math.sin((along / wavelength) * Math.PI * 2) * amplitude * ink;
      const px = vertical ? x + offset : x;
      const py = vertical ? y : y + offset;

      commands.push((penDown ? "L" : "M") + px.toFixed(decimals) + " " + py.toFixed(decimals));
      penDown = true;
    }
  }

  return commands.join(" ");
};
