import { z } from "zod";

/**
 * Phase 9 — application authentication contracts.
 * Server-side sessions + Google OIDC login. Separate from Gmail
 * integration tokens. Safe user payloads only (never session tokens,
 * hashes, or provider secrets).
 */

/** Querystring for GET /api/auth/google/callback (validated, never trusted blindly). */
export const GoogleCallbackQuerySchema = z.object({
  code: z.string().min(1).max(8000),
  state: z.string().min(1).max(4000),
});

export type GoogleCallbackQuery = z.infer<typeof GoogleCallbackQuerySchema>;

/** Email + password auth (Phase 21). Emails are normalized to lowercase. */
export const PasswordEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);

export const PasswordRegisterSchema = z.object({
  email: PasswordEmailSchema,
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(200).optional(),
});

export type PasswordRegister = z.infer<typeof PasswordRegisterSchema>;

export const PasswordLoginSchema = z.object({
  email: PasswordEmailSchema,
  password: z.string().min(1).max(200),
});

export type PasswordLogin = z.infer<typeof PasswordLoginSchema>;

/** Safe public identity returned by GET /api/auth/me. */
export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  emailVerifiedAt: z.string().nullable().optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

/** Validated provider identity (from the provider response, never the browser). */
export const ProviderIdentitySchema = z.object({
  provider: z.literal("google"),
  providerAccountId: z.string().min(1).max(300),
  email: z.string().email().max(320),
  emailVerified: z.boolean(),
  name: z.string().max(200).nullable().optional(),
  avatarUrl: z.string().url().max(2000).nullable().optional(),
});

export type ProviderIdentity = z.infer<typeof ProviderIdentitySchema>;

/** Safe login error codes surfaced via redirect (never raw provider errors). */
export const AuthErrorCodeSchema = z.enum([
  "oauth_not_configured",
  "oauth_failed",
  "invalid_state",
  "session_expired",
]);

export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;
