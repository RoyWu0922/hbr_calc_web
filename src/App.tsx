import { useState, useEffect } from 'react';
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
        // Clean URL
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--app-bg)' }}>
      <header className="glass-header sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-lg font-bold whitespace-nowrap" style={{ color: 'var(--app-text-primary)' }}>HBR Toolbox</h1>
          <nav className="flex gap-1.5">
            <button onClick={() => setPrimaryTab('damage')} className={`nav-tab ${primaryTab === 'damage' ? 'active' : ''}`}>伤害计算</button>
            <button onClick={() => setPrimaryTab('white')} className={`nav-tab ${primaryTab === 'white' ? 'active' : ''}`}>白值计算</button>
            <button onClick={() => setPrimaryTab('extra')} className={`nav-tab ${primaryTab === 'extra' ? 'active' : ''}`}>额外功能</button>
          </nav>
          {primaryTab === 'damage' && (
            <div className="flex gap-1 ml-2 border-l border-white/10 pl-3">
              {SUB_TABS.map(t => (
                <button key={t.key} onClick={() => setSubTab(t.key)} className={`nav-tab text-xs ${subTab === t.key ? 'active' : ''}`}>{t.label}</button>
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
        {primaryTab === 'damage' && subTab === 'calculator' && <DamageCalculator initialData={historyToLoad} />}
        {primaryTab === 'damage' && subTab === 'skills' && <SkillDatabase />}
        {primaryTab === 'damage' && subTab === 'history' && (
          <HistoryPage onLoad={(entry) => { setHistoryToLoad(entry); setSubTab('calculator'); setPrimaryTab('damage'); }} />
        )}
        {primaryTab === 'white' && <WhiteStats />}
        {primaryTab === 'extra' && <ExtraFeatures />}
      </main>
    </div>
  );
}
