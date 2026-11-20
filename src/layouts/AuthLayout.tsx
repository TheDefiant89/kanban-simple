import { Outlet } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { NeonBackdrop } from "@/components/shared/neon-backdrop";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] py-[max(2rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
      <NeonBackdrop />
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="bg-accent-grad neon-lg flex h-[52px] w-[52px] items-center justify-center rounded-[15px] text-white">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <span className="font-display text-lg font-semibold">
            Kanban<span style={{ color: "var(--accent-solid)" }}>.</span> Simple
            <span style={{ color: "var(--accent-solid)" }}>.</span>
          </span>
        </div>
        <div
          className="rounded-[20px] border p-6 backdrop-blur-[20px] sm:p-8 animate-slide-up"
          style={{ background: "var(--popover)", boxShadow: "0 20px 60px oklch(0 0 0 / 0.35)" }}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
