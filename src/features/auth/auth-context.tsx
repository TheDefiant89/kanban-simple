import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * True only when the current session resulted from a Supabase
   * PASSWORD_RECOVERY event (i.e. the user arrived via a reset-password
   * email link), as opposed to a normal signed-in session. Gates
   * ResetPassword so a merely-live session can't be used to change the
   * password without going through the recovery-email flow.
   */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const clearPasswordRecovery = React.useCallback(() => setIsPasswordRecovery(false), []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isPasswordRecovery,
      clearPasswordRecovery,
    }),
    [session, loading, isPasswordRecovery, clearPasswordRecovery]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
