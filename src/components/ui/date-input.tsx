import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Native date input with a themed calendar icon.
 *
 * Browsers draw their own picker icon, which ignores the app theme (near
 * black on the dark surface in Chromium) and doesn't exist at all on iOS.
 * We draw a lucide icon on top instead. In Chromium the native indicator is
 * made invisible and stretched under our icon (see `.date-input` in
 * globals.css), so clicking the icon still opens the picker; on iOS the whole
 * field opens the picker, and clicks pass through the icon. Firefox keeps its
 * own icon, which follows `color-scheme`, so ours is hidden there.
 */
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <Input ref={ref} type="date" className="date-input pr-9" {...props} />
      <CalendarDays
        aria-hidden="true"
        className="date-input-icon pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
);
DateInput.displayName = "DateInput";

export { DateInput };
