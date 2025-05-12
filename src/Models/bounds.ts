import L from "leaflet";

export function compareBounds(
  a: L.Bounds | undefined,
  b: L.Bounds | undefined
) {
  return a === b ? true : !a || !b ? false : a.equals(b);
}

/**
 * Parse a native bounds definition as L.Bounds
 */
export function parseBounds(bounds?: {
  min?: { x?: number; y?: number };
  max?: { x?: number; y?: number };
}): L.Bounds | undefined {
  if (!bounds?.min || !bounds?.max) {
    return;
  }

  const { x: xmin, y: ymin } = bounds.min;
  const { x: xmax, y: ymax } = bounds.max;

  if (
    xmin === undefined ||
    ymin === undefined ||
    xmax === undefined ||
    ymax === undefined
  ) {
    return;
  }

  return L.bounds([
    [xmin, ymin],
    [xmax, ymax]
  ]);
}
