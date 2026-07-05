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

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Re-proves the current session's owner actually knows the account password,
 * by performing a fresh sign-in with it. A stolen/hijacked session has no
 * way to pass this, so it gates the app's most destructive actions.
 */
export async function reauthenticateWithPassword(password: string): Promise<void> {
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const email = data.user?.email;
  if (!email) throw new Error("Not authenticated");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Incorrect password");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await reauthenticateWithPassword(currentPassword);
  await updatePassword(newPassword);
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
