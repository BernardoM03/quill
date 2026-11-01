// A small line icon for each wizard step, drawn in the current text colour.
const PATHS: Record<string, string> = {
  // A pennant on a pole.
  campaign: 'M5 21V4 M5 4h11l-2.5 4L16 12H5',
  // A head and shoulders.
  species: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  // A scroll: a sheet with rolled ends.
  background: 'M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1z M7 16V4 M10 10h4 M10 13h4',
  // A sword, point up.
  class: 'M12 3l2 3v9h-4V6z M7 15h10 M12 15v4 M10.5 21h3',
  // A d20: a hexagon with its inner triangle.
  abilities: 'M12 2l8.5 5v10L12 22l-8.5-5V7z M12 7l5 8H7z M12 2v5 M3.5 7L7 15 M20.5 7L17 15 M7 15l5 7 5-7',
  // A quill.
  name: 'M20 4c-6 0-11 4-13 11l-2 5 5-2c7-2 11-7 11-13z M5 20l8-8',
};

export function StepIcon({ step }: { step: string }) {
  return (
    <svg className="step-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[step] ?? ''} />
    </svg>
  );
}
