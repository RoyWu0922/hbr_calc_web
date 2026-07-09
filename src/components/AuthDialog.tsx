import { useState } from 'react';
import { useAuth } from '../utils/auth';

export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn, signUp } = useAuth();

  const submit = async () => {
    setError('');
    const u = username.trim();
    if (!u || !password.trim()) { setError('请填写用户名和密码'); return; }
    if (u.length < 2) { setError('用户名至少2位'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }
    setBusy(true);
    const err = mode === 'login' ? await signIn(u, password) : await signUp(u, password);
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-sm p-6">
        <h3 className="text-lg font-bold mb-4">{mode === 'login' ? '登录' : '注册'}</h3>

        <input className="input-field text-sm mb-2" placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        <input className="input-field text-sm mb-3" type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        {error && <div className="text-red-400 text-xs mb-2">{error}</div>}

        <button className="btn btn-primary w-full mb-3" onClick={submit} disabled={busy}>
          {busy ? '处理中…' : mode === 'login' ? '登录' : '注册'}
        </button>

        <div className="text-center">
          <button className="text-xs text-accent hover:underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </button>
        </div>
        <div className="text-center mt-2 pt-2 border-t border-white/10">
          <p className="text-[10px] text-amber-400/80">⚠ 标签同步功能尚未完成</p>
        </div>
      </div>
    </div>
  );
}
