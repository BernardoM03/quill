import { useEffect, useRef, useState } from 'react';

import { MAX_ZOOM, clamp, zoomBy } from './cropMath';
import { centreCrop, renderPortrait, type squareCrop } from './makePortrait';
import '../DeleteCampaignDialog.css';
import './PortraitCropper.css';

// The frame on screen, in CSS pixels. The canvas behind it is drawn at the screen's
// pixel density so the preview stays sharp.
const VIEW = 280;
const KEY_STEP = 0.05; // arrow keys move by this share of the frame

// Lets the player choose which square of the image becomes the portrait: drag to move,
// slider, wheel or pinch to zoom, arrow keys and +/- from the keyboard. Starts on the
// largest centred square. onConfirm gets the 256x256 portrait, ready to upload.
export function PortraitCropper({ image, onConfirm, onClose }: {
  image: ImageBitmap;
  onConfirm: (portrait: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<squareCrop>(() => centreCrop(image));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fingers or the mouse currently on the frame, by pointer id, for dragging and pinching.
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const full = Math.min(image.width, image.height);
  const zoom = full / crop.size;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Redraw the frame whenever the crop changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const pixels = Math.round(VIEW * (window.devicePixelRatio || 1));
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, pixels, pixels);
  }, [image, crop]);

  // Wheel zoom toward the cursor. Added by hand because React's wheel listener can't
  // stop the page from scrolling at the same time.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = canvas.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setCrop(c => zoomBy(image, c, factor, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [image]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const box = e.currentTarget.getBoundingClientRect();

    if (others.length === 1) {
      // Pinch: zoom by how much the distance between the two fingers changed.
      const other = others[0];
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) {
        const midX = ((e.clientX + other.x) / 2 - box.left) / box.width;
        const midY = ((e.clientY + other.y) / 2 - box.top) / box.height;
        setCrop(c => zoomBy(image, c, after / before, midX, midY));
      }
      return;
    }
    // Drag: the image follows the pointer, so the crop moves the other way.
    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    setCrop(c => clamp(image, { ...c, x: c.x - dx * (c.size / box.width), y: c.y - dy * (c.size / box.height) }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const step = crop.size * KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setCrop(c => clamp(image, { ...c, x: c.x + dx, y: c.y + dy }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setCrop(c => zoomBy(image, c, 1.15));
    } else if (e.key === '-') {
      e.preventDefault();
      setCrop(c => zoomBy(image, c, 1 / 1.15));
    }
  }

  function handleZoomSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const target = Number(e.target.value);
    setCrop(c => zoomBy(image, c, target / (full / c.size)));
  }

  function handleConfirm() {
    setBusy(true);
    setError(null);
    renderPortrait(image, crop)
      .then(onConfirm)
      .then(() => dialogRef.current?.close())
      .catch(err => {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        setError(response?.data?.error ?? (err instanceof Error ? err.message : 'Could not upload the portrait.'));
        setBusy(false);
      });
  }

  return (
    <dialog ref={dialogRef} className="delete-dialog cropper" onClose={onClose}>
      <h2 className="delete-dialog__title">Frame the portrait</h2>
      <p className="cropper__hint">Drag to move. Zoom with the slider, the mouse wheel or a pinch.</p>
      <canvas
        ref={canvasRef}
        className="cropper__frame"
        style={{ width: VIEW, height: VIEW }}
        tabIndex={0}
        role="img"
        aria-label="Portrait framing. Arrow keys move the image; plus and minus zoom."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      />
      <label className="cropper__zoom">
        <span>Zoom</span>
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={handleZoomSlider} />
      </label>
      {error && <p className="delete-dialog__error">{error}</p>}
      <div className="delete-dialog__actions">
        <button type="button" className="setting-button setting-button--quiet" disabled={busy}
          onClick={() => dialogRef.current?.close()}>
          Cancel
        </button>
        <button type="button" className="setting-button" disabled={busy} onClick={handleConfirm}>
          {busy ? 'Uploading…' : 'Use Portrait'}
        </button>
      </div>
    </dialog>
  );
}
