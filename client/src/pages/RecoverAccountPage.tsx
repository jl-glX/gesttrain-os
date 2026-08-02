import {
  Fingerprint,
  KeyRound,
  LifeBuoy,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/button";
import { useEffect, useState } from "react";

type RecoveryMethod = {
  id: "password" | "email" | "code" | "passkey" | "support";
  status: "available" | "planned";
  entryPoint: "/login" | null;
  requiresCompletedVerification: true;
  canCancelPendingDeletion: boolean;
};

const methodIcons = {
  password: KeyRound,
  email: Mail,
  code: KeyRound,
  passkey: Fingerprint,
  support: LifeBuoy,
};

const API_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "";

export function RecoverAccountPage() {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<RecoveryMethod[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/recovery/capabilities`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Recovery capabilities unavailable");
        return (await response.json()) as { methods: RecoveryMethod[] };
      })
      .then((payload) => setMethods(payload.methods))
      .catch(() => setMethods([]));
  }, []);

  return (
    <AuthShell
      eyebrow={t("recovery.eyebrow")}
      title={t("recovery.title")}
      description={t("recovery.description")}
    >
      <div className="space-y-3">
        {methods.map(({ id, status }) => {
          const Icon = methodIcons[id];
          const available = status === "available";
          return (
            <article
              key={id}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4"
            >
              <Icon className="mt-0.5 shrink-0 text-blue-600" size={20} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-slate-950">
                    {t(`recovery.methods.${id}.title`)}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                    {available
                      ? t("recovery.available")
                      : t("recovery.planned")}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t(`recovery.methods.${id}.description`)}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="flex gap-2 font-semibold">
          <ShieldCheck size={18} /> {t("recovery.securityTitle")}
        </div>
        <p className="mt-1">{t("recovery.securityNotice")}</p>
      </div>

      <Button asChild className="mt-5 w-full">
        <Link to="/login">{t("recovery.returnToLogin")}</Link>
      </Button>
    </AuthShell>
  );
}
