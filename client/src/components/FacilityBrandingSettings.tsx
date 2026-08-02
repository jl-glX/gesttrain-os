import { useEffect, useState } from "react";
import { Building2, ImagePlus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { VerifiedForm } from "./VerifiedForm";
import { useFacilityProfile } from "../hooks/useFacilityProfile";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const MAX_LOGO_BYTES = 512 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function FacilityBrandingSettings() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useFacilityProfile();
  const [name, setName] = useState(profile.name);
  const [accentColor, setAccentColor] = useState(profile.accentColor);
  const [logoDataUrl, setLogoDataUrl] = useState(profile.logoDataUrl);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile.name);
    setAccentColor(profile.accentColor);
    setLogoDataUrl(profile.logoDataUrl);
  }, [profile]);

  const readLogo = async (file: File) => {
    setSaved(false);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError(t("facilityBranding.invalidType"));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t("facilityBranding.tooLarge"));
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setLogoDataUrl(dataUrl);
    setError("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ name, accentColor, logoDataUrl });
      setError("");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <VerifiedForm
      className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]"
      onSubmit={save}
    >
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          {t("facilityBranding.preview")}
        </p>
        <div
          className="mt-5 rounded-2xl border bg-white p-6 shadow-sm"
          style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
        >
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt={t("facilityBranding.logoAlt", { gym: name })}
              className="h-24 w-24 rounded-2xl object-contain"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl text-white"
              style={{ backgroundColor: accentColor }}
            >
              <Building2 size={38} />
            </div>
          )}
          <h2 className="mt-5 text-2xl font-bold text-slate-950">
            {name || t("facilityBranding.unnamed")}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {t("facilityBranding.previewDescription")}
          </p>
        </div>
      </section>

      <section>
        <div>
          <h2 className="text-2xl font-bold text-slate-950">
            {t("facilityBranding.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {t("facilityBranding.description")}
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="facility-name">{t("facilityBranding.name")}</Label>
            <Input
              id="facility-name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="facility-accent">
              {t("facilityBranding.accent")}
            </Label>
            <div className="flex items-center gap-3">
              <input
                id="facility-accent"
                type="color"
                value={accentColor}
                onChange={(event) => {
                  setAccentColor(event.target.value);
                  setSaved(false);
                }}
                className="h-11 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
              <Input
                aria-label={t("facilityBranding.accent")}
                pattern="#[0-9A-Fa-f]{6}"
                value={accentColor}
                onChange={(event) => {
                  setAccentColor(event.target.value);
                  setSaved(false);
                }}
                className="max-w-40 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="facility-logo">{t("facilityBranding.logo")}</Label>
            <Input
              id="facility-logo"
              type="file"
              accept={ALLOWED_LOGO_TYPES.join(",")}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readLogo(file);
                event.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500">
              {t("facilityBranding.logoHelp")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" asChild>
                <label htmlFor="facility-logo" className="cursor-pointer">
                  <ImagePlus /> {t("facilityBranding.chooseLogo")}
                </label>
              </Button>
              {logoDataUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLogoDataUrl("");
                    setSaved(false);
                  }}
                >
                  <Trash2 /> {t("facilityBranding.removeLogo")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {saved && (
          <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {t("facilityBranding.saved")}
          </p>
        )}

        <Button type="submit" className="mt-6" disabled={saving}>
          <Save />
          {saving ? t("facilityBranding.saving") : t("facilityBranding.save")}
        </Button>
      </section>
    </VerifiedForm>
  );
}
