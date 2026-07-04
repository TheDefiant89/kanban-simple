import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ColorPicker({
  value,
  onChange,
  colors,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  colors: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Choose color ${color}`}
          className="flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        >
          {value.toLowerCase() === color.toLowerCase() && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
