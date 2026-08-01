const TURNSTILE_LANGUAGES = new Set(["de", "en", "es"]);

export function turnstileLanguage(language: string | undefined): string {
  const baseLanguage = language?.replace("_", "-").split("-")[0].toLowerCase();
  return baseLanguage && TURNSTILE_LANGUAGES.has(baseLanguage)
    ? baseLanguage
    : "auto";
}
