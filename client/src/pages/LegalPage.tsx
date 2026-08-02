import { ArrowLeft, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { LegalFooter } from "../components/LegalFooter";
import { BrandLogo } from "../components/BrandLogo";

type LegalPageKind = "notice" | "terms" | "use";

interface LegalPageProps {
  kind: LegalPageKind;
}

const sectionIds: Record<LegalPageKind, string[]> = {
  notice: [
    "owner",
    "purpose",
    "intellectualProperty",
    "links",
    "liability",
    "identityAndData",
    "law",
  ],
  terms: [
    "scope",
    "accounts",
    "bookings",
    "payments",
    "cancellations",
    "lifecycle",
    "representation",
    "retention",
    "changes",
    "law",
  ],
  use: [
    "access",
    "acceptableUse",
    "bookings",
    "community",
    "health",
    "availability",
    "verification",
    "accountRecovery",
    "dataRequests",
    "suspension",
  ],
};

function LegalPage({ kind }: LegalPageProps) {
  const { t } = useTranslation();
  const baseKey = `legal.pages.${kind}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            className="flex items-center gap-3 font-bold tracking-tight"
            to="/"
          >
            <BrandLogo className="h-11 w-11 rounded-xl shadow-lg shadow-blue-600/20" />
            <span className="text-xl">GestTrain/OS</span>
          </Link>
          <LanguageSwitcher compact />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-500"
          to="/"
        >
          <ArrowLeft size={16} />
          {t("legal.back")}
        </Link>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <FileText size={24} />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
            {t("legal.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t(`${baseKey}.title`)}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {t("legal.lastUpdated")}
          </p>

          <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
            <strong>{t("legal.draftTitle")}</strong>{" "}
            {t("legal.draftDescription")}
          </div>

          <p className="mt-8 leading-7 text-slate-700">
            {t(`${baseKey}.introduction`)}
          </p>

          <div className="mt-10 space-y-9">
            {sectionIds[kind].map((sectionId) => (
              <section key={sectionId}>
                <h2 className="text-xl font-semibold text-slate-950">
                  {t(`${baseKey}.sections.${sectionId}.title`)}
                </h2>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">
                  {t(`${baseKey}.sections.${sectionId}.body`)}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>

      <LegalFooter variant="light" />
    </div>
  );
}

export function LegalNoticePage() {
  return <LegalPage kind="notice" />;
}

export function TermsAndConditionsPage() {
  return <LegalPage kind="terms" />;
}

export function ConditionsOfUsePage() {
  return <LegalPage kind="use" />;
}
