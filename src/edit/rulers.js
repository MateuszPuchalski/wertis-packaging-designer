// The ticks on the preview's rulers: a round step in mm (1, 2, 5, 10, 20, 50…) so that the
// numbered ticks sit at least `minGap` screen pixels apart, with finer unnumbered ticks
// between. DOM-free.

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

export function rulerStep(ppm, minGap = 56) {
  return STEPS.find((s) => s * ppm >= minGap) ?? STEPS.at(-1);
}

// Ticks from startMm to endMm: [{ v, major }] with a label on every major tick.
export function rulerTicks(startMm, endMm, ppm, { minGap = 56, minMinor = 6 } = {}) {
  const step = rulerStep(ppm, minGap);
  const minor = [10, 5, 2].map((d) => step / d).find((m) => m * ppm >= minMinor && Number.isInteger(m * 10)) ?? step;
  const ticks = [];
  const first = Math.ceil(startMm / minor - 1e-9);
  for (let i = first; i * minor <= endMm + 1e-9; i++) {
    const v = Math.round(i * minor * 10) / 10 || 0; // never -0
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    ticks.push(major ? { v, major, label: String(v) } : { v, major });
  }
  return { step, minor, ticks };
}
