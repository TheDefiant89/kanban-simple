import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { signUp, resendSignUpVerification } from "@/services/auth";
import { registerSchema, type RegisterInput } from "@/features/auth/schemas";

export default function Register() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterInput) => {
    setSubmitting(true);
    try {
      const email = values.email.trim().toLowerCase();
      const data = await signUp(email, values.password);
      if (data.session) {
        toast.success("Account created");
        navigate("/dashboard", { replace: true });
      } else {
        setSentEmail(email);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!sentEmail) return;
    setResending(true);
    try {
      await resendSignUpVerification(sentEmail);
      toast.success("Verification email resent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend email");
    } finally {
      setResending(false);
    }
  };

  if (sentEmail) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="h-10 w-10 text-primary" />
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a verification link to <span className="font-medium">{sentEmail}</span>.
          Confirm it to finish creating your account, then sign in.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={resending}
          onClick={onResend}
        >
          {resending && <Loader2 className="h-4 w-4 animate-spin" />}
          Resend verification email
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">Start organising your projects in minutes</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-describedby="password-hint"
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : (
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least 8 characters
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" disabled={submitting} className="mt-1">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
