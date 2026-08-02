import { useEffect, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

export function PasswordInput({
  className = "",
  disabled,
  onBlur,
  onCopy,
  onCut,
  ...props
}: PasswordInputProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isVisible) return;
    const timeout = window.setTimeout(() => setIsVisible(false), 10_000);
    return () => window.clearTimeout(timeout);
  }, [isVisible]);

  return (
    <div className="relative">
      <Input
        {...props}
        type={isVisible ? "text" : "password"}
        disabled={disabled}
        onBlur={(event) => {
          setIsVisible(false);
          onBlur?.(event);
        }}
        onCopy={(event) => {
          onCopy?.(event);
          if (isVisible) event.preventDefault();
        }}
        onCut={(event) => {
          onCut?.(event);
          if (isVisible) event.preventDefault();
        }}
        className={`pr-11 ${className}`}
      />
      <button
        type="button"
        aria-label={
          isVisible ? t("common.hidePassword") : t("common.showPassword")
        }
        aria-pressed={isVisible}
        title={isVisible ? t("common.hidePassword") : t("common.showPassword")}
        disabled={disabled}
        onClick={() => setIsVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
