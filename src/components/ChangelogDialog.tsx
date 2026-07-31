import { useState } from 'react';

interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  content: string;
}

export default function ChangelogDialog({ entry, onClose }: { entry: ChangelogEntry; onClose: (dontShowAgain: boolean) => void }) {
  const [visible, setVisible] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => onClose(dontShowAgain), 200);
  };

  return (
    <div
      className={`fixed inset-0 z-[250] flex items-center justify-center bg-black/50 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto rounded-xl p-6 border shadow-2xl"
        style={{
          background: 'var(--app-bg)',
          borderColor: 'var(--app-glass-border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{entry.title}</h2>
          <span className="text-xs text-text-muted">{entry.date}</span>
        </div>

        <div
          className="changelog-content text-sm leading-relaxed space-y-3"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }}
        />

        <div className="mt-6 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-text-muted">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
            />
            不再显示
          </label>
          <button className="btn btn-primary btn-sm" onClick={dismiss}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-4 mb-2">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold mt-5 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="mb-2">$1</ul>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
