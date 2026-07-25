import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LanguageSwitcherProps {
  compact?: boolean;
  inverted?: boolean;
}

export function LanguageSwitcher({
  compact = false,
  inverted = false,
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const resolvedLanguage = i18n.resolvedLanguage ?? "es";
  const language = resolvedLanguage.toLowerCase().startsWith("de-ch")
    ? "de-CH"
    : resolvedLanguage.split("-")[0];

  return (
    <label
      className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${inverted ? "bg-white/8 text-white ring-1 ring-white/10" : "bg-slate-100 text-slate-700"}`}
    >
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={language}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className={`cursor-pointer bg-transparent font-semibold outline-none ${compact ? "w-10" : "w-auto"} ${inverted ? "text-white [&>option]:text-slate-900" : "text-slate-700"}`}
      >
        <option value="es">{compact ? "ES" : t("language.es")}</option>
        <option value="en">{compact ? "EN" : t("language.en")}</option>
        <option value="de">{compact ? "DE" : t("language.de")}</option>
        <option value="de-CH">{compact ? "CH" : t("language.deCH")}</option>
      </select>
    </label>
  );
}
