import { useState, type ReactNode } from 'react';

export default function CollapsibleSection({ title, defaultOpen, children }: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="card">
      <div className="card-header flex justify-between items-center cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="text-text-muted text-lg transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
