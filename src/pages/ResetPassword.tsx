import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut, updatePassword } from "@/services/auth";
import { useAuth } from "@/features/auth/auth-context";
import { resetPasswordSchema, type ResetPasswordInput } from "@/features/auth/schemas";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (values: ResetPasswordInput) => {
    setSubmitting(true);
    try {
      await updatePassword(values.password);
      // Consume the recovery session immediately so the same reset-password
      // link/session can't be replayed to change the password again.
      clearPasswordRecovery();
      await signOut();
      toast.success("Password updated. Please sign in again.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <LayoutGrid className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  // Only a session that actually resulted from clicking a reset-password
  // email link (a Supabase PASSWORD_RECOVERY event) may use this page —
  // an ordinary live session must go through Settings' re-authenticated
  // change-password flow instead.
  if (!isPasswordRecovery) {
    return <Navigate to={user ? "/settings" : "/login"} replace />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">Choose a new password for your account</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" disabled={submitting} className="mt-1">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Update password
        </Button>
      </form>
    </div>
  );
}
