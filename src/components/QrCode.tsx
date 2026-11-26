import { useMemo } from 'react';
import { qrMatrix, qrSvgPath } from '../lib/qr';

/** A QR code drawn locally as SVG (dark modules on white, with the quiet zone). */
export function QrCode({ text, size = 200, label }: { text: string; size?: number; label: string }) {
  const { path, size: n } = useMemo(() => qrSvgPath(qrMatrix(text)), [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" data-testid="qr">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
