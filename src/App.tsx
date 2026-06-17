import { useState, useEffect, useCallback } from 'react';
import DamageCalculator from './components/DamageCalc/DamageCalculator';
import HistoryPage from './components/History/HistoryPage';
import SkillDatabase from './components/SkillDb/SkillDatabase';
import ExtraFeatures from './components/ExtraFeatures/ExtraFeatures';
import WhiteStats from './components/WhiteStats/WhiteStats';
import { useTheme } from './utils/theme';
import { decodeShareData } from './utils/shareUrl';
import { CalcHistoryEntry, DamageResultData } from './types';

type PrimaryTab = 'damage' | 'white' | 'extra';
type SubTab = 'calculator' | 'skills' | 'history';
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'calculator', label: '伤害计算' },
  { key: 'skills', label: '技能库' },
  { key: 'history', label: '计算历史' },
];

export default function App() {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('damage');
  const [subTab, setSubTab] = useState<SubTab>('calculator');
  const [historyToLoad, setHistoryToLoad] = useState<CalcHistoryEntry | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    // 1) Priority: ?share= URL param
    const params = new URLSearchParams(window.location.search);
    const shareData = params.get('share');
    if (shareData) {
      const decoded = decodeShareData(shareData);
      if (decoded) {
        const entry: CalcHistoryEntry = {
          timestamp: Date.now(),
          label: '分享导入',
          input: decoded,
          result: null as unknown as DamageResultData,
        };
        setHistoryToLoad(entry);
        setSubTab('calculator'); setPrimaryTab('damage');
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
    }

    // 2) localStorage history load
    const stored = localStorage.getItem('loadHistory');
    if (stored) {
      try {
        const entry = JSON.parse(stored) as CalcHistoryEntry;
        setHistoryToLoad(entry);
        setSubTab('calculator'); setPrimaryTab('damage');
        localStorage.removeItem('loadHistory');
      } catch { /* */ }
    }
  }, []);

  const switchPrimary = useCallback((tab: PrimaryTab) => {
    if (primaryTab === 'damage' && tab !== 'damage') {
      if (!confirm('切换到其他页面会离开伤害计算，是否继续？\n（伤害计算的内容会保留在当前标签页中）')) return;
    }
    setPrimaryTab(tab);
  }, [primaryTab]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--app-bg)' }}>
        <header className="glass-header sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
            <h1 className="text-lg font-bold whitespace-nowrap" style={{ color: 'var(--app-text-primary)' }}>HBR Toolbox</h1>
            <nav className="flex gap-1.5">
              <button onClick={() => switchPrimary('damage')} className={`nav-tab ${primaryTab === 'damage' ? 'active' : ''}`}>伤害计算</button>
              <button onClick={() => switchPrimary('white')} className={`nav-tab ${primaryTab === 'white' ? 'active' : ''}`}>白值计算</button>
              <button onClick={() => switchPrimary('extra')} className={`nav-tab ${primaryTab === 'extra' ? 'active' : ''}`}>额外功能</button>
            </nav>
            {primaryTab === 'damage' && (
              <div className="flex gap-0 ml-2 border-l border-white/10 pl-3">
                {SUB_TABS.map(t => (
                  <button key={t.key} onClick={() => setSubTab(t.key)} className={`sub-tab text-xs ${subTab === t.key ? 'active' : ''}`}>{t.label}</button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            <button
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
              {theme === 'dark' ? '亮色' : '暗色'}
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Use display:none to preserve component state */}
          <div style={{ display: primaryTab === 'damage' && subTab === 'calculator' ? 'block' : 'none' }}>
            <DamageCalculator initialData={historyToLoad} />
          </div>
          <div style={{ display: primaryTab === 'damage' && subTab === 'skills' ? 'block' : 'none' }}>
            <SkillDatabase />
          </div>
          {primaryTab === 'damage' && subTab === 'history' && (
            <HistoryPage onLoad={(entry) => { setHistoryToLoad(entry); setSubTab('calculator'); setPrimaryTab('damage'); }} />
          )}
          <div style={{ display: primaryTab === 'white' ? 'block' : 'none' }}>
            <WhiteStats />
          </div>
          <div style={{ display: primaryTab === 'extra' ? 'block' : 'none' }}>
            <ExtraFeatures />
          </div>
        </main>

        {/* Left side floating icons */}
        <div className="fixed left-2 bottom-1/3 flex flex-col gap-2 z-40">
          <a href="https://github.com/RoyWu0922/hbr_calc_web" target="_blank" rel="noopener noreferrer"
            className="bg-bg-card border border-white/10 rounded-lg p-2 text-text-muted hover:text-text-primary hover:border-white/20 transition-all shadow-lg" title="GitHub">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
          <a href="https://space.bilibili.com/511146986" target="_blank" rel="noopener noreferrer"
            className="bg-bg-card border border-white/10 rounded-lg p-2 text-text-muted hover:text-text-primary hover:border-white/20 transition-all shadow-lg" title="B站">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 01-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 01.16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>
          </a>
        </div>
    </div>
  );
}
