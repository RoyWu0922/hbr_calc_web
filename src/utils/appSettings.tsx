import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AppSettings {
  accentColor: string;   // hex e.g. "#5b9bd5"
  bgImage: string;       // data URI or URL, empty = none
  bgOpacity: number;     // 0.1 – 1.0
  cardOpacity: number;   // 0.3 – 1.0
  cursorStyle: string;   // '' = dot+ring, 'native', else pack slug e.g. 'yuni'
  ringSize: number;      // cursor ring diameter in px (dot mode)
  fontText: string;      // font-family for body text
  fontNum: string;       // font-family for numbers
}

const DEFAULTS: AppSettings = {
  accentColor: '#5b9bd5',
  bgImage: '',
  bgOpacity: 0.3,
  cardOpacity: 1,
  cursorStyle: '',
  ringSize: 28,
  fontText: 'Inter',
  fontNum: 'JetBrains Mono',
};

const STORAGE_KEY = 'hbr_app_settings';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        accentColor: parsed.accentColor || DEFAULTS.accentColor,
        bgImage: parsed.bgImage || '',
        bgOpacity: typeof parsed.bgOpacity === 'number' ? parsed.bgOpacity : DEFAULTS.bgOpacity,
        cardOpacity: typeof parsed.cardOpacity === 'number' ? parsed.cardOpacity : DEFAULTS.cardOpacity,
        cursorStyle: typeof parsed.cursorStyle === 'string' ? parsed.cursorStyle : DEFAULTS.cursorStyle,
        ringSize: typeof parsed.ringSize === 'number' ? parsed.ringSize : DEFAULTS.ringSize,
        fontText: typeof parsed.fontText === 'string' ? parsed.fontText : DEFAULTS.fontText,
        fontNum: typeof parsed.fontNum === 'string' ? parsed.fontNum : DEFAULTS.fontNum,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function save(s: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

/** Parse a hex color string to {r,g,b}. Returns null on invalid input. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function applyAccent(hex: string): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const root = document.documentElement.style;
  root.setProperty('--color-accent-r', String(rgb.r));
  root.setProperty('--color-accent-g', String(rgb.g));
  root.setProperty('--color-accent-b', String(rgb.b));
}

/** Font option presets — ordered from formal/business to cute */
export const FONT_OPTIONS_TEXT: Record<string, string> = {
  'Noto Serif SC': '商务宋体 (Noto Serif)',
  Georgia: '商务衬线 (Georgia)',
  Inter: '现代无衬线 (Inter)',
  'System UI': '系统默认',
  'Noto Sans SC': '现代黑体 (Noto Sans)',
  Nunito: '圆润柔和 (Nunito)',
  'ZCOOL KuaiLe': '可爱快乐体 (站酷)',
  'ZCOOL QingKe HuangYou': '黄油可爱体 (站酷)',
  'Ma Shan Zheng': '手写楷书',
};

export const FONT_OPTIONS_NUM: Record<string, string> = {
  Georgia: '商务衬线 (Georgia)',
  'JetBrains Mono': '现代等宽 (JetBrains)',
  'Fira Code': '代码等宽 (Fira)',
  Monospace: '系统等宽',
  Nunito: '圆润柔和 (Nunito)',
  Pacifico: '手写体 (Pacifico)',
  Inter: '跟随正文',
};

/** Resolve a preset name to a full font-family stack */
export function resolveFont(preset: string, kind: 'text' | 'num'): string {
  if (kind === 'num' && preset === 'Inter') return 'var(--font-body)';
  if (kind === 'text') {
    switch (preset) {
      case 'Noto Serif SC': return "'Noto Serif SC', 'Songti SC', 'SimSun', serif";
      case 'Georgia': return "Georgia, 'Times New Roman', 'Songti SC', serif";
      case 'Inter': return "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      case 'System UI': return "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
      case 'Noto Sans SC': return "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
      case 'Nunito': return "'Nunito', 'Noto Sans SC', 'PingFang SC', sans-serif";
      case 'ZCOOL KuaiLe': return "'ZCOOL KuaiLe', 'PingFang SC', sans-serif";
      case 'ZCOOL QingKe HuangYou': return "'ZCOOL QingKe HuangYou', 'PingFang SC', sans-serif";
      case 'Ma Shan Zheng': return "'Ma Shan Zheng', 'KaiTi', 'SimSun', serif";
      default: return "'Inter', sans-serif";
    }
  }
  switch (preset) {
    case 'Georgia': return "Georgia, 'Times New Roman', serif";
    case 'JetBrains Mono': return "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace";
    case 'Fira Code': return "'Fira Code', 'JetBrains Mono', monospace";
    case 'Monospace': return "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    case 'Nunito': return "'Nunito', sans-serif";
    case 'Pacifico': return "'Pacifico', cursive";
    default: return "'JetBrains Mono', monospace";
  }
}

interface SettingsCtx {
  settings: AppSettings;
  setAccent: (hex: string) => void;
  setBackground: (image: string, opacity: number) => void;
  clearBackground: () => void;
  setCardOpacity: (v: number) => void;
  setCursorStyle: (slug: string) => void;
  setRingSize: (px: number) => void;
  setFont: (kind: 'text' | 'num', preset: string) => void;
}

const SettingsContext = createContext<SettingsCtx>({
  settings: { ...DEFAULTS },
  setAccent: () => {},
  setBackground: () => {},
  clearBackground: () => {},
  setCardOpacity: () => {},
  setCursorStyle: () => {},
  setRingSize: () => {},
  setFont: () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(load);

  // Apply accent
  useEffect(() => {
    applyAccent(settings.accentColor);
  }, [settings.accentColor]);

  useEffect(() => {
    document.documentElement.style.setProperty('--card-opacity', String(settings.cardOpacity));
  }, [settings.cardOpacity]);

  // Apply fonts
  useEffect(() => {
    document.documentElement.style.setProperty('--font-body', resolveFont(settings.fontText, 'text'));
  }, [settings.fontText]);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-num', resolveFont(settings.fontNum, 'num'));
  }, [settings.fontNum]);

  // Apply cursor ring size
  useEffect(() => {
    document.documentElement.style.setProperty('--cursor-ring-size', `${settings.ringSize}px`);
  }, [settings.ringSize]);

  // Apply background image to body
  useEffect(() => {
    if (settings.bgImage) {
      document.body.style.backgroundImage = `url(${settings.bgImage})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.documentElement.style.setProperty('--bg-dimmer', String(1 - settings.bgOpacity));
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.backgroundRepeat = '';
      document.documentElement.style.setProperty('--bg-dimmer', '0');
    }
  }, [settings.bgImage, settings.bgOpacity]);

  const setAccent = (hex: string) => {
    if (!hexToRgb(hex)) return;
    setSettings(prev => {
      const next = { ...prev, accentColor: hex };
      save(next);
      return next;
    });
  };

  const setBackground = (image: string, opacity: number) => {
    setSettings(prev => {
      const next = { ...prev, bgImage: image, bgOpacity: opacity };
      save(next);
      return next;
    });
  };

  const clearBackground = () => {
    setSettings(prev => {
      const next = { ...prev, bgImage: '', bgOpacity: DEFAULTS.bgOpacity };
      save(next);
      return next;
    });
  };

  const setCardOpacity = (cardOpacity: number) => {
    setSettings(prev => {
      const next = { ...prev, cardOpacity };
      save(next);
      return next;
    });
  };

  const setCursorStyle = (cursorStyle: string) => {
    setSettings(prev => {
      const next = { ...prev, cursorStyle };
      save(next);
      return next;
    });
  };

  const setFont = (kind: 'text' | 'num', preset: string) => {
    setSettings(prev => {
      const next = { ...prev, [kind === 'text' ? 'fontText' : 'fontNum']: preset };
      save(next);
      return next;
    });
  };

  const setRingSize = (ringSize: number) => {
    setSettings(prev => {
      const next = { ...prev, ringSize };
      save(next);
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, setAccent, setBackground, clearBackground, setCardOpacity, setCursorStyle, setRingSize, setFont }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(SettingsContext);
}
