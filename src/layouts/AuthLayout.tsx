import { Outlet } from "react-router-dom";
import { LayoutGrid } from "lucide-react";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Kanban</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm animate-slide-up">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
