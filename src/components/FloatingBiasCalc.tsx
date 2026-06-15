import { useState, useCallback, useRef } from 'react';

const BIAS_KEYS = ['hp', 'dp', 'int', 'luk'] as const;
const BIAS_LABELS: Record<string, string> = {
  hp: 'HP偏', dp: 'DP偏', int: '智偏', luk: '运偏',
};
const STATS = ['pow', 'spr', 'int', 'luk'] as const;
const STAT_LABELS: Record<string, string> = {
  pow: '力', spr: '灵', int: '智', luk: '运',
};
interface CharStats {
  pow: number; spr: number; int: number; luk: number;
}

function computeBiases(s: CharStats): Record<string, number> {
  return {
    hp:  (s.pow * 2 + s.spr * 1) / 3,
    dp:  (s.pow * 1 + s.spr * 2) / 3,
    int: s.int,
    luk: s.luk,
  };
}

const N = 6;

export default function FloatingBiasCalc() {
  const [minimized, setMinimized] = useState(true);
  const [names, setNames] = useState<string[]>(Array(N).fill(''));
  const [chars, setChars] = useState<CharStats[]>(
    Array.from({ length: N }, () => ({ pow: 0, spr: 0, int: 0, luk: 0 })),
  );

  const updateStat = (i: number, key: keyof CharStats, v: number) => {
    setChars(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: v };
      return next;
    });
  };

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth - 600, y: 100 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(ev.clientX - dragOffset.current.x, window.innerWidth - 320)),
        y: Math.max(0, Math.min(ev.clientY - dragOffset.current.y, window.innerHeight - 40)),
      });
    };
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  if (minimized) {
    return (
      <div
        className="fixed right-0 top-1/3 bg-bg-card border border-white/10 rounded-l-lg px-2 py-3 shadow-xl cursor-pointer z-50"
        style={{ writingMode: 'vertical-rl' }}
        onClick={() => setMinimized(false)}
      >
        <span className="text-xs text-text-secondary tracking-wider">属性记录/计算</span>
      </div>
    );
  }

  const colW = 76; // column width for each character

  return (
    <div
      className="fixed bg-bg-card border border-white/10 rounded-xl shadow-2xl z-50"
      style={{ left: pos.x, top: pos.y, width: 64 + N * colW + 16, maxHeight: '90vh', overflow: 'auto' }}
    >
      {/* Title bar (draggable) */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none border-b border-white/10"
        onMouseDown={onMouseDown}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--app-text-primary)' }}>属性记录/计算</span>
        <button
          className="text-text-muted hover:text-text-secondary text-xs leading-none px-1"
          onClick={() => setMinimized(true)}
          title="最小化"
        >—</button>
      </div>

      {/* Content */}
      <div className="p-2 text-[10px]">
        <table className="w-full">
          <tbody>
            {/* 角色 (name) row */}
            <tr>
              <td className="py-0.5 font-medium text-text-muted text-right pr-2">角色</td>
              {names.map((n, i) => (
                <td key={i} className="py-0.5 px-0.5">
                  <input
                    className="input-field text-[10px] py-1 text-center"
                    placeholder={`${i + 1}`}
                    value={n}
                    onChange={e => setNames(prev => { const nx = [...prev]; nx[i] = e.target.value; return nx; })}
                  />
                </td>
              ))}
            </tr>
            {/* Stat rows: 力, 灵, 智, 运 */}
            {STATS.map(key => (
              <tr key={key}>
                <td className="py-0.5 font-medium text-text-muted text-right pr-2">{STAT_LABELS[key]}</td>
                {chars.map((c, i) => (
                  <td key={i} className="py-0.5 px-0.5">
                    <input
                      className="input-field text-[10px] py-1 text-center"
                      type="number"
                      value={c[key] || ''}
                      onChange={e => updateStat(i, key, parseFloat(e.target.value) || 0)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Bias totals */}
        <div className="mt-2 pt-2 border-t divider">
          <table className="w-full">
            <thead>
              <tr>
                <th style={{ width: 56 }}></th>
                {names.map((n, i) => (
                  <th key={i} className="text-center font-normal">{n || `#${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BIAS_KEYS.map(key => (
                <tr key={key}>
                  <td className="py-0.5 font-medium text-text-muted text-right pr-2">{BIAS_LABELS[key]}</td>
                  {chars.map((c, i) => {
                    const b = computeBiases(c);
                    return (
                      <td key={i} className="text-center font-mono text-accent font-semibold py-0.5">
                        {b[key].toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
