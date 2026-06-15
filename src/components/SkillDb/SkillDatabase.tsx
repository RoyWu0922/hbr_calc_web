import { useState, useEffect } from 'react';
import ImageInfoTip from '../ImageInfoTip';
import skillPic from '/Skill_pic.png';
import { BUFF_SKILLS, DEBUFF_SKILLS, WEAKNESS_SKILLS } from '../../engine/skillDb';
import {
  getCustomSkills, addCustomSkill, deleteCustomSkill,
  getDeletedBuiltins, getBuiltinOverrides, overrideBuiltinSkill,
  deleteBuiltinSkill, restoreBuiltinSkill,
} from '../../engine/customSkills';

type TabKey = 'buff' | 'debuff' | 'weakness';

export default function SkillDatabase() {
  const [tab, setTab] = useState<TabKey>('buff');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingIsBuiltin, setEditingIsBuiltin] = useState(false);

  const [customSkills, setCustomSkills] = useState<Record<TabKey, any[]>>({
    buff: [], debuff: [], weakness: [],
  });
  const [deletedBuiltins, setDeletedBuiltins] = useState<Record<TabKey, Set<string>>>({
    buff: new Set(), debuff: new Set(), weakness: new Set(),
  });
  const [builtinOverrides, setBuiltinOverrides] = useState<Record<TabKey, Record<string, any>>>({
    buff: {}, debuff: {}, weakness: {},
  });

  const refresh = () => {
    setCustomSkills({
      buff: getCustomSkills('buff'),
      debuff: getCustomSkills('debuff'),
      weakness: getCustomSkills('weakness'),
    });
    setDeletedBuiltins({
      buff: getDeletedBuiltins('buff'),
      debuff: getDeletedBuiltins('debuff'),
      weakness: getDeletedBuiltins('weakness'),
    });
    setBuiltinOverrides({
      buff: getBuiltinOverrides('buff'),
      debuff: getBuiltinOverrides('debuff'),
      weakness: getBuiltinOverrides('weakness'),
    });
  };

  useEffect(() => { refresh(); }, [tab, showForm]);

  const [addName, setAddName] = useState('');
  const [addMax, setAddMax] = useState(0);
  const [addMin, setAddMin] = useState(0);
  const [addBorder, setAddBorder] = useState(0);

  const tabs: { key: TabKey; label: string; desc: string }[] = [
    { key: 'buff', label: '加攻区', desc: 'Buff技能' },
    { key: 'debuff', label: '减防区', desc: 'Debuff技能' },
    { key: 'weakness', label: '弱点区', desc: '弱点技能' },
  ];

  const isBuff = tab === 'buff';
  const builtinData = tab === 'buff' ? BUFF_SKILLS : tab === 'debuff' ? DEBUFF_SKILLS : WEAKNESS_SKILLS;

  // Apply overrides to built-in data
  const overriddenBuiltins = builtinData
    .filter(s => !deletedBuiltins[tab].has(s.name))
    .map(s => {
      const ov = builtinOverrides[tab][s.name];
      if (ov && !ov.deleted) return { ...s, max: ov.max ?? s.max, min: ov.min ?? (s as any).min, border: ov.border ?? s.border, _overridden: true };
      return s;
    });

  const allData = [...overriddenBuiltins, ...customSkills[tab]];

  const filtered = search.trim()
    ? allData.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : allData;

  const resetForm = () => {
    setAddName(''); setAddMax(0); setAddMin(0); setAddBorder(0);
    setEditingName(null); setEditingIsBuiltin(false); setShowForm(false);
  };

  const startAdd = () => { resetForm(); setShowForm(true); };

  const startEdit = (skill: any, isBuiltin: boolean) => {
    setAddName(skill.name);
    setAddMax(skill.max);
    setAddMin(skill.min || 0);
    setAddBorder(skill.border);
    setEditingName(skill.name);
    setEditingIsBuiltin(isBuiltin);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!addName.trim()) return;
    const isBuiltin = builtinData.some(s => s.name === (editingName || ''));
    if (editingName && isBuiltin) {
      if (editingName !== addName.trim()) {
        // Renamed built-in → create as custom with new name
        const newSkill: any = isBuff
          ? { name: addName.trim(), max: addMax, border: addBorder, _custom: true }
          : { name: addName.trim(), max: addMax, min: addMin, border: addBorder, _custom: true };
        addCustomSkill(tab, newSkill);
      } else {
        // Same name → override values
        overrideBuiltinSkill(tab, editingName, { max: addMax, min: isBuff ? undefined : addMin, border: addBorder });
      }
    } else if (editingName) {
      // Editing custom skill
      if (editingName !== addName.trim()) {
        deleteCustomSkill(tab, editingName);
      }
      const newSkill: any = isBuff
        ? { name: addName.trim(), max: addMax, border: addBorder, _custom: true }
        : { name: addName.trim(), max: addMax, min: addMin, border: addBorder, _custom: true };
      addCustomSkill(tab, newSkill);
    } else {
      // New skill
      const newSkill: any = isBuff
        ? { name: addName.trim(), max: addMax, border: addBorder, _custom: true }
        : { name: addName.trim(), max: addMax, min: addMin, border: addBorder, _custom: true };
      addCustomSkill(tab, newSkill);
    }
    resetForm();
    refresh();
  };

  const handleDelete = (skill: any) => {
    if (skill._custom) {
      deleteCustomSkill(tab, skill.name);
    } else {
      deleteBuiltinSkill(tab, skill.name);
    }
    refresh();
  };

  const handleRestore = (name: string) => {
    restoreBuiltinSkill(tab, name);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">技能数据库</h2>
        <button className="btn btn-primary btn-sm" onClick={() => showForm ? resetForm() : startAdd()}>
          {showForm ? '取消' : '+ 添加自定义技能'}
        </button>
      </div>
      <p className="text-sm text-text-muted">数据来源: <a href="https://hbr.quest" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">hbr.quest</a><ImageInfoTip src={skillPic} alt="技能数据库说明" /> — 可编辑/删除内置技能，修改保存在本地</p>

      {showForm && !editingName && (
        <div className="card border-accent/30">
          <div className="card-header">添加自定义技能</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <div className="input-label">技能名 *</div>
              <input className="input-field" value={addName} onChange={e => setAddName(e.target.value)}
                placeholder="输入技能名" />
            </div>
            <Field label="Max (1级)" value={addMax} onChange={setAddMax} />
            {!isBuff && <Field label="Min (1级)" value={addMin} onChange={setAddMin} />}
            <Field label="Border (差值)" value={addBorder} onChange={setAddBorder} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!addName.trim()}>确认添加</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} className={`nav-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <input className="input-field max-w-md" placeholder="搜索技能名..."
        value={search} onChange={e => setSearch(e.target.value)} />

      <div className="text-sm text-text-muted">{tabs.find(t => t.key === tab)?.desc}</div>

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>技能名</th>
              <th>Max (1级)</th>
              {!isBuff && <th>Min (1级)</th>}
              <th>Border (差值)</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const isCustom = (s as any)._custom;
              const isOverridden = (s as any)._overridden;
              const editing = editingName === s.name;
              return (
                <tr key={s.name} className={`hover:bg-white/5 ${isCustom ? 'bg-accent/5' : ''} ${isOverridden ? 'bg-gold/5' : ''}`}>
                  <td className="font-medium">
                    {editing ? (
                      <input className="input-field text-xs py-1 w-full" value={addName}
                        onChange={e => setAddName(e.target.value)}
                        />
                    ) : (<>{s.name}{isCustom && <span className="text-xs text-accent ml-1">(自)</span>}{isOverridden && <span className="text-xs text-gold ml-1">(改)</span>}</>)}
                  </td>
                  <td className="font-mono">
                    {editing ? <input className="input-field text-xs py-1 w-16" type="number" value={addMax} onChange={e => setAddMax(parseFloat(e.target.value) || 0)} /> : s.max}
                  </td>
                  {!isBuff && <td className="font-mono">
                    {editing ? <input className="input-field text-xs py-1 w-16" type="number" value={addMin} onChange={e => setAddMin(parseFloat(e.target.value) || 0)} /> : s.min}
                  </td>}
                  <td className="font-mono text-accent">
                    {editing ? <input className="input-field text-xs py-1 w-16" type="number" value={addBorder} onChange={e => setAddBorder(parseFloat(e.target.value) || 0)} /> : s.border}
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      {editing ? (
                        <>
                          <button className="btn btn-xs" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', width: 24, height: 24, padding: 0, borderRadius: 4, cursor: 'pointer' }}
                            onClick={handleSave} title="保存">✓</button>
                          <button className="icon-btn" style={{ width: 24, height: 24, padding: 0, borderRadius: 4, cursor: 'pointer' }}
                            onClick={resetForm} title="取消">✕</button>
                        </>
                      ) : (
                        <>
                          <button className="icon-btn" style={{ width: 24, height: 24, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer' }}
                            onClick={() => startEdit(s, !isCustom)} title="编辑">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button className="btn btn-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)', width: 24, height: 24, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer' }}
                            onClick={() => handleDelete(s)} title="删除">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 5.5v3M7 5.5v3M3 3.5l.5 6.5h5l.5-6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Deleted builtins restore section */}
      {deletedBuiltins[tab].size > 0 && (
        <div className="card">
          <div className="card-header">已删除的内置技能</div>
          <div className="flex gap-2 flex-wrap">
            {Array.from(deletedBuiltins[tab]).map(name => (
              <button key={name} className="btn btn-secondary btn-xs" onClick={() => handleRestore(name)}>
                恢复: {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-text-muted">
        共 {filtered.length} 个技能（内置 {overriddenBuiltins.length} + 自定义 {customSkills[tab].length}）
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="input-label">{label}</div>
      <input className="input-field" type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}
