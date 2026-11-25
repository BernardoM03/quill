// Hex grid arithmetic in hex radii (centre to corner is 1), matching server/maps.py.
// Hexes are flat-topped in columns, with odd columns shifted half a hex down.

const SQRT3 = Math.sqrt(3);

export const hexKey = (col: number, row: number) => `${col},${row}`;

// The four-digit label hex maps use: column then row, counted from 01.
export function hexLabel(col: number, row: number): string {
  const twoDigits = (index: number) => String(index + 1).padStart(2, '0');
  return twoDigits(col) + twoDigits(row);
}

export function hexCentre(col: number, row: number): [number, number] {
  return [1 + 1.5 * col, SQRT3 * (row + 0.5 + 0.5 * (col & 1))];
}

// The six corners, clockwise from the right-hand one (y grows downward).
const CORNERS: [number, number][] = [0, 1, 2, 3, 4, 5].map(i => {
  const angle = (Math.PI / 3) * i;
  return [Math.cos(angle), Math.sin(angle)];
});

const round = (n: number) => Math.round(n * 1000) / 1000;

// A hex as an SVG polygon's points.
export function hexPoints(col: number, row: number): string {
  const [x, y] = hexCentre(col, row);
  return CORNERS.map(([dx, dy]) => `${round(x + dx)},${round(y + dy)}`).join(' ');
}

// The neighbour across each edge, in corner order: edge i runs from corner i to corner i + 1.
// So: lower right, below, lower left, upper left, above, upper right.
export function hexNeighbours(col: number, row: number): [number, number][] {
  // Odd columns sit half a hex lower, which shifts their side neighbours down a row.
  const shift = col & 1;
  return [
    [col + 1, row + shift], [col, row + 1], [col - 1, row + shift],
    [col - 1, row - 1 + shift], [col, row - 1], [col + 1, row - 1 + shift],
  ];
}

// The outline of a set of hexes as an SVG path: every edge with no hex of the set beyond it.
export function outlinePath(hexes: [number, number][], isInSet: (key: string) => boolean): string {
  const parts: string[] = [];
  for (const [col, row] of hexes) {
    const [x, y] = hexCentre(col, row);
    hexNeighbours(col, row).forEach(([neighbourCol, neighbourRow], edge) => {
      if (isInSet(hexKey(neighbourCol, neighbourRow))) return;
      const [ax, ay] = CORNERS[edge];
      const [bx, by] = CORNERS[(edge + 1) % 6];
      parts.push(`M${round(x + ax)} ${round(y + ay)}L${round(x + bx)} ${round(y + by)}`);
    });
  }
  return parts.join('');
}

// The grid's extent for the SVG viewBox, where columns overlap by a quarter and odd columns hang half a hex lower.
export function gridSize(cols: number, rows: number): { width: number, height: number } {
  return { width: 1.5 * cols + 0.5, height: SQRT3 * (rows + (cols > 1 ? 0.5 : 0)) };
}

// The columns and rows covering an image at a scale, mirroring the server so the page can warn early.
export function gridFor(imageAspect: number, hexSize: number, mapWidth: number): { cols: number, rows: number } {
  const widthInRadii = (mapWidth / hexSize) * SQRT3;
  return { cols: Math.ceil(widthInRadii / 1.5), rows: Math.ceil(widthInRadii / imageAspect / SQRT3) };
}

export const MAX_LINE = 150;
export const MAX_HEXES = 10000;
