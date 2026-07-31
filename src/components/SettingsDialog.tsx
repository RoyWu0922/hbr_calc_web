import { useState, useRef } from 'react';
import { useAppSettings } from '../utils/appSettings';

const PRESETS = [
  { label: '天蓝', hex: '#5b9bd5' },
  { label: '绀紫', hex: '#7c5cbf' },
  { label: '赤红', hex: '#e0556a' },
  { label: '翠绿', hex: '#4dab8e' },
  { label: '橙黄', hex: '#e8903c' },
  { label: '桃粉', hex: '#d4738b' },
];

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, setAccent, setBackground, clearBackground, setCardOpacity } = useAppSettings();
  const [accent, setAccentLocal] = useState(settings.accentColor);
  const [bgUrl, setBgUrl] = useState(settings.bgImage || '');
  const [bgOpacity, setBgOpacity] = useState(settings.bgOpacity);
  const [cardOpacity, setCardOpacityLocal] = useState(settings.cardOpacity);
  const [warning, setWarning] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAccentChange = (hex: string) => {
    setAccentLocal(hex);
    setAccent(hex);
  };

  const handleBgApply = () => {
    setWarning('');
    setBackground(bgUrl, bgOpacity);
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

  const handleClearBg = () => {
    setBgUrl('');
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
                disabled={bgUrl.startsWith('data:')}
              />
              <button className="btn btn-secondary btn-xs whitespace-nowrap" onClick={() => fileRef.current?.click()}>
                上传
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-muted">透明度</span>
              <input type="range" min="0.1" max="1" step="0.05" value={bgOpacity}
                onChange={e => setBgOpacity(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: accent }}
              />
              <span className="text-xs text-text-muted w-8 text-right">{Math.round(bgOpacity * 100)}%</span>
            </div>
            {warning && <div className="text-[10px] text-amber-400">{warning}</div>}
            <div className="flex gap-2 mt-1">
              <button className="btn btn-primary btn-xs" onClick={handleBgApply}>应用背景</button>
              {bgUrl && <button className="btn btn-secondary btn-xs" onClick={handleClearBg}>清除背景</button>}
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
      </div>
    </div>
  );
}
