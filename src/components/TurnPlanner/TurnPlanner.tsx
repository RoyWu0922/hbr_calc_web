import { useState, useMemo, useEffect, useRef, Fragment, useCallback } from 'react';
import html2canvas from '../../utils/html2canvas.esm.js';
import { TurnPlannerState, PlannerTurn, FrontAction, ODMode, ComputedTurnResult } from '../../types';
import { computeTurnPlanner, createDefaultState } from '../../engine/turnPlanner';
import { loadPlannerState, savePlannerState, saveAxle, updateAxle, getSavedAxles, updateAxleLabel, duplicateAxle, deleteAxle, deleteAxles, clearAllAxles, getAllAxles, importAxles, setAxleFolder, type SavedAxle } from '../../utils/plannerStorage';
import { getFolders, createFolder, updateFolder, deleteFolder } from '../../utils/storage';
import { copyToClipboard } from '../../utils/copyToast';
import type { Folder } from '../../types';

type PlannerSubTab = 'detail' | 'simple' | 'saved';

// ─── Planner Style Presets ─────────────────────────────────────
type PlannerStyleName = '默认' | '晨雾绿' | '樱花拿铁' | '海盐薰衣草' | '抹茶奶昔' | '晚樱浅烟' | '云杉晨曦' | '柑橘薄荷' | '莓果奶昔' | '热带椰风' | '向日葵蓝天' | '蜜桃乌龙' | '浆果薰衣草' | '霓虹日落' | '热带果汁' | '撞色波普' | '电光彩虹' | '糖果撞色' | '赛博朋克' | '马卡龙霓虹' | '复古迪斯科' | '极光彩带' | '火焰冰川' | '水果拼盘' | '未来都市';

// prettier-ignore
const PLANNER_STYLES: Record<PlannerStyleName, Record<string, string>> = {
  '默认': {
    '--planner-col-front': 'rgba(129, 140, 248, 0.08)',
    '--planner-col-back': 'rgba(148, 163, 184, 0.06)',
    '--planner-col-od': 'rgba(251, 191, 36, 0.08)',
    '--simple-slot1': 'rgba(251, 146, 60, 0.1)',
    '--simple-slot2': 'rgba(129, 140, 248, 0.1)',
    '--simple-slot3': 'rgba(52, 211, 153, 0.08)',
  },
  '晨雾绿': {
    '--planner-col-front': 'rgba(167, 213, 176, 0.1)',
    '--planner-col-back': 'rgba(200, 210, 200, 0.06)',
    '--planner-col-od': 'rgba(188, 210, 160, 0.08)',
    '--simple-slot1': 'rgba(167, 213, 176, 0.12)',
    '--simple-slot2': 'rgba(176, 196, 212, 0.1)',
    '--simple-slot3': 'rgba(200, 210, 188, 0.08)',
  },
  '樱花拿铁': {
    '--planner-col-front': 'rgba(244, 194, 194, 0.1)',
    '--planner-col-back': 'rgba(200, 190, 185, 0.06)',
    '--planner-col-od': 'rgba(240, 210, 195, 0.08)',
    '--simple-slot1': 'rgba(244, 194, 194, 0.12)',
    '--simple-slot2': 'rgba(210, 195, 210, 0.1)',
    '--simple-slot3': 'rgba(235, 215, 200, 0.08)',
  },
  '海盐薰衣草': {
    '--planner-col-front': 'rgba(200, 190, 225, 0.1)',
    '--planner-col-back': 'rgba(185, 200, 215, 0.06)',
    '--planner-col-od': 'rgba(240, 220, 230, 0.08)',
    '--simple-slot1': 'rgba(200, 190, 225, 0.12)',
    '--simple-slot2': 'rgba(185, 210, 210, 0.1)',
    '--simple-slot3': 'rgba(215, 205, 220, 0.08)',
  },
  '抹茶奶昔': {
    '--planner-col-front': 'rgba(168, 194, 152, 0.1)',
    '--planner-col-back': 'rgba(200, 195, 180, 0.06)',
    '--planner-col-od': 'rgba(210, 200, 170, 0.08)',
    '--simple-slot1': 'rgba(168, 194, 152, 0.12)',
    '--simple-slot2': 'rgba(190, 200, 175, 0.1)',
    '--simple-slot3': 'rgba(205, 195, 175, 0.08)',
  },
  '晚樱浅烟': {
    '--planner-col-front': 'rgba(230, 195, 200, 0.1)',
    '--planner-col-back': 'rgba(200, 195, 210, 0.06)',
    '--planner-col-od': 'rgba(235, 210, 215, 0.08)',
    '--simple-slot1': 'rgba(230, 195, 200, 0.12)',
    '--simple-slot2': 'rgba(200, 200, 215, 0.1)',
    '--simple-slot3': 'rgba(220, 205, 200, 0.08)',
  },
  '云杉晨曦': {
    '--planner-col-front': 'rgba(175, 195, 195, 0.1)',
    '--planner-col-back': 'rgba(195, 195, 190, 0.06)',
    '--planner-col-od': 'rgba(210, 200, 200, 0.08)',
    '--simple-slot1': 'rgba(175, 195, 195, 0.12)',
    '--simple-slot2': 'rgba(210, 200, 215, 0.1)',
    '--simple-slot3': 'rgba(195, 205, 195, 0.08)',
  },
  '柑橘薄荷': {
    '--planner-col-front': 'rgba(251, 146, 60, 0.12)',
    '--planner-col-back': 'rgba(134, 239, 172, 0.08)',
    '--planner-col-od': 'rgba(250, 204, 21, 0.1)',
    '--simple-slot1': 'rgba(251, 146, 60, 0.14)',
    '--simple-slot2': 'rgba(56, 189, 248, 0.12)',
    '--simple-slot3': 'rgba(134, 239, 172, 0.1)',
  },
  '莓果奶昔': {
    '--planner-col-front': 'rgba(251, 113, 133, 0.12)',
    '--planner-col-back': 'rgba(216, 180, 254, 0.08)',
    '--planner-col-od': 'rgba(244, 114, 182, 0.1)',
    '--simple-slot1': 'rgba(251, 113, 133, 0.14)',
    '--simple-slot2': 'rgba(216, 180, 254, 0.12)',
    '--simple-slot3': 'rgba(134, 239, 172, 0.1)',
  },
  '热带椰风': {
    '--planner-col-front': 'rgba(251, 146, 60, 0.12)',
    '--planner-col-back': 'rgba(56, 189, 248, 0.08)',
    '--planner-col-od': 'rgba(250, 204, 21, 0.1)',
    '--simple-slot1': 'rgba(253, 126, 20, 0.14)',
    '--simple-slot2': 'rgba(134, 239, 172, 0.12)',
    '--simple-slot3': 'rgba(56, 189, 248, 0.1)',
  },
  '向日葵蓝天': {
    '--planner-col-front': 'rgba(250, 204, 21, 0.12)',
    '--planner-col-back': 'rgba(56, 189, 248, 0.08)',
    '--planner-col-od': 'rgba(251, 146, 60, 0.1)',
    '--simple-slot1': 'rgba(250, 204, 21, 0.14)',
    '--simple-slot2': 'rgba(56, 189, 248, 0.12)',
    '--simple-slot3': 'rgba(134, 239, 172, 0.1)',
  },
  '蜜桃乌龙': {
    '--planner-col-front': 'rgba(251, 161, 101, 0.12)',
    '--planner-col-back': 'rgba(180, 130, 80, 0.08)',
    '--planner-col-od': 'rgba(210, 180, 140, 0.1)',
    '--simple-slot1': 'rgba(251, 161, 101, 0.14)',
    '--simple-slot2': 'rgba(134, 239, 172, 0.1)',
    '--simple-slot3': 'rgba(56, 189, 248, 0.08)',
  },
  '浆果薰衣草': {
    '--planner-col-front': 'rgba(192, 38, 211, 0.12)',
    '--planner-col-back': 'rgba(168, 85, 247, 0.08)',
    '--planner-col-od': 'rgba(250, 204, 21, 0.1)',
    '--simple-slot1': 'rgba(192, 38, 211, 0.14)',
    '--simple-slot2': 'rgba(168, 85, 247, 0.12)',
    '--simple-slot3': 'rgba(250, 204, 21, 0.1)',
  },
  '霓虹日落': {
    '--planner-col-front': 'rgba(255, 107, 53, 0.14)',
    '--planner-col-back': 'rgba(58, 12, 163, 0.08)',
    '--planner-col-od': 'rgba(255, 214, 10, 0.12)',
    '--simple-slot1': 'rgba(247, 37, 133, 0.14)',
    '--simple-slot2': 'rgba(6, 214, 160, 0.12)',
    '--simple-slot3': 'rgba(255, 107, 53, 0.12)',
  },
  '热带果汁': {
    '--planner-col-front': 'rgba(255, 51, 102, 0.14)',
    '--planner-col-back': 'rgba(0, 180, 216, 0.08)',
    '--planner-col-od': 'rgba(255, 195, 0, 0.12)',
    '--simple-slot1': 'rgba(46, 204, 113, 0.14)',
    '--simple-slot2': 'rgba(157, 78, 221, 0.12)',
    '--simple-slot3': 'rgba(255, 51, 102, 0.1)',
  },
  '撞色波普': {
    '--planner-col-front': 'rgba(230, 57, 70, 0.14)',
    '--planner-col-back': 'rgba(29, 53, 87, 0.08)',
    '--planner-col-od': 'rgba(244, 211, 94, 0.12)',
    '--simple-slot1': 'rgba(42, 157, 143, 0.14)',
    '--simple-slot2': 'rgba(244, 162, 97, 0.12)',
    '--simple-slot3': 'rgba(230, 57, 70, 0.1)',
  },
  '电光彩虹': {
    '--planner-col-front': 'rgba(255, 0, 110, 0.14)',
    '--planner-col-back': 'rgba(131, 56, 236, 0.08)',
    '--planner-col-od': 'rgba(255, 190, 11, 0.12)',
    '--simple-slot1': 'rgba(251, 86, 7, 0.14)',
    '--simple-slot2': 'rgba(58, 134, 255, 0.12)',
    '--simple-slot3': 'rgba(255, 0, 110, 0.1)',
  },
  '糖果撞色': {
    '--planner-col-front': 'rgba(239, 35, 60, 0.14)',
    '--planner-col-back': 'rgba(76, 201, 240, 0.08)',
    '--planner-col-od': 'rgba(255, 214, 10, 0.12)',
    '--simple-slot1': 'rgba(6, 214, 160, 0.14)',
    '--simple-slot2': 'rgba(201, 24, 74, 0.12)',
    '--simple-slot3': 'rgba(239, 35, 60, 0.1)',
  },
  '赛博朋克': {
    '--planner-col-front': 'rgba(242, 34, 255, 0.14)',
    '--planner-col-back': 'rgba(106, 0, 244, 0.08)',
    '--planner-col-od': 'rgba(204, 255, 0, 0.12)',
    '--simple-slot1': 'rgba(0, 245, 255, 0.14)',
    '--simple-slot2': 'rgba(255, 84, 0, 0.12)',
    '--simple-slot3': 'rgba(242, 34, 255, 0.1)',
  },
  '马卡龙霓虹': {
    '--planner-col-front': 'rgba(255, 77, 109, 0.14)',
    '--planner-col-back': 'rgba(78, 168, 222, 0.08)',
    '--planner-col-od': 'rgba(255, 166, 43, 0.12)',
    '--simple-slot1': 'rgba(255, 77, 109, 0.14)',
    '--simple-slot2': 'rgba(181, 230, 85, 0.12)',
    '--simple-slot3': 'rgba(155, 93, 229, 0.1)',
  },
  '复古迪斯科': {
    '--planner-col-front': 'rgba(214, 40, 40, 0.12)',
    '--planner-col-back': 'rgba(88, 129, 87, 0.08)',
    '--planner-col-od': 'rgba(252, 191, 73, 0.12)',
    '--simple-slot1': 'rgba(214, 40, 40, 0.14)',
    '--simple-slot2': 'rgba(39, 125, 161, 0.12)',
    '--simple-slot3': 'rgba(188, 108, 37, 0.1)',
  },
  '极光彩带': {
    '--planner-col-front': 'rgba(6, 214, 160, 0.14)',
    '--planner-col-back': 'rgba(114, 9, 183, 0.08)',
    '--planner-col-od': 'rgba(255, 234, 0, 0.12)',
    '--simple-slot1': 'rgba(241, 91, 181, 0.14)',
    '--simple-slot2': 'rgba(0, 187, 249, 0.12)',
    '--simple-slot3': 'rgba(6, 214, 160, 0.1)',
  },
  '火焰冰川': {
    '--planner-col-front': 'rgba(208, 0, 0, 0.12)',
    '--planner-col-back': 'rgba(0, 119, 182, 0.08)',
    '--planner-col-od': 'rgba(255, 186, 8, 0.12)',
    '--simple-slot1': 'rgba(220, 47, 2, 0.14)',
    '--simple-slot2': 'rgba(0, 180, 216, 0.12)',
    '--simple-slot3': 'rgba(255, 186, 8, 0.1)',
  },
  '水果拼盘': {
    '--planner-col-front': 'rgba(255, 10, 84, 0.14)',
    '--planner-col-back': 'rgba(61, 90, 128, 0.08)',
    '--planner-col-od': 'rgba(255, 238, 50, 0.12)',
    '--simple-slot1': 'rgba(128, 185, 24, 0.14)',
    '--simple-slot2': 'rgba(255, 159, 28, 0.12)',
    '--simple-slot3': 'rgba(255, 10, 84, 0.1)',
  },
  '未来都市': {
    '--planner-col-front': 'rgba(86, 11, 173, 0.14)',
    '--planner-col-back': 'rgba(67, 97, 238, 0.08)',
    '--planner-col-od': 'rgba(255, 214, 10, 0.12)',
    '--simple-slot1': 'rgba(128, 255, 219, 0.14)',
    '--simple-slot2': 'rgba(255, 22, 84, 0.12)',
    '--simple-slot3': 'rgba(67, 97, 238, 0.1)',
  },
};

function usePlannerStyle() {
  const [style, setStyle] = useState<PlannerStyleName>(() => {
    const saved = localStorage.getItem('planner-style');
    return (saved && saved in PLANNER_STYLES) ? saved as PlannerStyleName : '默认';
  });
  const setAndSave = (s: PlannerStyleName) => { setStyle(s); localStorage.setItem('planner-style', s); };
  return { style, setStyle: setAndSave, vars: PLANNER_STYLES[style] };
}

// ─── Floating OD Panel ────────────────────────────────────────
interface ODShared {
  targets: number;
  odRate: number;
  odRise: number;
}

interface ODRow {
  origHit: number;
  addHit: number;
  earring: boolean;
  fixedOD: number;
  extraODRise: number;
}

function calcODRow(row: ODRow, shared: ODShared) {
  const { origHit, addHit, earring, fixedOD, extraODRise } = row;
  const { targets, odRate, odRise } = shared;
  const earringVal = earring ? 15 : 0;

  // J: actual OD gain coefficient (Copy-OD method)
  let j: number;
  if (origHit > 9) j = earringVal;
  else if (origHit === 0) j = 0;
  else if (earringVal === 0) j = 0;
  else j = ((origHit - 1) / 9 * (earringVal - 5) + 5);
  j = j / 100 + 1 + (odRise + extraODRise) / 100;

  const part1 = Math.floor(fixedOD * j * 100) / 100;
  const j25 = Math.floor(j * 2.5 * 100) / 100;
  const part2 = (origHit + addHit) * Math.floor(j25 * odRate) / 100 * targets;
  const n = (part1 + part2) / 100;
  const actualHits = n * 40;
  return { n, actualHits };
}

const OD_NUM = 'bg-transparent border-0 text-center text-[10px] py-0.5 w-full';

function ODPanel() {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<ODShared>({ targets: 1, odRate: 100, odRise: 0 });
  const [rows, setRows] = useState<ODRow[]>([
    { origHit: 0, addHit: 0, earring: true, fixedOD: 0, extraODRise: 0 },
  ]);
  const [showHit, setShowHit] = useState(false);
  const [showExtraOD, setShowExtraOD] = useState<Record<number, boolean>>({});
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - 340,
    y: Math.max(0, window.innerHeight / 2 - 250),
  }));
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 340, dragStart.current.px + ev.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.py + ev.clientY - dragStart.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleShowHit = () => setShowHit(prev => !prev);

  const addRow = () => setRows(prev => [...prev, { origHit: 0, addHit: 0, earring: true, fixedOD: 0, extraODRise: 0 }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const updateRow = (i: number, fn: (r: ODRow) => ODRow) => {
    setRows(prev => prev.map((r, idx) => idx === i ? fn(r) : r));
  };

  const [sharedOpen, setSharedOpen] = useState(true);

  return (
    <>
      {/* Always-visible tab at right edge */}
      <div
        className="fixed z-50 flex"
        style={{ right: 0, top: '40%' }}
      >
        {!open ? (
          <button
            className="bg-bg-card border border-white/10 border-r-0 rounded-l-lg px-1.5 py-3 text-[11px] text-text-muted hover:text-text-primary transition-colors"
            style={{ writingMode: 'vertical-rl' }}
            onClick={() => setOpen(true)}
          >
            OD计算
          </button>
        ) : (
          <button
            className="bg-bg-card border border-white/10 rounded-l-lg px-1 py-3 text-[10px] text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        )}
      </div>

      {/* Draggable panel */}
      {open && (
      <div
        ref={panelRef}
        className="fixed z-50 w-[320px] max-h-[80vh] overflow-y-auto rounded-xl shadow-2xl"
        style={{ left: pos.x, top: pos.y, background: 'var(--app-bg-card)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing border-b border-white/10 select-none"
          onMouseDown={onMouseDown}
        >
          <span className="text-xs font-bold">OD 计算</span>
          <button className="text-text-muted hover:text-text-primary text-xs" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="p-2.5 space-y-2">
          {/* Shared properties — collapsible */}
          <div className="glass-strong rounded-lg !p-2 space-y-1.5">
            <div className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setSharedOpen(o => !o)}>
              <span className="text-[10px] font-medium text-text-muted">全局属性</span>
              <span className="text-sm text-text-muted">{sharedOpen ? '▾' : '▸'}</span>
            </div>
            {sharedOpen && (
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <div className="text-[9px] text-text-muted">目标数</div>
                  <input className={OD_NUM} type="number" placeholder="1" value={shared.targets || ''}
                    onChange={e => setShared(s => ({ ...s, targets: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <div className="text-[9px] text-text-muted">目标OD率%</div>
                  <input className={OD_NUM} type="number" step="0.5" value={shared.odRate || ''}
                    onChange={e => setShared(s => ({ ...s, odRate: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <div className="text-[9px] text-text-muted">额外OD上升量%</div>
                  <input className={OD_NUM} type="number" step="0.01" value={shared.odRise || ''}
                    onChange={e => setShared(s => ({ ...s, odRise: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            )}
          </div>

          {/* Column header row */}
          <div className="flex items-center gap-1 px-1 text-[9px] text-text-muted text-center">
            <span className="w-4 flex-shrink-0"></span>
            <span className="flex-1 grid grid-cols-[1fr_1fr_1fr_2fr]">
              <span>技能hit</span>
              <span>附加hit</span>
              <span>固定OD</span>
              <span className="flex justify-between whitespace-nowrap pl-2">
                <span>耳环</span>
                <span className="cursor-pointer hover:text-text-primary" onClick={toggleShowHit}>
                  {showHit ? 'hit数' : '百分比%'}
                </span>
              </span>
            </span>
            <span className="flex-shrink-0" style={{ width: 16 }}></span>
          </div>

          {/* OD rows */}
          <div className="space-y-1">
            {rows.map((row, i) => {
              const r = calcODRow(row, shared);
              return (
                <div key={i} className="glass-strong rounded-lg !p-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-muted w-4 flex-shrink-0">#{i + 1}</span>
                    <div className="flex-1 grid grid-cols-[1fr_1fr_1fr_2fr]">
                      <input className={OD_NUM} type="number" placeholder="0" value={row.origHit || ''}
                        onChange={e => updateRow(i, r => ({ ...r, origHit: parseInt(e.target.value) || 0 }))} />
                      <input className={OD_NUM} type="number" placeholder="0" value={row.addHit || ''}
                        onChange={e => updateRow(i, r => ({ ...r, addHit: parseInt(e.target.value) || 0 }))} />
                      <input className={OD_NUM} type="number" step="0.1" placeholder="0" value={row.fixedOD || ''}
                        onChange={e => updateRow(i, r => ({ ...r, fixedOD: parseFloat(e.target.value) || 0 }))} />
                      <div className="flex items-center">
                        <label className="cursor-pointer select-none pl-1">
                          <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${row.earring ? 'bg-accent border-accent' : 'toggle-off'}`}
                            onClick={() => updateRow(i, r => ({ ...r, earring: !r.earring }))}>
                            {row.earring && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </label>
                        <button className="text-xs text-text-muted hover:text-text-primary ml-0.5 leading-none px-0.5"
                          onClick={() => setShowExtraOD(p => ({ ...p, [i]: !p[i] }))}
                          title="额外OD上升量">
                          {showExtraOD[i] ? '▾' : '▸'}
                        </button>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-accent font-bold cursor-pointer select-none text-[10px] border border-white/10 rounded px-1.5 py-0.5 text-center min-w-[48px]"
                            onClick={toggleShowHit} title="点击切换 实际OD%/实际hit数">
                            {showHit
                              ? `${r.actualHits.toFixed(3)}`
                              : `${(r.n * 100).toFixed(2)}%`}
                          </span>
                          <button className="text-text-muted hover:text-accent px-0.5" style={{ width: 14, height: 14, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(showHit ? r.actualHits.toFixed(3) : (r.n * 100).toFixed(2)); }}
                            title="复制数值">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                        </div>
                      </div>
                      {showExtraOD[i] && (
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-[9px] text-text-muted flex-shrink-0">额外OD上升量%</span>
                          <input className="bg-transparent border border-white/10 rounded text-center text-[10px] py-0.5" style={{ width: 48 }} type="number" step="0.01" placeholder="0"
                            value={row.extraODRise || ''}
                            onChange={e => updateRow(i, r => ({ ...r, extraODRise: parseFloat(e.target.value) || 0 }))} />
                        </div>
                      )}
                    </div>
                    <button className="text-red-400/60 hover:text-red-400 text-xs flex-shrink-0"
                      onClick={() => removeRow(i)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn btn-secondary btn-xs w-full" onClick={addRow}>+ 添加行</button>
        </div>
      </div>
      )}
    </>
  );
}

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  return Math.round(n).toLocaleString('zh-CN');
}

function fmtFloat(n: number, decimals = 1): string {
  if (!isFinite(n)) return '—';
  return Number(n.toFixed(decimals)).toLocaleString('zh-CN');
}

const OD_MODE_OPTIONS = [
  { value: '300', label: '百分比(300%)' },
  { value: '120', label: 'Hit数(120)' },
] as const;

function isODRound(label: string): boolean { return label.includes('OD'); }
function isExtraRound(label: string): boolean { return label.includes('追加'); }

function getODLevel(label: string): number {
  if (label.includes('OD3')) return 3;
  if (label.includes('OD2')) return 2;
  if (label.includes('OD1')) return 1;
  return 0;
}

function getTurnTypeKey(turn: PlannerTurn): string {
  if (turn.turnType === 'extra') return 'extra';
  if (turn.roundLabel.includes('OD内')) return 'odin';
  if (isODRound(turn.roundLabel)) {
    const prefix = turn.roundLabel.startsWith('后置') ? 'post' : 'pre';
    return `od${getODLevel(turn.roundLabel)}${prefix}`;
  }
  return 'normal';
}

function turnTypeToLabel(type: string, normalNum: number): string {
  switch (type) {
    case 'normal': return String(normalNum);
    case 'extra': return '追加';
    case 'odin': return 'OD内';
    case 'od1pre': return '前置OD1';
    case 'od2pre': return '前置OD2';
    case 'od3pre': return '前置OD3';
    case 'od1post': return '后置OD1';
    case 'od2post': return '后置OD2';
    case 'od3post': return '后置OD3';
    default: return String(normalNum);
  }
}

function emptyFA(): FrontAction {
  return { charIndex: -1, action: '', spCost: 0, spGain: 0, odGain: 0, dr: 0 };
}

function syncNormalLabels(turns: PlannerTurn[]): PlannerTurn[] {
  let counter = 0;
  return turns.map(t => {
    if (!isODRound(t.roundLabel) && !isExtraRound(t.roundLabel) && t.encounterModifier === undefined) {
      counter++;
      const expected = String(counter);
      if (t.roundLabel !== expected) return { ...t, roundLabel: expected };
    }
    return t;
  });
}

// ─── Shared tiny input style ──────────────────────────────────
const TINY = 'input-field text-[8px] py-px px-0.5 w-full text-center';
const TINY_NUM = 'input-field text-[8px] py-px px-0 text-center';

// ─── Detail Table ─────────────────────────────────────────────

function DetailTable({
  state, setState, computed,
}: {
  state: TurnPlannerState;
  setState: (s: TurnPlannerState) => void;
  computed: ComputedTurnResult[];
}) {
  const { characters, turns, odMode, showBreak, showEncounter } = state;

  const updateChar = (i: number, fn: (c: typeof characters[number]) => typeof characters[number]) => {
    const next = [...characters] as typeof characters;
    const oldName = next[i].name;
    next[i] = fn(next[i]);
    const newName = next[i].name;
    // If user swapped names between two slots, update turn references to follow the names
    let updatedTurns = state.turns;
    if (newName && newName !== oldName) {
      const otherIdx = next.findIndex((c, idx) => idx !== i && c.name === newName);
      if (otherIdx >= 0) {
        // Swap: otherIdx keeps oldName, update turn charIndex references
        next[otherIdx] = { ...next[otherIdx], name: oldName };
        updatedTurns = state.turns.map(t => ({
          ...t,
          frontActions: t.frontActions.map(fa => {
            if (fa.charIndex === otherIdx) return { ...fa, charIndex: i };
            if (fa.charIndex === i) return { ...fa, charIndex: otherIdx };
            return fa;
          }) as typeof t.frontActions,
        }));
      }
    }
    setState({ ...state, characters: next, turns: updatedTurns });
  };

  const updateTurn = (ti: number, fn: (t: PlannerTurn) => PlannerTurn) => {
    let next = turns.map((t, i) => i === ti ? fn(t) : t);
    next = syncNormalLabels(next);
    setState({ ...state, turns: next });
  };

  const updateTurnType = (ti: number, typeKey: string, normalNum: number) => {
    const newLabel = turnTypeToLabel(typeKey, normalNum);
    const newTurnType = typeKey === 'extra' ? 'extra' as const : 'normal' as const;
    let next = turns.map((t, i) => i === ti ? { ...t, roundLabel: newLabel, turnType: newTurnType } : t);
    next = syncNormalLabels(next);
    setState({ ...state, turns: next });
  };

  const addTurn = () => {
    const newTurn: PlannerTurn = {
      roundLabel: '', turnType: 'normal',
      frontActions: [emptyFA(), emptyFA(), emptyFA()],
      backSPGain: [0, 0, 0],
      jailOD: 0, passiveOD: 0, bossDR: 0,
    };
    const next = syncNormalLabels([...turns, newTurn]);
    setState({ ...state, turns: next });
  };

  const removeTurn = (ti: number) => {
    if (turns.length <= 1) return;
    let next = turns.filter((_, i) => i !== ti);
    next = syncNormalLabels(next);
    setState({ ...state, turns: next });
  };

  let normalCounter = 0;

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold">排轴详表</h3>
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] text-text-muted">OD</span>
          <select className="input-field text-[10px] py-0.5 w-28"
            value={String(odMode)} onChange={e => setState({ ...state, odMode: parseInt(e.target.value) as ODMode })}>
            {OD_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-text-muted" onClick={() => setState({ ...state, showBreak: !showBreak })}>
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${showBreak ? 'bg-accent border-accent' : 'toggle-off'}`}>
              {showBreak && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            破坏
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-text-muted" onClick={() => setState({ ...state, showEncounter: !showEncounter })}>
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${showEncounter ? 'bg-accent border-accent' : 'toggle-off'}`}>
              {showEncounter && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            遭遇战
          </label>
        </div>
      </div>

      <table className="planner-table">
        <colgroup>
          <col style={{ width: 48 }} />
          {[1,2,3].map(n => <Fragment key={n}>
            <col className="planner-col-front planner-col-group-start" style={{ width: 45 }} />
            <col className="planner-col-front" style={{ width: 30 }} />
            <col className="planner-col-front" style={{ width: 30 }} />
            <col className="planner-col-front" style={{ width: 30 }} />
            {showBreak && <col className="planner-col-front" style={{ width: 30 }} />}
          </Fragment>)}
          {[1,2,3].map(n => <Fragment key={`b${n}`}>
            <col className="planner-col-back planner-col-group-start" style={{ width: 36 }} />
            <col className="planner-col-back" style={{ width: 30 }} />
          </Fragment>)}
          <col className="planner-col-od planner-col-group-start" style={{ width: 42 }} />
          <col className="planner-col-od" style={{ width: showBreak ? 26 : 32 }} />
          {showBreak && <col className="planner-col-od" style={{ width: 26 }} />}
          {showEncounter && <col style={{ width: 18 }} />}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 bg-bg-card z-10">#</th>
            {[1, 2, 3].map(n => <th key={n} colSpan={showBreak ? 5 : 4} className="text-center">前{n}</th>)}
            {[1, 2, 3].map(n => <th key={`b${n}`} colSpan={2} className="text-center">后{n}</th>)}
            <th>被动OD</th>
            <th>总计OD</th>
            {showBreak && <th>总计破坏</th>}
          </tr>
        </thead>
        <tbody>
          {/* 入场: name + SP side by side */}
          <tr className="bg-indigo-500/8">
            <td className="font-bold sticky left-0 bg-indigo-500/8 z-10 text-[9px]">入场</td>
            {characters.map((c, i) => (
              <td key={i} colSpan={i < 3 ? (showBreak ? 5 : 4) : 2}>
                <div className="flex gap-0.5">
                  <input className={TINY} style={{ flex: 1 }} placeholder={`C${i + 1}`} value={c.name}
                    onChange={e => updateChar(i, ch => ({ ...ch, name: e.target.value }))} />
                  <input className={TINY} style={{ width: i < 3 ? '28%' : '45%' }} type="number" placeholder="SP"
                    value={c.sp || ''}
                    onChange={e => updateChar(i, ch => ({ ...ch, sp: parseFloat(e.target.value) || 0 }))} />
                </div>
              </td>
            ))}
            <td>
              <input className={TINY_NUM} style={{ border: 'none' }} type="number" step="0.1"
                value={state.defaultPassiveOD || ''} placeholder="被动" title="全局被动OD"
                onChange={e => setState({ ...state, defaultPassiveOD: parseFloat(e.target.value) || 0 })} />
            </td>
            <td></td>
            {showBreak && <td></td>}
          </tr>
          {/* Gap + column labels */}
          <tr className="planner-spacer"><td colSpan={99}></td></tr>
          <tr className="text-text-muted">
            <td className="text-[8px] text-center sticky left-0 bg-bg-card z-10"></td>
            {[1, 2, 3].map(n => <Fragment key={n}>
              <td className="text-[8px] text-center">角色</td>
              <td className="text-[8px] text-center">消耗SP</td>
              <td className="text-[8px] text-center">获得SP</td>
              <td className="text-[8px] text-center">OD</td>
              {showBreak && <td className="text-[8px] text-center">破坏</td>}
            </Fragment>)}
            {[1, 2, 3].map(n => <Fragment key={`b${n}`}>
              <td className="text-[8px] text-center">角色</td>
              <td className="text-[8px] text-center">变化SP</td>
            </Fragment>)}
            <td></td><td></td>
            {showBreak && <td></td>}
          </tr>

          {/* Turns */}
          {turns.map((turn, origTi) => ({ turn, origTi })).filter(({ turn }) => showEncounter || turn.encounterModifier === undefined).map(({ turn, origTi }) => {
            const ti = origTi;
            const isModifier = showEncounter && turn.encounterModifier !== undefined;
            const isOD = isODRound(turn.roundLabel);
            const isExtra = isExtraRound(turn.roundLabel);
            const isODin = turn.roundLabel.includes('OD内');
            const prevTurn = ti > 0 ? turns[ti - 1] : null;
            const prevIsOD = prevTurn ? isODRound(prevTurn.roundLabel) || prevTurn.roundLabel.includes('OD内') : false;
            const prevResult = ti > 0 ? computed[ti - 1] : null;
            const curResult = computed[ti];
            if (!isOD && !isExtra && !isModifier) normalCounter++;
            const normalLabel = (isOD || isExtra || isODin) ? normalCounter + 1 : normalCounter;
            const typeKey = getTurnTypeKey(turn);
            const extraIsRed = isExtra && prevIsOD;
            const rowBgA = (isOD || isODin || extraIsRed) ? 'rgba(239,68,68,0.06)' : isExtra ? 'rgba(34,197,94,0.04)' : '';
            const frontIdxSet = new Set(turn.frontActions.map(a => a.charIndex).filter(i => i >= 0));
            const backChars = [0, 1, 2, 3, 4, 5].filter(i => !frontIdxSet.has(i));
            // Auto-number modifier rows
            let modNum = 0;
            if (isModifier) { for (let k = 0; k <= ti; k++) { if (turns[k].encounterModifier !== undefined) modNum++; } }

            // Modifier row: short text, no character slots
            if (isModifier) {
              const modColSpan = (showBreak ? 5 : 4) * 3 + 6;
              return (
                <tr key={ti} className="planner-mod-row">
                  <td className="text-center sticky left-0 z-10 font-bold text-[10px] text-purple-400"
                    style={{ background: 'rgba(139,92,246,0.08)' }}>
                    词条{modNum}
                  </td>
                  <td colSpan={modColSpan}>
                    <input className="input-field text-[10px] py-0.5 w-full" placeholder="词条内容…"
                      value={turn.encounterModifier || ''}
                      onChange={e => updateTurn(ti, t => ({ ...t, encounterModifier: e.target.value }))} />
                  </td>
                  <td>
                    <input className={TINY_NUM} style={{ border: 'none' }} type="number" step="0.1"
                      value={(turn.jailOD + turn.passiveOD) || ''} placeholder="0"
                      onChange={e => updateTurn(ti, t => ({ ...t, jailOD: parseFloat(e.target.value) || 0, passiveOD: 0 }))} />
                  </td>
                  <td className={`text-center font-mono font-bold text-xs relative ${(curResult?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`}>
                    {fmtFloat(curResult?.odCapped ?? 0, 2)}
                    <button className="absolute -right-3 top-1/2 -translate-y-1/2 text-red-400/60 hover:text-red-400 text-sm leading-none"
                      onClick={() => removeTurn(ti)} title="删除">✕</button>
                  </td>
                  {showBreak && <td className="text-center font-mono font-bold text-xs text-text-muted">{fmtFloat(curResult?.cumulativeDR ?? 0, 2)}</td>}
                </tr>
              );
            }

            return (
              <Fragment key={ti}>
                {/* Row A: 角色 + 行动 */}
                <tr className={(isOD && !isODin) ? 'planner-od-start' : ''}>
                  <td className={`text-center sticky left-0 z-10 font-bold text-[12px] bg-bg-card ${(isOD || isODin || extraIsRed) ? 'text-red-400' : isExtra ? 'text-green-400' : ''}`}
                    style={{ background: rowBgA || undefined }} rowSpan={2}>
                    <select className="w-full h-full border-0 bg-transparent text-center font-bold appearance-none cursor-pointer"
                      style={{ color: 'inherit', fontSize: 'inherit' }}
                      value={typeKey} onChange={e => updateTurnType(ti, e.target.value, normalCounter)}>
                      <option value="normal">{normalLabel}</option>
                      <option value="extra">追加</option>
                      <option value="odin">OD内</option>
                      <option value="od1pre">前置OD1</option>
                      <option value="od2pre">前置OD2</option>
                      <option value="od3pre">前置OD3</option>
                      <option value="od1post">后置OD1</option>
                      <option value="od2post">后置OD2</option>
                      <option value="od3post">后置OD3</option>
                    </select>
                  </td>

                  {/* Front 3 — Row A */}
                  {turn.frontActions.map((fa, ai) => (
                    <Fragment key={ai}>
                      <td>
                        <select className="input-field text-[8px] py-0.5 w-full text-center" value={fa.charIndex}
                          onChange={e => {
                            const ci = parseInt(e.target.value);
                            updateTurn(ti, t => {
                              const fns = [...t.frontActions] as typeof t.frontActions;
                              fns[ai] = { ...fns[ai], charIndex: ci };
                              return { ...t, frontActions: fns };
                            });
                          }}>
                          <option value={-1}>—</option>
                          {characters.map((c, ci) => c.name ? <option key={ci} value={ci}>{c.name}</option> : null)}
                        </select>
                      </td>
                      <td colSpan={showBreak ? 4 : 3}>
                        <input className={TINY} type="text" value={fa.action} placeholder="行动"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], action: e.target.value };
                            return { ...t, frontActions: fns };
                          })} />
                      </td>
                    </Fragment>
                  ))}

                  {/* Back 3 */}
                  {[0, 1, 2].map(bi => {
                    const ci = backChars[bi] ?? -1;
                    return (
                      <Fragment key={bi}>
                        <td className="text-center text-[10px] text-text-muted">
                          {ci >= 0 ? characters[ci].name || ci + 1 : null}
                        </td>
                        <td rowSpan={2}>
                          <input className={TINY_NUM} style={{ border: 'none' }} type="number" value={turn.backSPGain[bi] || ''} placeholder="0"
                            onChange={e => updateTurn(ti, t => {
                              const bg = [...t.backSPGain] as typeof t.backSPGain;
                              bg[bi] = parseFloat(e.target.value) || 0;
                              return { ...t, backSPGain: bg };
                            })} />
                        </td>
                      </Fragment>
                    );
                  })}

                  {/* ±OD (rowSpan=2) */}
                  <td rowSpan={2}>
                    <input className={TINY_NUM} style={{ border: 'none' }} type="number" step="0.1"
                      value={(turn.jailOD + turn.passiveOD) || ''} placeholder="0" title="额外OD"
                      onChange={e => updateTurn(ti, t => ({ ...t, jailOD: parseFloat(e.target.value) || 0, passiveOD: 0 }))} />
                  </td>

                  {/* 当前OD (rowSpan=2) */}
                  <td className={`text-center font-mono font-bold text-xs ${!showBreak ? 'relative' : ''} ${(curResult?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`} rowSpan={2}>
                    {fmtFloat(curResult?.odCapped ?? 0, 2)}
                    {!showBreak && (
                      <button className="absolute -right-3 top-1/2 -translate-y-1/2 text-red-400/60 hover:text-red-400 text-sm leading-none"
                        onClick={() => removeTurn(ti)} title="删除">✕</button>
                    )}
                  </td>

                  {/* 总计破坏 (rowSpan=2) */}
                  {showBreak && (
                    <td className="text-center font-mono font-bold text-xs text-text-muted relative" rowSpan={2}>
                      {fmtFloat(curResult?.cumulativeDR ?? 0, 2)}
                      <button className="absolute -right-3 top-1/2 -translate-y-1/2 text-red-400/60 hover:text-red-400 text-sm leading-none"
                        onClick={() => removeTurn(ti)} title="删除">✕</button>
                    </td>
                  )}
                  {/* Encounter "+" button */}
                  {showEncounter && (
                    <td rowSpan={2} className="text-center w-5">
                      <button className="text-accent/60 hover:text-accent text-xs leading-none px-0.5"
                        onClick={() => {
                          const next = [...turns];
                          next.splice(ti + 1, 0, {
                            roundLabel: '', turnType: 'normal' as const,
                            frontActions: [emptyFA(), emptyFA(), emptyFA()],
                            backSPGain: [0, 0, 0],
                            jailOD: 0, passiveOD: 0, bossDR: 0,
                            encounterModifier: '',
                          });
                          setState({ ...state, turns: syncNormalLabels(next) });
                        }} title="添加词条">+</button>
                    </td>
                  )}
                </tr>

                {/* Row B: SP | 消耗 | 获得 | OD */}
                <tr>
                  {turn.frontActions.map((fa, ai) => {
                    const curSP = prevResult?.sp[fa.charIndex] ?? (fa.charIndex >= 0 ? characters[fa.charIndex].sp : 0);
                    return (
                      <Fragment key={ai}>
                        <td className="text-center font-mono text-xs text-text-muted">{fmt(curSP)}</td>
                        <td><input className={TINY_NUM} type="number" value={fa.spCost || ''} placeholder="0"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], spCost: parseFloat(e.target.value) || 0 };
                            return { ...t, frontActions: fns };
                          })} /></td>
                        <td><input className={TINY_NUM} type="number" value={fa.spGain || ''} placeholder="0"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], spGain: parseFloat(e.target.value) || 0 };
                            return { ...t, frontActions: fns };
                          })} /></td>
                        <td><input className={TINY_NUM} type="number" step="0.1" value={fa.odGain || ''} placeholder="0"
                          onChange={e => updateTurn(ti, t => {
                            const fns = [...t.frontActions] as typeof t.frontActions;
                            fns[ai] = { ...fns[ai], odGain: parseFloat(e.target.value) || 0 };
                            return { ...t, frontActions: fns };
                          })} /></td>
                        {showBreak && (
                          <td><input className={TINY_NUM} type="number" step="0.1" value={fa.dr || ''} placeholder="0"
                            onChange={e => updateTurn(ti, t => {
                              const fns = [...t.frontActions] as typeof t.frontActions;
                              fns[ai] = { ...fns[ai], dr: parseFloat(e.target.value) || 0 };
                              return { ...t, frontActions: fns };
                            })} /></td>
                        )}
                      </Fragment>
                    );
                  })}
                  {/* Back 3 — Row B: SP values */}
                  {[0, 1, 2].map(bi => {
                    const ci = backChars[bi] ?? -1;
                    const curSP = ci >= 0 ? (prevResult?.sp[ci] ?? characters[ci].sp) : 0;
                    return (
                      <td key={bi} className="text-center font-mono text-xs text-text-muted">{fmt(curSP)}</td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <button className="btn btn-secondary btn-xs mt-2" onClick={addTurn}>+ 添加回合</button>
    </div>
  );
}

// ─── Simple Table ─────────────────────────────────────────────

const SIMPLE_SLOT_COLORS = [
  'var(--simple-slot1)',
  'var(--simple-slot2)',
  'var(--simple-slot3)',
] as const;

function SimpleTable({
  state, computed, score, setScore, turnsCount, setTurnsCount, onTitleChange, onImportState,
  title, setTitle, author, setAuthor, notes, setNotes,
}: {
  state: TurnPlannerState;
  computed: ComputedTurnResult[];
  score: number; setScore: (v: number) => void;
  turnsCount: number; setTurnsCount: (v: number) => void;
  onTitleChange: (t: string) => void;
  onImportState: (s: TurnPlannerState) => void;
  title: string; setTitle: (v: string) => void;
  author: string; setAuthor: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
}) {
  const { characters, turns } = state;

  const timelineRef = useRef<HTMLDivElement>(null);

  const exportPNG = useCallback(async () => {
    const el = timelineRef.current;
    if (!el) { alert('未找到时间线元素'); return; }
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        onclone(_clonedDoc) {
          // Set light theme
          _clonedDoc.documentElement.setAttribute('data-theme', 'light');
          // Force vertical center in table cells (html2canvas sometimes misaligns)
          const fixCss = _clonedDoc.createElement('style');
          fixCss.textContent = `td, th { vertical-align: middle !important; line-height: 1.2 !important; padding-top: 4px !important; padding-bottom: 4px !important; }`;
          _clonedDoc.head.appendChild(fixCss);
          // Strip oklch() colors (unsupported by html2canvas) from all elements
          _clonedDoc.querySelectorAll('*').forEach(el => {
            const s = (el as HTMLElement).style;
            for (let i = s.length - 1; i >= 0; i--) {
              const val = s.getPropertyValue(s[i]);
              if (val.includes('oklch(')) {
                s.removeProperty(s[i]);
              }
            }
            if (el.hasAttribute('style')) {
              const attr = el.getAttribute('style') || '';
              const cleaned = attr.replace(/oklch\([^)]+\)/gi, '#666');
              if (cleaned !== attr) el.setAttribute('style', cleaned);
            }
          });
          // Also strip from <style> tags
          _clonedDoc.querySelectorAll('style').forEach(st => {
            st.textContent = (st.textContent || '').replace(/oklch\([^)]+\)/gi, '#666');
          });
        },
      });
      canvas.toBlob(blob => {
        if (!blob) { alert('生成图片失败'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hbr-timeline-${title || 'axle'}-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) {
      console.error('导出失败', e);
      alert('导出图片失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [title]);

  const shareAxle = () => {
    const data = { title, author, score, turns: turnsCount, notes, state };
    const json = JSON.stringify(data);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    navigator.clipboard.writeText(encoded).then(
      () => alert('分享码已复制到剪贴板'),
      () => {
        const ok = prompt('复制失败，请手动复制:', encoded);
        if (ok) navigator.clipboard.writeText(ok).catch(() => {});
      },
    );
  };

  const importAxle = () => {
    const encoded = prompt('粘贴分享码:');
    if (!encoded) return;
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      const data = JSON.parse(json);
      if (data.title !== undefined) setTitle(data.title);
      if (data.author !== undefined) setAuthor(data.author);
      if (data.turns !== undefined) setTurnsCount(data.turns);
      if (data.notes !== undefined) setNotes(data.notes);
      if (data.score !== undefined) setScore(data.score);
      if (data.state?.turns?.length > 0) onImportState(data.state);
      alert('导入成功！');
    } catch {
      alert('分享码无效');
    }
  };

  // Front/back: chars 0-2 = front, 3-5 = back (matches detail table layout)
  const frontIndices = [0, 1, 2];
  const backIndices = [3, 4, 5];
  const frontNames = frontIndices.map(i => characters[i].name || `C${i+1}`).join('  ');
  const backNames = backIndices.map(i => characters[i].name || `C${i+1}`).join('  ');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">排轴简表</span>
        <button className="btn btn-secondary btn-xs px-2" onClick={shareAxle} title="分享">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        <button className="btn btn-secondary btn-xs px-2" onClick={importAxle} title="导入">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button className="btn btn-secondary btn-xs px-2" onClick={exportPNG} title="导出PNG">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
      </div>
      <div className="flex gap-4 items-start">
        {/* Left: Meta inputs */}
        <div className="card space-y-2 text-sm flex-shrink-0" style={{ width: 400 }}>
          <div>
            <div className="input-label">标题</div>
            <input className="input-field text-xs py-1.5" placeholder="第xx期打分 xx队 无限od流" value={title} onChange={e => { setTitle(e.target.value); onTitleChange(e.target.value); }} />
          </div>
          <div>
            <div className="input-label">轴作者</div>
            <input className="input-field text-xs py-1.5" placeholder="作者" value={author} onChange={e => setAuthor(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="input-label">分数</div>
              <input className="input-field text-xs py-1.5" type="number" value={score || ''} placeholder="0" onChange={e => setScore(parseInt(e.target.value) || 0)} />
            </div>
            <div className="flex-1">
              <div className="input-label">回合</div>
              <input className="input-field text-xs py-1.5" type="number" value={turnsCount || ''} placeholder="0" onChange={e => setTurnsCount(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <div className="input-label">队伍组成</div>
            <div className="text-xs">
              前: <span className="font-bold">{frontNames || '—'}</span><br/>
              后: <span className="font-bold">{backNames || '—'}</span>
            </div>
          </div>
          <div>
            <div className="input-label">备注</div>
            <textarea className="input-field text-xs py-1.5 w-full" rows={3} placeholder="耳环、突破要求等" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Right: Timeline table */}
        <div ref={timelineRef} className="card overflow-x-auto !p-0 mx-auto" style={{ width: '48%' }}>
          <table className="planner-table simple-timeline" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 56 }} />
              <col style={{ width: 56, background: SIMPLE_SLOT_COLORS[0] }} />
              <col style={{ width: 100, background: SIMPLE_SLOT_COLORS[0] }} />
              <col style={{ width: 56, background: SIMPLE_SLOT_COLORS[1] }} />
              <col style={{ width: 100, background: SIMPLE_SLOT_COLORS[1] }} />
              <col style={{ width: 56, background: SIMPLE_SLOT_COLORS[2] }} />
              <col style={{ width: 100, background: SIMPLE_SLOT_COLORS[2] }} />
              <col style={{ width: 64 }} />
            </colgroup>
            {/* Meta header rows */}
            <thead>
              <tr>
                <td colSpan={8} className="font-bold text-xs text-center px-2" style={{ borderBottom: 'none' }}>【{title || '标题'}】 — 作者: {author || '—'}</td>
              </tr>
              <tr>
                <td colSpan={8} className="text-[10px] text-left px-2" style={{ borderBottom: 'none' }}>
                  前: <span className="font-bold">{frontNames || '—'}</span> | 后: <span className="font-bold">{backNames || '—'}</span>
                </td>
              </tr>
              {notes && (
                <tr>
                  <td colSpan={8} className="text-[10px] text-left px-2" style={{ borderBottom: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}> {notes}</td>
                </tr>
              )}
              <tr>
                <th>回合</th>
                <th colSpan={2} className="text-center">行动槽1</th>
                <th colSpan={2} className="text-center">行动槽2</th>
                <th colSpan={2} className="text-center">行动槽3</th>
                <th>当前OD</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((turn, origTi) => ({ turn, origTi })).filter(({ turn }) => state.showEncounter || turn.encounterModifier === undefined).map(({ turn, origTi }) => {
                const ti = origTi;
                const isModifier = state.showEncounter && turn.encounterModifier !== undefined;
                const isOD = isODRound(turn.roundLabel);
                const isExtra = isExtraRound(turn.roundLabel);
                const isODin = turn.roundLabel.includes('OD内');
                const prevTurn = ti > 0 ? turns[ti - 1] : null;
                const prevIsOD = prevTurn ? isODRound(prevTurn.roundLabel) || prevTurn.roundLabel.includes('OD内') : false;
                const extraIsRed = isExtra && prevIsOD;
                const result = computed[ti];
                const rowBg = (isOD || isODin || extraIsRed) ? 'rgba(239,68,68,0.06)' : isExtra ? 'rgba(34,197,94,0.04)' : '';
                let modNum = 0;
                if (isModifier) { for (let k = 0; k <= ti; k++) { if (turns[k].encounterModifier !== undefined) modNum++; } }

                if (isModifier) {
                  return (
                    <tr key={ti} className="planner-mod-row">
                      <td className="font-bold text-[10px] text-purple-400">词条{modNum}</td>
                      <td colSpan={6} className="text-xs text-left pl-1 text-text-muted">{turn.encounterModifier}</td>
                      <td className={`font-mono font-bold text-xs text-center ${(result?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`}>
                        {fmtFloat(result?.odCapped ?? 0, 2)}
                      </td>
                    </tr>
                  );
                }

                const actionPairs = turn.frontActions.map(a => ({
                  name: a.charIndex >= 0 ? (characters[a.charIndex].name || `C${a.charIndex + 1}`) : '',
                  act: a.action || '',
                }));

                return (
                  <Fragment key={ti}>
                    <tr className={(isOD && !isODin ? 'planner-od-start ' : '') + (ti % 2 === 0 ? 'alt-row' : '')}>
                      <td className={`font-bold text-xs ${(isOD || isODin || extraIsRed) ? 'text-red-400' : isExtra ? 'text-green-400' : ''}`}
                        style={{ background: rowBg || undefined }}>
                        {turn.roundLabel}
                      </td>
                      {actionPairs.map((pair, ai) => (
                        <Fragment key={ai}>
                          <td className="font-medium text-xs text-right pr-1">{pair.name}</td>
                          <td className="text-xs text-left pl-1 text-text-muted">{pair.act}</td>
                        </Fragment>
                      ))}
                      <td className={`font-mono font-bold text-xs text-center ${(result?.odCapped ?? 0) < 0 ? 'text-red-400' : 'text-accent'}`}>
                        {fmtFloat(result?.odCapped ?? 0, 2)}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Axles ──────────────────────────────────────────────

function SavedAxles({
  onLoad,
}: {
  state: TurnPlannerState;
  onLoad: (entry: SavedAxle) => void;
}) {
  const [entries, setEntries] = useState<SavedAxle[]>([]);
  const [allEntries, setAllEntries] = useState<SavedAxle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'score' | 'turns'>('time');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderFilter, setFolderFilter] = useState<number | 'all' | 'uncategorized'>('all');

  const load = async () => {
    setLoading(true);
    const all = await getSavedAxles();
    setAllEntries(all);
    setEntries(all);
    setFolders(await getFolders('planner'));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let list = [...allEntries];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e => e.label.toLowerCase().includes(q));
    if (sortBy === 'score') list.sort((a, b) => b.score - a.score);
    else if (sortBy === 'turns') list.sort((a, b) => a.turns - b.turns);
    if (folderFilter === 'uncategorized') {
      list = list.filter(e => e.folderId == null);
    } else if (folderFilter !== 'all') {
      list = list.filter(e => e.folderId === folderFilter);
    }
    setEntries(list);
  }, [search, allEntries, sortBy, folderFilter]);

  const handleCopy = async (id: number) => {
    await duplicateAxle(id);
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除？')) return;
    await deleteAxle(id);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    await load();
  };

  const handleBatchDelete = async () => {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个轴？`)) return;
    await deleteAxles([...selectedIds]);
    setSelectedIds(new Set());
    await load();
  };

  const startEdit = (id: number, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    await updateAxleLabel(editingId, editLabel.trim());
    setEditingId(null);
    await load();
  };

  // ─── Export / Import ──────────────────────────────────────

  const handleExport = async () => {
    const all = await getAllAxles();
    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hbr-planner-axles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('格式无效');
        if (!confirm(`将导入 ${parsed.length} 个轴，确定？`)) return;
        await importAxles(parsed);
        await load();
        alert('导入成功');
      } catch (err) {
        alert('导入失败: ' + (err instanceof Error ? err.message : '无效的JSON文件'));
      }
    };
    input.click();
  };

  if (loading) return <div className="text-text-muted p-4 text-center">加载中...</div>;

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(entries.map(e => e.id!)));
  };

  return (
    <div className="space-y-4">
      {/* Search + Actions */}
      <div className="card">
        <div className="flex gap-2 items-center">
          <input className="input-field text-sm flex-1" placeholder="搜索轴…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-secondary btn-xs" onClick={handleExport}>导出JSON</button>
          <button className="btn btn-secondary btn-xs" onClick={handleImportFile}>导入JSON</button>
          {selectedIds.size > 0 && (
            <button className="btn btn-danger btn-xs" onClick={handleBatchDelete}>删除选中 ({selectedIds.size})</button>
          )}
        </div>
      </div>

      {/* Folder filter */}
      <div className="card">
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-[10px] text-text-muted mr-1">分组:</span>
          {(['all', 'uncategorized'] as const).map(k => (
            <button key={k} onClick={() => setFolderFilter(k)}
              className={`px-2 py-0.5 rounded text-xs ${folderFilter === k ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
              {{ all: '全部', uncategorized: '未分类' }[k]}
            </button>
          ))}
          {folders.map(f => (
            <button key={f.id} onClick={() => setFolderFilter(f.id!)}
              className={`px-2 py-0.5 rounded text-xs ${folderFilter === f.id ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
              {f.name}
            </button>
          ))}
          <button className="btn btn-xs px-1.5 text-text-muted hover:text-text-primary" title="新建分组"
            onClick={async () => {
              const name = prompt('新建分组名称:');
              if (!name?.trim()) return;
              await createFolder(name.trim(), 'planner');
              setFolders(await getFolders('planner'));
            }}>+</button>
          {folderFilter !== 'all' && folderFilter !== 'uncategorized' && (
            <>
              <button className="btn btn-xs px-1.5 text-text-muted hover:text-text-primary" title="重命名"
                onClick={async () => {
                  const f = folders.find(f => f.id === folderFilter);
                  if (!f) return;
                  const name = prompt('重命名:', f.name);
                  if (!name?.trim()) return;
                  await updateFolder(f.id!, { name: name.trim() });
                  setFolders(await getFolders('planner'));
                }}>✎</button>
              <button className="btn btn-xs px-1.5 text-red-400/60 hover:text-red-400" title="删除分组"
                onClick={async () => {
                  const f = folders.find(f => f.id === folderFilter);
                  if (!f || !confirm(`删除分组 "${f.name}"？条目将移至未分类。`)) return;
                  await deleteFolder(f.id!);
                  setFolderFilter('all');
                  setFolders(await getFolders('planner'));
                  await load();
                }}>✕</button>
            </>
          )}
        </div>
      </div>

      {/* Saved list */}
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
          <h3 className="text-sm font-bold">已保存的轴 ({entries.length})</h3>
          <div className="flex gap-0 text-[10px]">
            <button onClick={() => setSortBy('time')} className={`px-1.5 py-0.5 rounded ${sortBy === 'time' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>时间</button>
            <button onClick={() => setSortBy('score')} className={`px-1.5 py-0.5 rounded ${sortBy === 'score' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>分数</button>
            <button onClick={() => setSortBy('turns')} className={`px-1.5 py-0.5 rounded ${sortBy === 'turns' ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>回合</button>
          </div>
          <div className="flex-1" />
          {entries.length > 0 && (
            <button className="btn btn-danger btn-xs" onClick={async () => {
              if (!confirm('确定清空所有保存的轴？此操作不可恢复。')) return;
              await clearAllAxles();
              await load();
            }}>清空</button>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="text-text-muted text-sm text-center py-8">暂无保存</div>
        ) : (
          <div className="space-y-1.5">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center gap-2 glass-row p-2">
                <input type="checkbox"
                  checked={selectedIds.has(entry.id!)}
                  onChange={e => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(entry.id!);
                    else next.delete(entry.id!);
                    setSelectedIds(next);
                  }} />
                <div className="flex-1 min-w-0">
                  {editingId === entry.id ? (
                    <input className="input-field text-xs py-0.5 w-full" value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                      autoFocus />
                  ) : (
                    <span className="text-sm cursor-pointer hover:text-accent"
                      onClick={() => entry.id != null && startEdit(entry.id, entry.label)}
                      title="点击编辑名称">
                      {entry.label}
                    </span>
                  )}
                  <div className="text-[10px] text-text-muted">
                    {new Date(entry.timestamp).toLocaleString('zh-CN')}
                    {entry.score > 0 && <span className="ml-3">分数 {entry.score.toLocaleString()}</span>}
                    {entry.turns > 0 && <span className="ml-3">回合 {entry.turns}</span>}
                    {entry.author && <span className="ml-3">作者 {entry.author}</span>}
                    {entry.notes && <span className="ml-3 text-text-muted/70 truncate max-w-[200px] inline-block align-bottom">— {entry.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                  <select className="input-field text-[10px] py-0 w-14" value={entry.folderId ?? ''}
                    onChange={async e => {
                      const v = e.target.value;
                      const fid = v === '' ? undefined : v === '__new__' ? null : parseInt(v);
                      if (fid === null) {
                        const name = prompt('新建分组:');
                        if (!name?.trim()) return;
                        const id = await createFolder(name.trim(), 'planner');
                        await setAxleFolder(entry.id!, id);
                        setFolders(await getFolders('planner'));
                      } else {
                        await setAxleFolder(entry.id!, fid);
                      }
                      await load();
                    }}>
                    <option value="">—</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    <option value="__new__">+</option>
                  </select>
                  <button className="btn btn-primary btn-xs px-2" onClick={() => entry.id != null && onLoad(entry)} title="加载">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button className="btn btn-secondary btn-xs px-2" onClick={() => entry.id != null && handleCopy(entry.id)} title="复制">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button className="btn btn-danger btn-xs px-2" onClick={() => entry.id != null && handleDelete(entry.id)} title="删除">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function TurnPlanner({ mode, onSwitchToEditor }: { mode: 'editor' | 'saved'; onSwitchToEditor: () => void }) {
  const [subTab, setSubTab] = useState<PlannerSubTab>('detail');
  const [axleScore, setAxleScore] = useState(0);
  const [axleTurns, setAxleTurns] = useState(0);
  const { style, setStyle, vars: styleVars } = usePlannerStyle();
  const [loadedAxleId, setLoadedAxleId] = useState<number | null>(null);
  const [axleTitle, setAxleTitle] = useState('');
  const [simpleTitle, setSimpleTitle] = useState('');
  const [simpleAuthor, setSimpleAuthor] = useState('');
  const [simpleNotes, setSimpleNotes] = useState('');
  const [state, setState] = useState<TurnPlannerState>(() => {
    const s = createDefaultState();
    return { ...s, turns: syncNormalLabels(s.turns) };
  });
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadPlannerState();
      if (saved && saved.turns.length > 0) {
        setState({ ...saved, turns: syncNormalLabels(saved.turns) });
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePlannerState(state), 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, loaded]);

  const computed = useMemo(() => computeTurnPlanner(state), [state]);

  if (!loaded) return <div className="text-text-muted p-8 text-center">加载中...</div>;

  return (
    <div className="space-y-4" style={styleVars as React.CSSProperties}>
      {mode === 'saved' ? (
        <SavedAxles state={state} onLoad={(entry) => {
          setState(entry.state);
          setLoadedAxleId(entry.id ?? null);
          setAxleScore(entry.score ?? 0);
          setAxleTurns(entry.turns ?? 0);
          setSimpleTitle(entry.label ?? '');
          setSimpleAuthor(entry.author ?? '');
          setSimpleNotes(entry.notes ?? '');
          setAxleTitle(entry.label ?? '');
          onSwitchToEditor();
        }} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">排轴</h2>
            <div className="flex gap-0 items-center">
              <button onClick={() => setSubTab('detail')} className={`sub-tab text-xs ${subTab === 'detail' ? 'active' : ''}`}>排轴</button>
              <button onClick={() => setSubTab('simple')} className={`sub-tab text-xs ${subTab === 'simple' ? 'active' : ''}`}>简轴</button>
              <select className="input-field text-xs py-0.5 w-20 ml-1" value={style} onChange={e => setStyle(e.target.value as PlannerStyleName)}>
                {Object.keys(PLANNER_STYLES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-secondary btn-xs ml-1 px-2" title="重置" onClick={() => {
                if (confirm('确定重置排轴？所有未保存的内容将丢失。')) {
                  setState({ ...createDefaultState(), turns: syncNormalLabels(createDefaultState().turns) });
                }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>
              <button className="btn btn-primary btn-xs ml-1 px-2" title="保存到记录" onClick={async () => {
                const label = axleTitle.trim() || new Date().toLocaleString('zh-CN');
                if (loadedAxleId != null) {
                  await updateAxle(loadedAxleId, label, state, axleScore, axleTurns, simpleAuthor, simpleNotes);
                  alert('已更新');
                } else {
                  await saveAxle(label, state, axleScore, axleTurns, simpleAuthor, simpleNotes);
                  alert('已保存');
                }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </button>
            </div>
          </div>
          {subTab === 'detail' ? <DetailTable state={state} setState={setState} computed={computed} /> :
           <SimpleTable state={state} computed={computed} score={axleScore} setScore={setAxleScore} turnsCount={axleTurns} setTurnsCount={setAxleTurns} onTitleChange={setAxleTitle} onImportState={s => setState({ ...s, turns: syncNormalLabels(s.turns) })} title={simpleTitle} setTitle={setSimpleTitle} author={simpleAuthor} setAuthor={setSimpleAuthor} notes={simpleNotes} setNotes={setSimpleNotes} />}
        </>
      )}
      <ODPanel />
    </div>
  );
}
