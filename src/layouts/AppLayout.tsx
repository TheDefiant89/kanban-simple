import { Link, Outlet, useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, Moon, Settings, Sun, SunMoon } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { signOut } from "@/services/auth";
import { useThemeStore } from "@/store/theme-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NeonBackdrop } from "@/components/shared/neon-backdrop";
import { toast } from "sonner";

export function AppLayout() {
  const { user } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out");
      navigate("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign out");
    }
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "??";

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-transparent text-muted-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--foreground)_9%,transparent)] hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      <NeonBackdrop />
      <header
        className="sticky top-0 z-40 flex h-[58px] items-center gap-3 border-b px-4 backdrop-blur-[14px]"
        style={{ background: "var(--hdr)" }}
      >
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="bg-accent-grad neon flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <span className="font-display hidden text-[16px] font-semibold sm:inline">
            Kanban<span style={{ color: "var(--accent-solid)" }}>.</span> Simple
            <span style={{ color: "var(--accent-solid)" }}>.</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={iconBtn} aria-label="Toggle theme">
                {theme === "dark" ? (
                  <Moon className="h-4 w-4" />
                ) : theme === "light" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <SunMoon className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun className="h-4 w-4" /> Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon className="h-4 w-4" /> Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <SunMoon className="h-4 w-4" /> System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/settings" className={iconBtn} aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
                <Avatar className="h-[34px] w-[34px]">
                  <AvatarFallback className="bg-accent-grad text-[13px] font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="truncate max-w-48">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
