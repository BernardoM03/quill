import { memo, useMemo, useState, type ReactNode } from 'react';

import { gridSize, hexCentre, hexKey, hexLabel, hexPoints, outlinePath } from './hexMath';
import './Maps.css';

export interface hexTooltip {
  title: string,
  text?: string,
}

interface cell {
  key: string,
  col: number,
  row: number,
  points: string,
  className: string,
  dot: boolean,
}

// Every hex polygon. Memoised: hovering and selecting redraw only the highlights on top,
// not the thousand-odd hexes underneath.
const HexLayer = memo(function HexLayer({ cells }: { cells: cell[] }) {
  return (
    <>
      {cells.map(c => <polygon key={c.key} data-hex={c.key} className={c.className} points={c.points} />)}
      {cells.filter(c => c.dot).map(c => {
        const [x, y] = hexCentre(c.col, c.row);
        return <circle key={c.key} className="hexmap__dot" cx={x} cy={y} r={0.16} />;
      })}
    </>
  );
});

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

// A hex map: the land's hexes with their outline over the rest of the grid, drawn as SVG in
// hex radii. Hovering a hex shows its tooltip; clicking one calls onHexClick. The hexes are
// one layer handled by a single listener each for hover and click, found through their
// data-hex. The grid's other hexes are drawn faintly and ignore the pointer, unless
// seaClickable.
export function HexMap({ grid, land, classes, dots, seaClickable = false, image, selected, tooltip, onHexClick, label, corner }: {
  grid: { cols: number, rows: number },
  land: [number, number][],
  // Extra class names per hex key (its status, say). Pass a stable Map.
  classes?: Map<string, string>,
  // Hexes marked with a dot, by key. Pass a stable Set.
  dots?: Set<string>,
  // Let the hexes that aren't land be hovered and clicked too (to put them on the map).
  seaClickable?: boolean,
  // The original image behind the hexes; width and height in hex radii.
  image?: { url: string, width: number, height: number, opacity: number },
  selected?: string | null,
  tooltip?: (col: number, row: number, isLand: boolean) => hexTooltip | null,
  onHexClick?: (col: number, row: number, isLand: boolean) => void,
  label: string,
  // Shown in the frame's bottom right corner, as the zoom buttons are in its top right.
  corner?: ReactNode,
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const landKeys = useMemo(() => new Set(land.map(([col, row]) => hexKey(col, row))), [land]);
  const outline = useMemo(() => outlinePath(land, key => landKeys.has(key)), [land, landKeys]);
  const cells = useMemo(() => {
    const all: cell[] = [];
    const add = (col: number, row: number, isLand: boolean) => {
      const key = hexKey(col, row);
      const extra = isLand ? classes?.get(key) : undefined;
      all.push({
        key, col, row, points: hexPoints(col, row),
        className: `hexmap__hex ${isLand ? 'hexmap__hex--land' : 'hexmap__hex--sea'}${extra ? ` ${extra}` : ''}`,
        dot: isLand && !!dots?.has(key),
      });
    };
    for (let col = 0; col < grid.cols; col++) {
      for (let row = 0; row < grid.rows; row++) add(col, row, landKeys.has(hexKey(col, row)));
    }
    // Later polygons draw over earlier ones' shared edges: the sea first, then plain land,
    // then the hexes with a status, so their stronger borders stay whole.
    const rank = (c: cell) => (c.className.includes('--sea') ? 0 : classes?.has(c.key) ? 2 : 1);
    return all.sort((a, b) => rank(a) - rank(b));
  }, [grid, landKeys, classes, dots]);

  const size = gridSize(grid.cols, grid.rows);

  // The hex under an event, from the polygon's data-hex.
  function hexAt(target: EventTarget): [number, number] | null {
    const key = (target as Element).closest?.('[data-hex]')?.getAttribute('data-hex');
    if (!key) return null;
    const [col, row] = key.split(',').map(Number);
    return [col, row];
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const hex = hexAt(e.target);
    const key = hex ? hexKey(hex[0], hex[1]) : null;
    if (key !== hover) setHover(key);
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const hex = hexAt(e.target);
    if (hex && onHexClick) onHexClick(hex[0], hex[1], landKeys.has(hexKey(hex[0], hex[1])));
  }

  const hovered = hover ? hover.split(',').map(Number) as [number, number] : null;
  const tip = hovered && tooltip ? tooltip(hovered[0], hovered[1], landKeys.has(hover!)) : null;
  const tipAt = hovered ? hexCentre(hovered[0], hovered[1]) : null;
  const picked = selected ? selected.split(',').map(Number) as [number, number] : null;

  return (
    <div className="hexmap">
      <div className="hexmap__zoom" role="group" aria-label="Zoom">
        <button type="button" className="setting-button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.5))}>−</button>
        <span className="hexmap__zoom-value">{Math.round(zoom * 100)}%</span>
        <button type="button" className="setting-button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.5))}>+</button>
      </div>
      <div className="hexmap__scroll">
        <div className="hexmap__canvas" style={{ width: `${zoom * 100}%` }}>
          <svg
            className={`hexmap__svg${image ? ' hexmap__svg--underlay' : ''}${onHexClick ? ' hexmap__svg--clickable' : ''}${seaClickable ? ' hexmap__svg--sea-clickable' : ''}`}
            viewBox={`-0.1 -0.1 ${size.width + 0.2} ${size.height + 0.2}`}
            role="img"
            aria-label={label}
            onPointerMove={handleMove}
            onPointerLeave={() => setHover(null)}
            onClick={handleClick}
          >
            {image && (
              <image href={image.url} x={0} y={0} width={image.width} height={image.height}
                preserveAspectRatio="none" opacity={image.opacity} />
            )}
            <HexLayer cells={cells} />
            <path className="hexmap__outline" d={outline} />
            {hovered && <polygon className="hexmap__hover" points={hexPoints(hovered[0], hovered[1])} />}
            {picked && <polygon className="hexmap__selected" points={hexPoints(picked[0], picked[1])} />}
          </svg>
          {tip && tipAt && hovered && (
            <div className="hexmap__tooltip" role="tooltip"
              style={{ left: `${((tipAt[0] + 0.1) / (size.width + 0.2)) * 100}%`, top: `${((tipAt[1] - 0.8) / (size.height + 0.2)) * 100}%` }}>
              <span className="hexmap__tooltip-title">{tip.title}</span>
              <span className="hexmap__tooltip-label">Hex {hexLabel(hovered[0], hovered[1])}</span>
              {tip.text && <span className="hexmap__tooltip-text">{tip.text}</span>}
            </div>
          )}
        </div>
      </div>
      {corner && <div className="hexmap__corner">{corner}</div>}
    </div>
  );
}
