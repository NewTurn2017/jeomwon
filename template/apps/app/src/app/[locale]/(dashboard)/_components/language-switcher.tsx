"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@jeomwon/ui/select";
import { Languages } from "lucide-react";
import { useChangeLocale, useCurrentLocale } from "@/locales/client";

export function LanguageSwitcher() {
  const changeLocale = useChangeLocale();
  const locale = useCurrentLocale();

  const langs = [
    { text: "한국어", value: "ko" },
    { text: "English", value: "en" },
    { text: "Français", value: "fr" },
    { text: "Español", value: "es" },
  ];
  const formatLanguage = (lng: string) => {
    return langs.find((lang) => lang.value === lng)?.text;
  };

  return (
    <Select value={locale} onValueChange={changeLocale}>
      <SelectTrigger className="h-6 rounded border-border bg-muted !px-2 hover:border-primary/40">
        <div className="flex items-start gap-2">
          <Languages className="h-[14px] w-[14px]" />
          <span className="text-xs font-medium">{formatLanguage(locale)}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {langs.map(({ text, value }) => (
          <SelectItem
            key={value}
            value={value}
            className="font-medium text-muted-foreground text-sm"
          >
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
