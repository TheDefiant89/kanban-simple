import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useThemeStore } from "@/store/theme-store";

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeStore((s) => s.theme);

  return (
    <Sonner
      theme={theme === "system" ? "system" : theme}
      className="toaster group"
      position="bottom-right"
      // Keep toasts above the iOS home indicator / clear of the notch.
      offset={{
        bottom: "calc(24px + env(safe-area-inset-bottom))",
        right: "calc(24px + env(safe-area-inset-right))",
      }}
      mobileOffset={{
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        left: "calc(16px + env(safe-area-inset-left))",
        right: "calc(16px + env(safe-area-inset-right))",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
