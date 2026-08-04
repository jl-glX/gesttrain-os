import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Expand,
  Minimize,
  Pause,
  Play,
  RefreshCcw,
  TimerReset,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type TimerMode = "amrap" | "forTime" | "emom" | "tabata";
type TimerStatus = "setup" | "running" | "paused" | "complete";

interface TimerSettings {
  amrapMinutes: number;
  forTimeCapMinutes: number;
  emomIntervalMinutes: number;
  emomRounds: number;
  tabataRounds: number;
  tabataWorkSeconds: number;
  tabataRestSeconds: number;
  soundEnabled: boolean;
}

const STORAGE_KEY = "umbravia-forge.workout-timer.v1";
const DEFAULT_SETTINGS: TimerSettings = {
  amrapMinutes: 10,
  forTimeCapMinutes: 20,
  emomIntervalMinutes: 1,
  emomRounds: 10,
  tabataRounds: 8,
  tabataWorkSeconds: 20,
  tabataRestSeconds: 10,
  soundEnabled: true,
};

const MODES: TimerMode[] = ["amrap", "forTime", "emom", "tabata"];

function readSettings(): TimerSettings {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(saved) as TimerSettings) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function formatDuration(milliseconds: number) {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playTone(frequency = 880, duration = 0.16) {
  const AudioContextClass =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
  oscillator.addEventListener("ended", () => void context.close());
}

export function WorkoutTimerPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TimerMode>("amrap");
  const [settings, setSettings] = useState<TimerSettings>(readSettings);
  const [status, setStatus] = useState<TimerStatus>("setup");
  const [elapsedBeforeRun, setElapsedBeforeRun] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const startedAt = useRef<number | null>(null);
  const lastInterval = useRef(0);

  const totalDuration = useMemo(() => {
    if (mode === "amrap") return settings.amrapMinutes * 60_000;
    if (mode === "forTime") return settings.forTimeCapMinutes * 60_000;
    if (mode === "emom") {
      return settings.emomIntervalMinutes * settings.emomRounds * 60_000;
    }
    return (
      settings.tabataRounds * settings.tabataWorkSeconds * 1000 +
      Math.max(0, settings.tabataRounds - 1) * settings.tabataRestSeconds * 1000
    );
  }, [mode, settings]);

  const updateSetting = <Key extends keyof TimerSettings>(
    key: Key,
    value: TimerSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setImmersiveMode(document.fullscreenElement === pageRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!immersiveMode) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setImmersiveMode(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [immersiveMode]);

  const finish = useCallback(
    (finalElapsed: number) => {
      startedAt.current = null;
      setElapsedBeforeRun(finalElapsed);
      setElapsed(finalElapsed);
      setStatus("complete");
      if (settings.soundEnabled) {
        playTone(1046, 0.35);
        window.setTimeout(() => playTone(1318, 0.4), 220);
      }
    },
    [settings.soundEnabled],
  );

  useEffect(() => {
    if (status !== "running") return;

    const timerId = window.setInterval(() => {
      if (startedAt.current === null) return;
      const nextElapsed = Math.min(
        totalDuration,
        elapsedBeforeRun + Date.now() - startedAt.current,
      );
      setElapsed(nextElapsed);

      const cue =
        mode === "emom"
          ? Math.floor(nextElapsed / (settings.emomIntervalMinutes * 60_000))
          : mode === "tabata"
            ? Math.floor(
                nextElapsed /
                  ((settings.tabataWorkSeconds + settings.tabataRestSeconds) *
                    1000),
              ) *
                2 +
              (nextElapsed %
                ((settings.tabataWorkSeconds + settings.tabataRestSeconds) *
                  1000) >=
              settings.tabataWorkSeconds * 1000
                ? 1
                : 0)
            : 0;
      if (cue > lastInterval.current && nextElapsed < totalDuration) {
        lastInterval.current = cue;
        if (settings.soundEnabled) playTone();
      }

      if (nextElapsed >= totalDuration) finish(totalDuration);
    }, 100);

    return () => window.clearInterval(timerId);
  }, [
    elapsedBeforeRun,
    finish,
    mode,
    settings.emomIntervalMinutes,
    settings.soundEnabled,
    settings.tabataRestSeconds,
    settings.tabataWorkSeconds,
    status,
    totalDuration,
  ]);

  const start = () => {
    startedAt.current = Date.now();
    lastInterval.current = 0;
    setElapsed(0);
    setElapsedBeforeRun(0);
    setRoundsCompleted(0);
    setStatus("running");
    if (settings.soundEnabled) playTone(660);
  };

  const pause = () => {
    if (startedAt.current === null) return;
    const nextElapsed = Math.min(
      totalDuration,
      elapsedBeforeRun + Date.now() - startedAt.current,
    );
    startedAt.current = null;
    setElapsed(nextElapsed);
    setElapsedBeforeRun(nextElapsed);
    setStatus("paused");
  };

  const resume = () => {
    startedAt.current = Date.now();
    setStatus("running");
  };

  const reset = () => {
    startedAt.current = null;
    lastInterval.current = 0;
    setElapsed(0);
    setElapsedBeforeRun(0);
    setRoundsCompleted(0);
    setStatus("setup");
  };

  const toggleFullscreen = async () => {
    const page = pageRef.current;
    if (!page) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (immersiveMode) {
      setImmersiveMode(false);
      return;
    }

    setImmersiveMode(true);
    try {
      await page.requestFullscreen();
    } catch {
      // Keep the CSS-based immersive mode when an embedded browser blocks
      // the native Fullscreen API.
    }
  };

  const timeDisplay =
    mode === "forTime"
      ? formatDuration(elapsed)
      : formatDuration(totalDuration - elapsed);

  const currentRound =
    mode === "emom"
      ? Math.min(
          settings.emomRounds,
          Math.floor(elapsed / (settings.emomIntervalMinutes * 60_000)) + 1,
        )
      : mode === "tabata"
        ? Math.min(
            settings.tabataRounds,
            Math.floor(
              elapsed /
                ((settings.tabataWorkSeconds + settings.tabataRestSeconds) *
                  1000),
            ) + 1,
          )
        : null;

  const tabataCycleElapsed =
    elapsed %
    ((settings.tabataWorkSeconds + settings.tabataRestSeconds) * 1000);
  const tabataPhase =
    tabataCycleElapsed < settings.tabataWorkSeconds * 1000 ? "work" : "rest";

  return (
    <main
      ref={pageRef}
      className={`bg-slate-950 px-4 py-8 text-white sm:px-6 ${
        immersiveMode
          ? "fixed inset-0 z-[100] min-h-screen overflow-y-auto"
          : "min-h-[calc(100vh-4.5rem)]"
      }`}
    >
      <div
        className={`mx-auto w-full ${
          immersiveMode ? "max-w-none" : "max-w-[96rem]"
        }`}
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
              {t("workoutTimer.eyebrow")}
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">
              {t("workoutTimer.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              {t("workoutTimer.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-pressed={immersiveMode}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold hover:bg-slate-800"
          >
            {immersiveMode ? <Minimize size={18} /> : <Expand size={18} />}
            {t(
              immersiveMode
                ? "workoutTimer.exitFullscreen"
                : "workoutTimer.fullscreen",
            )}
          </button>
        </header>

        {status === "setup" ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-bold">
                {t("workoutTimer.chooseMode")}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {MODES.map((candidate) => (
                  <button
                    type="button"
                    key={candidate}
                    onClick={() => setMode(candidate)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      mode === candidate
                        ? "border-cyan-300 bg-cyan-300 text-slate-950"
                        : "border-slate-700 bg-slate-950 hover:border-slate-500"
                    }`}
                  >
                    <span className="font-black">
                      {t(`workoutTimer.modes.${candidate}.name`)}
                    </span>
                    <span className="mt-1 block text-sm opacity-80">
                      {t(`workoutTimer.modes.${candidate}.description`)}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <TimerReset className="text-cyan-300" />
                <h2 className="text-xl font-black">
                  {t(`workoutTimer.modes.${mode}.name`)}
                </h2>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {mode === "amrap" && (
                  <NumberField
                    label={t("workoutTimer.minutes")}
                    value={settings.amrapMinutes}
                    minimum={1}
                    maximum={180}
                    onChange={(value) =>
                      updateSetting("amrapMinutes", clamp(value, 1, 180))
                    }
                  />
                )}
                {mode === "forTime" && (
                  <NumberField
                    label={t("workoutTimer.timeCap")}
                    value={settings.forTimeCapMinutes}
                    minimum={1}
                    maximum={360}
                    onChange={(value) =>
                      updateSetting("forTimeCapMinutes", clamp(value, 1, 360))
                    }
                  />
                )}
                {mode === "emom" && (
                  <>
                    <NumberField
                      label={t("workoutTimer.intervalMinutes")}
                      value={settings.emomIntervalMinutes}
                      minimum={1}
                      maximum={30}
                      onChange={(value) =>
                        updateSetting(
                          "emomIntervalMinutes",
                          clamp(value, 1, 30),
                        )
                      }
                    />
                    <NumberField
                      label={t("workoutTimer.rounds")}
                      value={settings.emomRounds}
                      minimum={1}
                      maximum={100}
                      onChange={(value) =>
                        updateSetting("emomRounds", clamp(value, 1, 100))
                      }
                    />
                  </>
                )}
                {mode === "tabata" && (
                  <>
                    <NumberField
                      label={t("workoutTimer.rounds")}
                      value={settings.tabataRounds}
                      minimum={1}
                      maximum={100}
                      onChange={(value) =>
                        updateSetting("tabataRounds", clamp(value, 1, 100))
                      }
                    />
                    <NumberField
                      label={t("workoutTimer.workSeconds")}
                      value={settings.tabataWorkSeconds}
                      minimum={5}
                      maximum={600}
                      onChange={(value) =>
                        updateSetting("tabataWorkSeconds", clamp(value, 5, 600))
                      }
                    />
                    <NumberField
                      label={t("workoutTimer.restSeconds")}
                      value={settings.tabataRestSeconds}
                      minimum={0}
                      maximum={600}
                      onChange={(value) =>
                        updateSetting("tabataRestSeconds", clamp(value, 0, 600))
                      }
                    />
                  </>
                )}
              </div>

              <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(event) =>
                    updateSetting("soundEnabled", event.target.checked)
                  }
                  className="h-5 w-5 accent-cyan-300"
                />
                <BellRing className="text-cyan-300" size={20} />
                <span>
                  <strong>{t("workoutTimer.sound")}</strong>
                  <span className="block text-sm text-slate-400">
                    {t("workoutTimer.soundHelp")}
                  </span>
                </span>
              </label>

              <button
                type="button"
                onClick={start}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-4 text-lg font-black text-slate-950 shadow-lg shadow-cyan-300/10 hover:bg-cyan-200"
              >
                <Play fill="currentColor" />
                {t("workoutTimer.start")}
              </button>
            </section>
          </div>
        ) : (
          <section className="mt-8 flex min-h-[65vh] flex-col items-center justify-center rounded-3xl border border-slate-800 bg-black p-6 text-center">
            <p className="text-lg font-black uppercase tracking-[0.18em] text-cyan-300">
              {t(`workoutTimer.modes.${mode}.name`)}
            </p>
            {currentRound !== null && (
              <p className="mt-4 text-xl text-slate-300">
                {t("workoutTimer.roundProgress", {
                  current: currentRound,
                  total:
                    mode === "emom"
                      ? settings.emomRounds
                      : settings.tabataRounds,
                })}
              </p>
            )}
            {mode === "tabata" && status !== "complete" && (
              <p
                className={`mt-4 rounded-full px-6 py-2 text-xl font-black uppercase ${
                  tabataPhase === "work"
                    ? "bg-emerald-400 text-emerald-950"
                    : "bg-amber-300 text-amber-950"
                }`}
              >
                {t(`workoutTimer.${tabataPhase}`)}
              </p>
            )}
            <div className="my-8 font-mono text-6xl font-black tabular-nums sm:text-8xl lg:text-9xl">
              {timeDisplay}
            </div>
            {mode === "amrap" && (
              <div className="mb-7">
                <p className="text-sm uppercase tracking-widest text-slate-400">
                  {t("workoutTimer.roundsCompleted")}
                </p>
                <div className="mt-3 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setRoundsCompleted((rounds) => Math.max(0, rounds - 1))
                    }
                    className="h-12 w-12 rounded-full border border-slate-700 text-2xl hover:bg-slate-800"
                  >
                    −
                  </button>
                  <strong className="min-w-16 text-4xl">
                    {roundsCompleted}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setRoundsCompleted((rounds) => rounds + 1)}
                    className="h-12 w-12 rounded-full bg-cyan-300 text-2xl font-black text-slate-950"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            {status === "complete" && (
              <div className="mb-6 flex items-center gap-2 text-xl font-bold text-emerald-300">
                <CheckCircle2 />
                {t("workoutTimer.complete")}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {status === "running" && (
                <button
                  type="button"
                  onClick={pause}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-6 py-3 font-black text-amber-950"
                >
                  <Pause fill="currentColor" />
                  {t("workoutTimer.pause")}
                </button>
              )}
              {status === "paused" && (
                <button
                  type="button"
                  onClick={resume}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 font-black text-slate-950"
                >
                  <Play fill="currentColor" />
                  {t("workoutTimer.resume")}
                </button>
              )}
              {mode === "forTime" && status !== "complete" && (
                <button
                  type="button"
                  onClick={() => finish(elapsed)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 font-black text-emerald-950"
                >
                  <CheckCircle2 />
                  {t("workoutTimer.finish")}
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 font-bold hover:bg-slate-800"
              >
                <RefreshCcw />
                {t("workoutTimer.reset")}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function NumberField({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">
        {label}
      </span>
      <input
        type="number"
        min={minimum}
        max={maximum}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-bold outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      />
    </label>
  );
}
