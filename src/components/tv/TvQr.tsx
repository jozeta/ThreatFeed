import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

const QUIET = 2; // modules of white around the code

/** One SVG path of the dark modules (error correction L, smallest type that fits) */
export function qrPath(url: string): { size: number; d: string } {
  const qr = qrcode(0, 'L');
  qr.addData(url);
  qr.make();
  const size = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}

/** A white rounded square with the code in black, so phones read it on the dark theme */
export default function TvQr({ url }: { url: string }) {
  const code = useMemo(() => {
    try { return qrPath(url); } catch { return null; }
  }, [url]);
  if (!code) return null;
  const total = code.size + QUIET * 2;
  return (
    <svg
      className="tv-qr"
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for the article"
    >
      <rect width={total} height={total} rx="1.5" fill="#fff" />
      <path transform={`translate(${QUIET} ${QUIET})`} d={code.d} fill="#000" />
    </svg>
  );
}
