import { useState, useRef } from 'react';
import { useAppSettings, FONT_OPTIONS_TEXT, FONT_OPTIONS_NUM, resolveFont } from '../utils/appSettings';
import { CURSOR_PACKS } from '../assets/cursors';

const PRESETS = [
  { label: '天蓝', hex: '#5b9bd5' },
  { label: '绀紫', hex: '#7c5cbf' },
  { label: '赤红', hex: '#e0556a' },
  { label: '翠绿', hex: '#4dab8e' },
  { label: '橙黄', hex: '#e8903c' },
  { label: '桃粉', hex: '#d4738b' },
];

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, setAccent, setBackground, clearBackground, setCardOpacity, setCursorStyle, setRingSize, setFont } = useAppSettings();
  const [accent, setAccentLocal] = useState(settings.accentColor);
  const [bgUrl, setBgUrl] = useState(settings.bgImage || '');
  const [bgOpacity, setBgOpacity] = useState(settings.bgOpacity);
  const [cardOpacity, setCardOpacityLocal] = useState(settings.cardOpacity);
  const [cursorOpen, setCursorOpen] = useState(false);
  const [warning, setWarning] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAccentChange = (hex: string) => {
    setAccentLocal(hex);
    setAccent(hex);
  };

  const handleBgOpacity = (v: number) => {
    setBgOpacity(v);
    if (bgUrl) setBackground(bgUrl, v);
  };

  const handleBgUrl = (url: string) => {
    setBgUrl(url);
    if (url) setBackground(url, bgOpacity);
    else { setBgOpacity(0.3); clearBackground(); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setWarning('图片超过 2MB，可能导致保存失败');
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setBgUrl(dataUri);
      setBackground(dataUri, bgOpacity);
    };
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    setBgUrl('');
    setBgOpacity(0.3);
    clearBackground();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto rounded-xl p-5 border"
        style={{
          background: 'var(--app-bg)',
          borderColor: 'var(--app-glass-border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">外观设置</h3>
          <button className="icon-btn" style={{ width: 28, height: 28, padding: 0, borderRadius: 6, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {/* ── Accent Color ─────────────────────────────────── */}
        <div className="mb-5">
          <div className="text-sm font-semibold mb-2">主题色</div>
          <div className="flex gap-2 flex-wrap mb-3">
            {PRESETS.map(p => (
              <button
                key={p.hex}
                className={`w-9 h-9 rounded-lg border-2 transition-all ${accent === p.hex ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ background: p.hex }}
                onClick={() => handleAccentChange(p.hex)}
                title={p.label}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">自定义:</span>
            <input type="color" value={accent} onChange={e => handleAccentChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 p-0"
              style={{ background: 'transparent' }}
            />
            <span className="text-xs text-text-muted font-mono">{accent}</span>
          </div>
          {/* Live preview */}
          <div className="mt-2 flex gap-2">
            <span className="px-2 py-0.5 rounded text-xs text-white" style={{ background: accent }}>预览</span>
            <span className="px-2 py-0.5 rounded text-xs border" style={{ borderColor: accent, color: accent }}>边框</span>
          </div>
        </div>

        {/* ── Background ───────────────────────────────────── */}
        <div>
          <div className="text-sm font-semibold mb-2">背景图片</div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input className="input-field text-xs flex-1" placeholder="输入图片 URL…"
                value={bgUrl.startsWith('data:') ? '[本地图片]' : bgUrl}
                onChange={e => setBgUrl(e.target.value)}
                onBlur={e => handleBgUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleBgUrl((e.target as HTMLInputElement).value); }}
                disabled={bgUrl.startsWith('data:')}
              />
              <button className="btn btn-secondary btn-xs px-1.5" onClick={() => fileRef.current?.click()} title="上传图片">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </button>
              {bgUrl && <button className="btn btn-secondary btn-xs px-1.5" onClick={handleReset} title="重置背景">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </button>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-muted">透明度</span>
              <input type="range" min="0.1" max="1" step="0.05" value={bgOpacity}
                onChange={e => handleBgOpacity(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: accent }}
              />
              <span className="text-xs text-text-muted w-8 text-right">{Math.round(bgOpacity * 100)}%</span>
            </div>
            {warning && <div className="text-[10px] text-amber-400">{warning}</div>}
            <div className="flex gap-2 mt-1">
            </div>
          </div>
        </div>

        {/* ── Card Opacity ──────────────────────────────────── */}
        <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--app-glass-border)' }}>
          <div className="text-sm font-semibold mb-2">组件透明度</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">透明</span>
            <input type="range" min="0.3" max="1" step="0.05" value={cardOpacity}
              onChange={e => { setCardOpacityLocal(parseFloat(e.target.value)); setCardOpacity(parseFloat(e.target.value)); }}
              className="flex-1"
              style={{ accentColor: accent }}
            />
            <span className="text-xs text-text-muted">实色</span>
            <span className="text-xs text-text-muted w-8 text-right">{Math.round(cardOpacity * 100)}%</span>
          </div>
        </div>

        {/* ── Mouse Cursor (collapsible) ───────────────────── */}
        <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--app-glass-border)' }}>
          <button
            className="text-sm font-semibold mb-2 flex items-center gap-1.5 w-full"
            onClick={() => setCursorOpen(o => !o)}
          >
            <span className="text-text-muted text-xs transition-transform" style={{ transform: cursorOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            鼠标指针
            <span className="font-normal text-xs text-gray-400">
              (别问为什么只有pcr是动态的, 没找到烧的指针)
            </span>
          </button>
          {cursorOpen && (
          <>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-text-muted whitespace-nowrap">圈大小</span>
            <input type="range" min="16" max="48" step="1" value={settings.ringSize}
              onChange={e => setRingSize(parseInt(e.target.value))}
              className="flex-1"
              style={{ accentColor: accent }}
            />
            <span className="text-xs text-text-muted w-10 text-right">{settings.ringSize}px</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className={`w-14 h-16 rounded-lg border-2 transition-all flex items-center justify-center ${settings.cursorStyle === 'native' ? 'border-accent bg-accent/10' : 'border-transparent hover:border-white/20'}`}
              onClick={() => setCursorStyle('native')}
              title="系统原生鼠标指针"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="opacity-70"><path d="M4 2l16 9-7 2-3 7z"/></svg>
            </button>
            <button
              className={`w-14 h-16 rounded-lg border-2 transition-all flex items-center justify-center gap-1 ${settings.cursorStyle === '' ? 'border-accent bg-accent/10' : 'border-transparent hover:border-white/20'}`}
              onClick={() => setCursorStyle('')}
              title="默认圆点光标"
            >
              <span className="w-3 h-3 rounded-full bg-accent" />
              <span className="w-7 h-7 rounded-full border-2 border-accent/60" />
            </button>
            {CURSOR_PACKS.map(p => (
              <button
                key={p.slug}
                className={`w-14 h-16 rounded-lg border-2 transition-all flex items-center justify-center overflow-hidden ${settings.cursorStyle === p.slug ? 'border-accent bg-accent/10' : 'border-transparent hover:border-white/20'}`}
                onClick={() => setCursorStyle(p.slug)}
                title={p.label}
              >
                {p.kind === 'static' ? (
                  <img src={import.meta.env.BASE_URL + 'duelo/' + p.preview} alt={p.label} className="h-14 w-auto object-contain" draggable={false} />
                ) : (
                  <img src={p.preview} alt={p.label} className="w-9 h-9 object-contain" draggable={false} />
                )}
              </button>
            ))}
          </div>
          </>
          )}
          <p className="text-[10px] text-text-muted mt-2">选择角色后，光标会变为对应的角色形象并跟随鼠标</p>
        </div>

        {/* ── Fonts ─────────────────────────────────────────── */}
        <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--app-glass-border)' }}>
          <div className="text-sm font-semibold mb-2">字体</div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs text-text-muted mb-1">文字字体</div>
              <select className="input-field text-xs" value={settings.fontText} onChange={e => setFont('text', e.target.value)}>
                {Object.entries(FONT_OPTIONS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="text-xs mt-1 opacity-70" style={{ fontFamily: resolveFont(settings.fontText, 'text') }}>
                预览：这是测试文字 12345
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">数字字体</div>
              <select className="input-field text-xs" value={settings.fontNum} onChange={e => setFont('num', e.target.value)}>
                {Object.entries(FONT_OPTIONS_NUM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="text-xs mt-1 opacity-70 num" style={{ fontFamily: resolveFont(settings.fontNum, 'num') }}>
                预览：0123456789 12345.67
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
