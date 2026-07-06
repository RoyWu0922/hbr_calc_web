import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase, signInWithGoogle, signUp as supabaseSignUp, signIn as supabaseSignIn, signOut as supabaseSignOut } from './supabase';
import { pullFromCloud, pushLocalToCloud } from './cloudSync';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, loading: true,
  signInWithGoogle: async () => {},
  signUp: async () => null,
  signIn: async () => null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const syncedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user && !syncedRef.current && !sessionStorage.getItem('hbr_synced')) {
        syncedRef.current = true;
        sessionStorage.setItem('hbr_synced', '1');
        if (confirm('检测到登录成功，是否将本地数据同步到云端？')) {
          pushLocalToCloud().finally(() => pullFromCloud().finally(() => window.location.reload()));
        } else {
          pullFromCloud().finally(() => window.location.reload());
        }
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignInWithGoogle = async () => { await signInWithGoogle(); };
  const handleSignUp = async (email: string, password: string) => {
    const { error } = await supabaseSignUp(email, password);
    return error ? error.message : null;
  };
  const handleSignIn = async (email: string, password: string) => {
    const { error } = await supabaseSignIn(email, password);
    return error ? error.message : null;
  };
  const handleSignOut = async () => { await supabaseSignOut(); };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle: handleSignInWithGoogle, signUp: handleSignUp, signIn: handleSignIn, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
