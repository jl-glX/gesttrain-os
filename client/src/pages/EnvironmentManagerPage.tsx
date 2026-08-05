import { useCallback, useEffect, useState } from "react";
import { Database, DatabaseZap, Plus, RefreshCw, Route } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";
import { Button } from "../components/ui/button";

interface ManagedEnvironment {
  id: string;
  slug: string;
  name: string;
  kind: "commercial_mvp" | "customer_sandbox";
  status:
    "ready" | "migration_review" | "migration_ready" | "migration_blocked";
  locale: string;
  templateKey: string;
  createdAt: number;
  updatedAt: number;
}

interface EnvironmentManagerOverview {
  activeDatabase: "sqlite" | "postgresql";
  primaryDatabase: "postgresql";
  deploymentProfile: string;
  mutationsEnabled: boolean;
  postgresqlTargetConfigured: boolean;
  migrationExecutionEnabled: false;
  migrationMode: "review-first";
  environments: ManagedEnvironment[];
}

interface MigrationPlan {
  ready: boolean;
  totalRows: number;
  containsSensitiveData: boolean;
  missingTables: string[];
  safeguards: string[];
  excludedByDefault: string[];
}

export function EnvironmentManagerPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<EnvironmentManagerOverview | null>(
    null,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] =
    useState<ManagedEnvironment["kind"]>("customer_sandbox");
  const [plans, setPlans] = useState<Record<string, MigrationPlan>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await authFetch("/api/admin/environment-manager");
    if (!response.ok) throw new Error(t("environmentManager.loadError"));
    setOverview((await response.json()) as EnvironmentManagerOverview);
  }, [t]);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("environmentManager.loadError"),
      );
    });
  }, [load, t]);

  const createEnvironment = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      const response = await authFetch(
        "/api/admin/environment-manager/environments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slug, kind, locale: "es" }),
        },
      );
      if (!response.ok) throw new Error(t("environmentManager.createError"));
      setName("");
      setSlug("");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("environmentManager.createError"),
      );
    } finally {
      setBusy("");
    }
  };

  const prepareMigration = async (environment: ManagedEnvironment) => {
    setBusy(environment.id);
    setError("");
    try {
      const response = await authFetch(
        `/api/admin/environment-manager/environments/${environment.id}/migration-plan`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(t("environmentManager.planError"));
      const result = (await response.json()) as { plan: MigrationPlan };
      setPlans((current) => ({ ...current, [environment.id]: result.plan }));
      await load();
    } catch (planError) {
      setError(
        planError instanceof Error
          ? planError.message
          : t("environmentManager.planError"),
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto w-full max-w-[96rem]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              {t("environmentManager.eyebrow")}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              {t("environmentManager.title")}
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">
              {t("environmentManager.description")}
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw size={17} /> {t("common.refresh")}
          </Button>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {overview && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Database className="text-blue-600" />
                <p className="mt-3 text-sm text-slate-500">
                  {t("environmentManager.activeEngine")}
                </p>
                <p className="text-xl font-bold">{overview.activeDatabase}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <DatabaseZap className="text-blue-600" />
                <p className="mt-3 text-sm text-slate-500">
                  {t("environmentManager.primaryEngine")}
                </p>
                <p className="text-xl font-bold">{overview.primaryDatabase}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Route className="text-blue-600" />
                <p className="mt-3 text-sm text-slate-500">
                  {t("environmentManager.migrationMode")}
                </p>
                <p className="text-xl font-bold">
                  {t("environmentManager.reviewFirst")}
                </p>
              </article>
            </div>

            <form
              onSubmit={createEnvironment}
              className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
            >
              <div className="flex items-center gap-3">
                <Plus className="text-blue-600" />
                <h2 className="text-xl font-bold">
                  {t("environmentManager.createTitle")}
                </h2>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 font-medium">
                  {t("environmentManager.name")}
                  <input
                    className="rounded-xl border border-slate-300 px-4 py-3"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-2 font-medium">
                  {t("environmentManager.slug")}
                  <input
                    className="rounded-xl border border-slate-300 px-4 py-3"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="centro-demo"
                    required
                  />
                </label>
                <label className="grid gap-2 font-medium">
                  {t("environmentManager.kind")}
                  <select
                    className="rounded-xl border border-slate-300 px-4 py-3"
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as ManagedEnvironment["kind"])
                    }
                  >
                    <option value="customer_sandbox">
                      {t("environmentManager.customerSandbox")}
                    </option>
                    <option value="commercial_mvp">
                      {t("environmentManager.commercialMvp")}
                    </option>
                  </select>
                </label>
              </div>
              {!overview.mutationsEnabled && (
                <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  {t("environmentManager.mutationsDisabled")}
                </p>
              )}
              <Button
                className="mt-5"
                disabled={busy === "create" || !overview.mutationsEnabled}
              >
                {t("environmentManager.create")}
              </Button>
            </form>

            <div className="mt-8 grid gap-4">
              {overview.environments.map((environment) => {
                const plan = plans[environment.id];
                return (
                  <article
                    key={environment.id}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-bold">
                          {environment.name}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {environment.slug} ·{" "}
                          {environment.kind === "customer_sandbox"
                            ? t("environmentManager.customerSandbox")
                            : t("environmentManager.commercialMvp")}{" "}
                          ·{" "}
                          {t(`environmentManager.status.${environment.status}`)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={busy === environment.id}
                        onClick={() => void prepareMigration(environment)}
                      >
                        {t("environmentManager.prepareMigration")}
                      </Button>
                    </div>
                    {plan && (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                        <p className="font-bold">
                          {t("environmentManager.planSummary", {
                            rows: plan.totalRows,
                          })}
                        </p>
                        <p className="mt-1">
                          {plan.containsSensitiveData
                            ? t("environmentManager.sensitiveReview")
                            : t("environmentManager.noSensitiveData")}
                        </p>
                        <p className="mt-2">
                          {t("environmentManager.executionDisabled")}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
              {overview.environments.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  {t("environmentManager.empty")}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
