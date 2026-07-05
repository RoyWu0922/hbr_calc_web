import { useState } from 'react';
import { useAuth } from '../utils/auth';

type Mode = 'login' | 'signup';

export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn, signUp } = useAuth();

  const submit = async () => {
    setError('');
    if (!username.trim() || !password.trim()) { setError('请填写用户名和密码'); return; }
    if (username.length < 2) { setError('用户名至少2位'); return; }
    if (password.length < 6) { setError('密码至少6位'); return; }
    setBusy(true);
    // Use username as pseudo-email for Supabase auth
    const email = username.trim().toLowerCase() + '@hbr.local';
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-sm p-6">
        <h3 className="text-lg font-bold mb-4">{mode === 'login' ? '登录' : '注册'}</h3>
        <p className="text-xs text-text-muted mb-4">登录后数据自动同步到云端，多设备共享</p>

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
      </div>
    </div>
  );
}
