import { useState, type ReactNode } from 'react';

export default function CollapsibleSection({ title, defaultOpen, wrapper, children }: {
  title: ReactNode;
  defaultOpen?: boolean;
  wrapper?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const w = wrapper ?? true;
  const header = (
    <div className="card-header flex justify-between items-center cursor-pointer select-none" onClick={() => setOpen(!open)}>
      <span>{title}</span>
      <span className="text-text-muted text-lg transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
    </div>
  );
  const body = open ? <div className="mt-3">{children}</div> : null;

  if (w) {
    return <div className="card">{header}{body}</div>;
  }
  return <>{header}{body}</>;
}
