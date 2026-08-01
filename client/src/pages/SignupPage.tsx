import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { AuthShell } from "../components/AuthShell";
import { PasswordInput } from "../components/PasswordInput";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isPasswordWithinHashLimit } from "../lib/passwordPolicy";

export function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [validationError, setValidationError] = useState("");
  const { t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (!formData.email || !formData.name || !formData.password) {
      setValidationError(t("auth.allRequired"));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setValidationError(t("auth.passwordMismatch"));
      return;
    }

    if (
      formData.password.length < 12 ||
      !isPasswordWithinHashLimit(formData.password) ||
      !/[a-z]/.test(formData.password) ||
      !/[A-Z]/.test(formData.password) ||
      !/[0-9]/.test(formData.password)
    ) {
      setValidationError(t("auth.passwordPolicy"));
      return;
    }

    try {
      await signup(formData.email, formData.name, formData.password);
      navigate("/classes");
    } catch (err) {
      console.error("Signup error:", err);
    }
  };

  return (
    <AuthShell
      eyebrow={t("auth.join")}
      title={t("auth.createTitle")}
      description={t("auth.createDescription")}
    >
      {(error || validationError) && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="text-sm text-red-600">{error || validationError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-700">
            {t("auth.emailAddress")}
          </Label>
          <Input
            id="email"
            type="email"
            name="email"
            placeholder="your@email.com"
            value={formData.email}
            onChange={handleChange}
            disabled={isLoading}
            className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3 focus-visible:bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-slate-700">
            {t("auth.fullName")}
          </Label>
          <Input
            id="name"
            type="text"
            name="name"
            placeholder="John Doe"
            value={formData.name}
            onChange={handleChange}
            disabled={isLoading}
            className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3 focus-visible:bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-slate-700">
            {t("common.password")}
          </Label>
          <PasswordInput
            id="password"
            name="password"
            placeholder="••••••••"
            value={formData.password}
            maxLength={72}
            onChange={handleChange}
            disabled={isLoading}
            className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3 focus-visible:bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-slate-700">
            {t("auth.confirmPassword")}
          </Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            placeholder="••••••••"
            value={formData.confirmPassword}
            maxLength={72}
            onChange={handleChange}
            disabled={isLoading}
            className="h-11 rounded-xl border-slate-200 bg-slate-50 px-3 focus-visible:bg-white"
          />
        </div>

        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-blue-600 shadow-md shadow-blue-600/15 hover:bg-blue-700"
          disabled={isLoading}
        >
          {isLoading ? (
            t("auth.creatingAccount")
          ) : (
            <>
              <span>{t("auth.createAccount")}</span>
              <ArrowRight />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600">
          {t("auth.hasAccount")}{" "}
          <Link
            to="/login"
            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            {t("auth.signIn")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
