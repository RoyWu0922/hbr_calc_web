import { useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageInfoTipProps {
  src: string;
  alt?: string;
}

export default function ImageInfoTip({ src, alt = '' }: ImageInfoTipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span className="relative inline-flex align-middle ml-1">
        <span className="text-text-muted hover:text-text-secondary text-xs"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: '50%',
            border: '1px solid var(--app-checkbox-border)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >?</span>
      </span>

      {open && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/70"
          style={{ zIndex: 99999 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative bg-bg-card border border-white/10 rounded-xl p-3 shadow-2xl"
            style={{ maxWidth: '95vw', maxHeight: '95vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-3 text-text-muted hover:text-text-primary text-xl leading-none"
              onClick={() => setOpen(false)}
              style={{ zIndex: 1 }}
            >×</button>
            <img
              src={src} alt={alt}
              style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain' }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
