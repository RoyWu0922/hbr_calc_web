import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, authSignUp, authSignIn, authSignOut } from './supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  loading: boolean;
  signUp: (username: string, password: string) => Promise<string | null>;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, loading: true,
  signUp: async () => null, signIn: async () => null, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading,
      signUp: authSignUp, signIn: authSignIn, signOut: authSignOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
