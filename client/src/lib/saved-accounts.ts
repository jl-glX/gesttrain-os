import type { AuthUser } from "../context/auth-context";

export interface SavedAccount {
  id: string;
  identifier: string;
  name: string;
  avatarDataUrl: string;
  accessPortal: "member" | "staff";
  role: AuthUser["role"];
  lastUsedAt: number;
}

const STORAGE_KEY = "gesttrain-os.saved-accounts.v1";
const MAX_SAVED_ACCOUNTS = 8;

export function getSavedAccounts(): SavedAccount[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (account): account is SavedAccount =>
          typeof account?.id === "string" &&
          typeof account?.identifier === "string" &&
          typeof account?.name === "string",
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_SAVED_ACCOUNTS);
  } catch {
    return [];
  }
}

export function rememberAccount(
  user: AuthUser,
  identifier: string,
): SavedAccount[] {
  const account: SavedAccount = {
    id: user.id,
    identifier: identifier.trim(),
    name: user.name,
    avatarDataUrl: user.avatarDataUrl,
    accessPortal: user.role === "member" ? "member" : "staff",
    role: user.role,
    lastUsedAt: Date.now(),
  };
  const accounts = [
    account,
    ...getSavedAccounts().filter((saved) => saved.id !== user.id),
  ].slice(0, MAX_SAVED_ACCOUNTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  return accounts;
}

export function forgetAccount(accountId: string): SavedAccount[] {
  const accounts = getSavedAccounts().filter(
    (account) => account.id !== accountId,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  return accounts;
}
