import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@jeomwon/ui/select";
import { cn } from "@jeomwon/ui/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useScopedI18n } from "@/locales/client";

export function ThemeSwitcher({ triggerClass }: { triggerClass?: string }) {
  const t = useScopedI18n("navigation");
  const { theme: currentTheme, setTheme, themes } = useTheme();

  function formatTheme(theme: string | undefined) {
    if (theme === "light") {
      return t("themeOptions.light");
    }
    if (theme === "dark") {
      return t("themeOptions.dark");
    }
    return t("themeOptions.system");
  }

  return (
    <Select
      value={currentTheme}
      onValueChange={(theme) => setTheme(theme as (typeof themes)[number])}
    >
      <SelectTrigger
        className={cn(
          "h-6 rounded border-border bg-muted !px-2 hover:border-primary/40",
          triggerClass,
        )}
      >
        <div className="flex items-start gap-2">
          {currentTheme === "light" ? (
            <Sun className="h-[14px] w-[14px]" />
          ) : currentTheme === "dark" ? (
            <Moon className="h-[14px] w-[14px]" />
          ) : (
            <Monitor className="h-[14px] w-[14px]" />
          )}
          {currentTheme && (
            <span className="font-medium text-xs">
              {formatTheme(currentTheme)}
            </span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent>
        {themes.map((theme) => (
          <SelectItem
            key={theme}
            value={theme}
            className={`font-medium text-muted-foreground text-sm ${theme === currentTheme && "text-foreground"}`}
          >
            {formatTheme(theme)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ThemeSwitcherHome() {
  const { setTheme, themes } = useTheme();
  return (
    <div className="flex gap-3">
      {themes.map((theme) => (
        <button
          key={theme}
          name="theme"
          onClick={() => setTheme(theme)}
          type="button"
        >
          {theme === "light" ? (
            <Sun className="h-4 w-4 text-primary/80 hover:text-primary" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4 text-primary/80 hover:text-primary" />
          ) : (
            <Monitor className="h-4 w-4 text-primary/80 hover:text-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
