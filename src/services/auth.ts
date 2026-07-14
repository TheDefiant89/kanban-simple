import { supabase } from "@/supabase/client";

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login`,
    },
  });
  if (error) throw error;
  return data;
}

export async function resendSignUpVerification(email: string) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login`,
    },
  });
  if (error) throw error;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
  });
  if (error) throw error;
}

/**
 * Used only by the recovery-link flow (ResetPassword.tsx), where a valid
 * recovery session already proves email ownership and there is no current
 * password to check.
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Changes the current user's password. The current password is verified
 * server-side by the change_own_password RPC, so a hijacked/stolen session
 * alone isn't enough to change it, even via a direct API call. Repeated
 * incorrect attempts are rate-limited server-side (see migration
 * 20260711000000); the RPC reports that via its return value rather than
 * a thrown error, since a raised exception would roll back its own attempt
 * tracking write. On success the RPC also revokes every other session for
 * the account (see migration 20260714000000), so a stolen session doesn't
 * survive this call.
 */
export async function changePassword(currentPassword: string, newPassword: string) {
  const { data, error } = await supabase.rpc("change_own_password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (error) throw new Error(/incorrect password/i.test(error.message) ? "Incorrect password" : error.message);
  if (data === "incorrect_password") throw new Error("Incorrect password");
  if (data === "locked_out") {
    throw new Error("Too many incorrect password attempts. Try again in a few minutes.");
  }
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
