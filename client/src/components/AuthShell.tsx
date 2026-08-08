import type { ReactNode } from "react";
import { CalendarDays, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BrandLockup } from "./BrandLockup";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  utilityMenu?: ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  utilityMenu,
}: AuthShellProps) {
  const { t } = useTranslation();
  const highlights = [
    { icon: CalendarDays, text: t("auth.highlights.weekly") },
    { icon: Users, text: t("auth.highlights.waitlists") },
    { icon: ShieldCheck, text: t("auth.highlights.secure") },
  ];

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute -right-32 -top-20 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />

        <div className="relative inline-flex w-fit rounded-2xl bg-white px-3 py-2 shadow-xl shadow-black/20">
          <BrandLockup className="h-14 w-auto max-w-64" />
        </div>

        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            {t("auth.brandTagline")}
          </p>
          <h1 className="mt-5 text-5xl font-bold leading-[1.08] tracking-tight xl:text-6xl">
            {t("auth.brandTitle")}
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
            {t("auth.brandDescription")}
          </p>
          <div className="mt-10 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 text-sm text-slate-200"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-blue-300 ring-1 ring-white/10">
                  <Icon size={18} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} Umbravia Forge
        </p>
      </section>

      <section className="flex min-h-screen flex-col bg-slate-50">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-end gap-2">
              <LanguageSwitcher />
              {utilityMenu}
            </div>
            <div className="mb-8 lg:hidden">
              <BrandLockup className="h-14 w-auto max-w-64" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {description}
            </p>
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
              {children}
            </div>
          </div>
        </div>
        <p className="px-4 pb-6 text-center text-xs text-slate-400 lg:hidden">
          © {new Date().getFullYear()} Umbravia Forge
        </p>
      </section>
    </main>
  );
}
