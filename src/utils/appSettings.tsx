import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface AppSettings {
  accentColor: string;   // hex e.g. "#5b9bd5"
  bgImage: string;       // data URI or URL, empty = none
  bgOpacity: number;     // 0.1 – 1.0
  cardOpacity: number;   // 0.3 – 1.0
  cursorStyle: string;   // '' = dot+ring, else pack slug e.g. 'yuni'
}

const DEFAULTS: AppSettings = {
  accentColor: '#5b9bd5',
  bgImage: '',
  bgOpacity: 0.3,
  cardOpacity: 1,
  cursorStyle: '',
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

interface SettingsCtx {
  settings: AppSettings;
  setAccent: (hex: string) => void;
  setBackground: (image: string, opacity: number) => void;
  clearBackground: () => void;
  setCardOpacity: (v: number) => void;
  setCursorStyle: (slug: string) => void;
}

const SettingsContext = createContext<SettingsCtx>({
  settings: { ...DEFAULTS },
  setAccent: () => {},
  setBackground: () => {},
  clearBackground: () => {},
  setCardOpacity: () => {},
  setCursorStyle: () => {},
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

  return (
    <SettingsContext.Provider value={{ settings, setAccent, setBackground, clearBackground, setCardOpacity, setCursorStyle }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(SettingsContext);
}
