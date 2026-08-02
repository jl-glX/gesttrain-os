import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Clock3,
  DatabaseZap,
  Gauge,
  MemoryStick,
  Pause,
  Play,
  RefreshCw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFetch } from "../lib/api";
import { Button } from "../components/ui/button";

interface ManagedTask {
  id: string;
  name: string;
  description: string;
  intervalMs: number;
  priority: "critical" | "normal" | "low";
  enabled: boolean;
  state: "idle" | "running" | "paused" | "error";
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastDurationMs: number | null;
  lastResultCount: number | null;
  lastSummary: string | null;
  lastFindings: string[];
  runCount: number;
  errorCount: number;
  lastError: string | null;
}

interface ResourceManagerStatus {
  started: boolean;
  process: {
    uptimeSeconds: number;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
    nodeVersion: string;
    pid: number;
  };
  residualProcessChecks: {
    totalChecks: number;
    staleRecordsRemoved: number;
    lastCheck: {
      phase: "manager-start" | "task-start" | "task-finish" | "manager-stop";
      taskId: string | null;
      checkedAt: number;
      staleRecordsRemoved: number;
    } | null;
  };
  tasks: ManagedTask[];
}

function formatBytes(bytes: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function ResourceManagerPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ResourceManagerStatus | null>(null);
  const [error, setError] = useState("");
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const loadStatus = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    try {
      const response = await authFetch("/api/admin/resource-manager");
      if (!response.ok) throw new Error(t("resourceManager.loadError"));
      const result = (await response.json()) as ResourceManagerStatus;
      if (requestSequence.current === requestId) {
        setStatus(result);
        setError("");
      }
    } catch (loadError) {
      if (requestSequence.current === requestId) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("resourceManager.loadError"),
        );
      }
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadStatus();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [loadStatus]);

  const updateTask = async (task: ManagedTask, action: "toggle" | "run") => {
    setBusyTask(task.id);
    setError("");
    try {
      const response = await authFetch(
        `/api/admin/resource-manager/tasks/${task.id}${action === "run" ? "/run" : ""}`,
        {
          method: action === "run" ? "POST" : "PATCH",
          headers:
            action === "toggle" ? { "Content-Type": "application/json" } : {},
          body:
            action === "toggle"
              ? JSON.stringify({ enabled: !task.enabled })
              : undefined,
        },
      );
      if (!response.ok) throw new Error(t("resourceManager.updateError"));
      await loadStatus();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : t("resourceManager.updateError"),
      );
    } finally {
      setBusyTask(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto w-full max-w-[96rem]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              {t("resourceManager.eyebrow")}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              {t("resourceManager.title")}
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">
              {t("resourceManager.description")}
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadStatus()}>
            <RefreshCw size={17} />
            {t("common.refresh")}
          </Button>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!status ? (
          <p className="mt-10 text-slate-500">{t("common.loading")}</p>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: MemoryStick,
                  label: t("resourceManager.memory"),
                  value: `${formatBytes(status.process.memory.heapUsedBytes)} MB`,
                },
                {
                  icon: Gauge,
                  label: t("resourceManager.heapCapacity"),
                  value: `${formatBytes(status.process.memory.heapTotalBytes)} MB`,
                },
                {
                  icon: Clock3,
                  label: t("resourceManager.uptime"),
                  value: formatDuration(status.process.uptimeSeconds),
                },
                {
                  icon: Activity,
                  label: t("resourceManager.enabledTasks"),
                  value: String(
                    status.tasks.filter((task) => task.enabled).length,
                  ),
                },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <Icon className="text-blue-600" size={22} />
                  <p className="mt-4 text-sm font-medium text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" />
                <div>
                  <p className="font-bold">
                    {t("resourceManager.residualChecksTitle")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-emerald-800">
                    {t("resourceManager.residualChecksSummary", {
                      checks: status.residualProcessChecks.totalChecks,
                      removed: status.residualProcessChecks.staleRecordsRemoved,
                    })}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-medium text-emerald-800">
                {status.residualProcessChecks.lastCheck
                  ? t("resourceManager.lastResidualCheck", {
                      date: new Intl.DateTimeFormat(undefined, {
                        dateStyle: "short",
                        timeStyle: "medium",
                      }).format(
                        status.residualProcessChecks.lastCheck.checkedAt,
                      ),
                    })
                  : t("resourceManager.noResidualCheck")}
              </p>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <ServerCog className="text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold">
                    {t("resourceManager.managedTasks")}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t("resourceManager.scopeNotice")}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                {status.tasks.map((task) => (
                  <article
                    key={task.id}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <DatabaseZap size={20} className="text-blue-600" />
                          <h3 className="font-bold">
                            {t(`resourceManager.tasks.${task.id}.name`, {
                              defaultValue: task.name,
                            })}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              task.enabled
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {t(`resourceManager.states.${task.state}`)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {t(`resourceManager.tasks.${task.id}.description`, {
                            defaultValue: task.description,
                          })}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {t("resourceManager.taskStats", {
                            runs: task.runCount,
                            duration: task.lastDurationMs ?? 0,
                            result: task.lastResultCount ?? 0,
                          })}
                        </p>
                        {task.lastSummary && (
                          <p className="mt-2 text-sm text-slate-600">
                            {task.lastSummary}
                          </p>
                        )}
                        {task.lastFindings.length > 0 && (
                          <details className="mt-3 text-sm text-amber-800">
                            <summary className="cursor-pointer font-semibold">
                              {t("resourceManager.reviewFindings", {
                                count: task.lastFindings.length,
                              })}
                            </summary>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {task.lastFindings.map((finding) => (
                                <li key={finding}>{finding}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {task.lastError && (
                          <p className="mt-2 text-sm text-red-600">
                            {task.lastError}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={
                            busyTask === task.id || task.state === "running"
                          }
                          onClick={() => void updateTask(task, "run")}
                        >
                          <Play size={16} />
                          {t("resourceManager.runNow")}
                        </Button>
                        <Button
                          variant={task.enabled ? "destructive" : "default"}
                          disabled={
                            busyTask === task.id ||
                            task.state === "running" ||
                            (task.priority === "critical" && task.enabled)
                          }
                          onClick={() => void updateTask(task, "toggle")}
                        >
                          {task.enabled ? (
                            <Pause size={16} />
                          ) : (
                            <Play size={16} />
                          )}
                          {task.enabled
                            ? t("resourceManager.pause")
                            : t("resourceManager.resume")}
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
