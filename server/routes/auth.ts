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
  emailVerificationValidation,
} from "../middleware/validation.js";
import {
  authenticate,
  authenticateAccountSession,
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
import {
  createEmailVerificationChallenge,
  verifyEmailCode,
} from "../services/email-verification.js";
import { requireCaptcha } from "../middleware/captcha.js";
import { getRecoveryCapabilities } from "../services/account-recovery.js";

export const authRouter = express.Router();

authRouter.get("/recovery/capabilities", (_req, res) => {
  res.json({ methods: getRecoveryCapabilities() });
});

authRouter.post(
  "/signup",
  authenticationLimiter,
  signupValidation,
  requireCaptcha("signup"),
  async (req: express.Request, res: express.Response) => {
    try {
      const {
        email,
        name,
        lastName,
        password,
        countryCode,
        locale,
        acceptedTerms,
        acceptedPrivacy,
      } = req.body;
      const { sessionToken, user } = await signup(
        email,
        name,
        password,
        { userAgent: req.get("User-Agent") },
        {
          lastName,
          countryCode,
          locale,
          acceptedTerms,
          acceptedPrivacy,
        },
      );
      const verificationCode = await createEmailVerificationChallenge(user.id);
      setSessionCookie(res, sessionToken);
      res.status(201).json({
        user,
        verificationRequired: true,
        demoVerificationCode:
          process.env.NODE_ENV === "production" ? undefined : verificationCode,
      });
    } catch (error) {
      console.error("[Auth] Signup failed");
      res.status(400).json({
        error: error instanceof Error ? error.message : "Signup failed",
      });
    }
  },
);

authRouter.post(
  "/verify-email",
  authenticateAccountSession,
  authenticationLimiter,
  emailVerificationValidation,
  async (req: express.Request, res: express.Response) => {
    const auth = getAuthenticatedUser(res);
    if (!(await verifyEmailCode(auth.userId, req.body.code))) {
      res.status(400).json({ error: "Invalid or expired verification code" });
      return;
    }
    res.json({ verified: true });
  },
);

authRouter.post(
  "/login",
  authenticationLimiter,
  loginValidation,
  requireCaptcha("login"),
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
  requireCaptcha("login"),
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
  authenticateAccountSession,
  (_req: express.Request, res: express.Response) => {
    const session = getAuthenticatedUser(res);
    res.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        avatarDataUrl: session.avatarDataUrl,
        role: session.role,
        accountStatus: session.accountStatus,
      },
    });
  },
);

authRouter.post(
  "/logout",
  authenticateAccountSession,
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
