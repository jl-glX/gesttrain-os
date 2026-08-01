import express from "express";
import {
  completeMfaLogin,
  login,
  logout,
  logoutAll,
  signup,
} from "../services/auth.js";
import { authenticationLimiter } from "../middleware/security.js";
import {
  loginValidation,
  mfaCodeValidation,
  passkeyAuthenticationOptionsValidation,
  passkeyResponseValidation,
  signupValidation,
} from "../middleware/validation.js";
import {
  authenticate,
  getAuthenticatedUser,
} from "../middleware/authorization.js";
import {
  clearSessionCookie,
  clearMfaChallengeCookie,
  clearPasskeyChallengeCookie,
  readMfaChallengeToken,
  readPasskeyChallengeToken,
  readSessionToken,
  setMfaChallengeCookie,
  setPasskeyChallengeCookie,
  setSessionCookie,
} from "../lib/session-cookie.js";
import {
  beginPasskeyAuthentication,
  finishPasskeyAuthentication,
} from "../services/passkeys.js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getWebauthnContext } from "../lib/request-origin.js";

export const authRouter = express.Router();

authRouter.post(
  "/signup",
  authenticationLimiter,
  signupValidation,
  async (req: express.Request, res: express.Response) => {
    try {
      const { email, name, password } = req.body;
      const { sessionToken, user } = await signup(email, name, password, {
        userAgent: req.get("User-Agent"),
      });
      setSessionCookie(res, sessionToken);
      res.status(201).json({ user });
    } catch (error) {
      console.error("[Auth] Signup failed");
      res.status(400).json({
        error: error instanceof Error ? error.message : "Signup failed",
      });
    }
  },
);

authRouter.post(
  "/login",
  authenticationLimiter,
  loginValidation,
  async (req: express.Request, res: express.Response) => {
    try {
      const { identifier, password, accessPortal, rememberDevice } = req.body;
      const result = await login(
        identifier,
        password,
        accessPortal,
        Boolean(rememberDevice),
        { userAgent: req.get("User-Agent") },
      );
      if ("challengeToken" in result) {
        setMfaChallengeCookie(res, result.challengeToken);
        res.status(200).json({ mfaRequired: true });
        return;
      }

      setSessionCookie(res, result.sessionToken, result.rememberDevice);
      res.status(200).json({ user: result.user, mfaRequired: false });
    } catch {
      res.status(401).json({ error: "Invalid email or password" });
    }
  },
);

authRouter.post(
  "/passkey/options",
  authenticationLimiter,
  passkeyAuthenticationOptionsValidation,
  async (req: express.Request, res: express.Response) => {
    try {
      const { identifier, accessPortal, rememberDevice } = req.body;
      const { rpID } = getWebauthnContext(req);
      const result = await beginPasskeyAuthentication(
        identifier,
        accessPortal,
        Boolean(rememberDevice),
        rpID,
      );
      setPasskeyChallengeCookie(res, result.token);
      res.json(result.options);
    } catch {
      res.status(401).json({
        code: "PASSKEY_NOT_CONFIGURED",
        error: "Passkey access is not available",
      });
    }
  },
);

authRouter.post(
  "/passkey/verify",
  authenticationLimiter,
  passkeyResponseValidation,
  async (req: express.Request, res: express.Response) => {
    const challengeToken = readPasskeyChallengeToken(req);
    if (!challengeToken) {
      res.status(401).json({
        code: "PASSKEY_CHALLENGE_INVALID",
        error: "Invalid or expired passkey challenge",
      });
      return;
    }
    try {
      const { origin, rpID } = getWebauthnContext(req);
      const result = await finishPasskeyAuthentication(
        challengeToken,
        req.body.response as AuthenticationResponseJSON,
        origin,
        rpID,
        { userAgent: req.get("User-Agent") },
      );
      clearPasskeyChallengeCookie(res);
      setSessionCookie(res, result.sessionToken, result.rememberDevice);
      res.json({ user: result.user });
    } catch {
      clearPasskeyChallengeCookie(res);
      res.status(401).json({
        code: "PASSKEY_VERIFICATION_FAILED",
        error: "Passkey verification failed",
      });
    }
  },
);

authRouter.post(
  "/mfa/verify",
  authenticationLimiter,
  mfaCodeValidation,
  async (req: express.Request, res: express.Response) => {
    const challengeToken = readMfaChallengeToken(req);
    if (!challengeToken) {
      res
        .status(401)
        .json({ error: "Invalid or expired verification challenge" });
      return;
    }

    try {
      const { sessionToken, user, rememberDevice } = await completeMfaLogin(
        challengeToken,
        req.body.code,
        { userAgent: req.get("User-Agent") },
      );
      clearMfaChallengeCookie(res);
      setSessionCookie(res, sessionToken, rememberDevice);
      res.status(200).json({ user });
    } catch {
      res.status(401).json({ error: "Invalid verification code" });
    }
  },
);

authRouter.get(
  "/session",
  authenticate,
  (_req: express.Request, res: express.Response) => {
    const session = getAuthenticatedUser(res);
    res.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        avatarDataUrl: session.avatarDataUrl,
        role: session.role,
      },
    });
  },
);

authRouter.post(
  "/logout",
  authenticate,
  async (req: express.Request, res: express.Response) => {
    const token = readSessionToken(req);
    if (token) {
      await logout(token);
    }
    clearSessionCookie(res);
    res.json({ message: "Logged out successfully" });
  },
);

authRouter.post(
  "/logout-all",
  authenticate,
  async (_req: express.Request, res: express.Response) => {
    await logoutAll(getAuthenticatedUser(res).userId);
    clearSessionCookie(res);
    res.json({ message: "All sessions revoked" });
  },
);
