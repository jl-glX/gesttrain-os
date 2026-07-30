import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";
import { Button } from "./ui/button";

interface SupportIdentifierResponse {
  supportIdentifier: {
    publicId: string;
    createdAt: number;
  };
}

const MASKED_SUPPORT_ID = "GT-U-••••-••••-••••";

export function AccountSupportIdentifier() {
  const { t } = useTranslation();
  const [supportId, setSupportId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    authFetch("/api/account/identity")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load support identifier");
        return (await response.json()) as SupportIdentifierResponse;
      })
      .then((data) => {
        if (active) setSupportId(data.supportIdentifier.publicId);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const copySupportId = async () => {
    if (!supportId) return;
    await navigator.clipboard.writeText(supportId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
            <Fingerprint />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">
              {t("accountIdentity.eyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {t("accountIdentity.title")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {t("accountIdentity.description")}
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:min-w-[24rem]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("accountIdentity.label")}
          </p>
          {error ? (
            <p className="mt-2 text-sm font-semibold text-red-700">
              {t("accountIdentity.loadError")}
            </p>
          ) : (
            <>
              <p
                className="mt-2 break-all font-mono text-lg font-bold tracking-wide text-slate-950"
                aria-live="polite"
              >
                {visible && supportId
                  ? supportId
                  : supportId
                    ? MASKED_SUPPORT_ID
                    : t("common.loading")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!supportId}
                  onClick={() => setVisible((current) => !current)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  {visible
                    ? t("accountIdentity.hide")
                    : t("accountIdentity.show")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!supportId}
                  onClick={() => void copySupportId()}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied
                    ? t("accountIdentity.copied")
                    : t("accountIdentity.copy")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        {t("accountIdentity.securityNotice")}
      </p>
    </section>
  );
}
