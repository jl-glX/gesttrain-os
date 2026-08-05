import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, CircleDashed, CircleDot, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";

type CapabilityStatus = "implemented" | "partial" | "prepared" | "missing";

interface Capability {
  id: string;
  area: string;
  status: CapabilityStatus;
  current: string;
  gap: string;
  evidence: string[];
  marketReference: string;
  priority: "critical" | "high" | "medium" | "low";
  destination: string | null;
}

interface Roadmap {
  comparisonBasis: string;
  caveat: string;
  summary: Record<CapabilityStatus, number>;
  capabilities: Capability[];
}

const statusStyles: Record<CapabilityStatus, string> = {
  implemented: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  prepared: "bg-blue-100 text-blue-800",
  missing: "bg-rose-100 text-rose-800",
};

const statusIcons = {
  implemented: CircleCheck,
  partial: CircleDot,
  prepared: CircleDashed,
  missing: CircleX,
};

export function CapabilityRoadmapPage() {
  const { t } = useTranslation();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void authFetch("/api/admin/capability-roadmap")
      .then(async (response) => {
        if (!response.ok) throw new Error(t("capabilityRoadmap.loadError"));
        setRoadmap((await response.json()) as Roadmap);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("capabilityRoadmap.loadError"),
        ),
      );
  }, [t]);

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto w-full max-w-[96rem]">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
          {t("capabilityRoadmap.eyebrow")}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          {t("capabilityRoadmap.title")}
        </h1>
        <p className="mt-3 max-w-4xl leading-7 text-slate-600">
          {t("capabilityRoadmap.description")}
        </p>
        {error && <p className="mt-6 text-red-700">{error}</p>}
        {roadmap && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-4">
              {(Object.keys(roadmap.summary) as CapabilityStatus[]).map(
                (status) => (
                  <div
                    key={status}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <p className="text-sm text-slate-500">
                      {t(`capabilityRoadmap.status.${status}`)}
                    </p>
                    <p className="mt-1 text-3xl font-bold">
                      {roadmap.summary[status]}
                    </p>
                  </div>
                ),
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
              <p>{roadmap.comparisonBasis}</p>
              <p className="mt-2 font-medium">{roadmap.caveat}</p>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {roadmap.capabilities.map((capability) => {
                const Icon = statusIcons[capability.status];
                return (
                  <article
                    key={capability.id}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Icon size={22} className="text-blue-600" />
                      <h2 className="text-lg font-bold">{capability.area}</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[capability.status]}`}
                      >
                        {t(`capabilityRoadmap.status.${capability.status}`)}
                      </span>
                    </div>
                    <h3 className="mt-5 text-sm font-bold text-slate-500">
                      {t("capabilityRoadmap.current")}
                    </h3>
                    <p className="mt-1 leading-6">{capability.current}</p>
                    <h3 className="mt-4 text-sm font-bold text-slate-500">
                      {t("capabilityRoadmap.gap")}
                    </h3>
                    <p className="mt-1 leading-6">{capability.gap}</p>
                    <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      {capability.marketReference}
                    </p>
                    <details className="mt-4 text-sm text-slate-600">
                      <summary className="cursor-pointer font-semibold">
                        {t("capabilityRoadmap.evidence")}
                      </summary>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {capability.evidence.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                    {capability.destination && (
                      <Link
                        to={capability.destination}
                        className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        {t("capabilityRoadmap.openDestination")}
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
