import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const label = resolved === "dark" ? "切换到浅色模式" : "切换到深色模式";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      title={label}
      aria-label={label}
    >
      {resolved === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}
