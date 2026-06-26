import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { prisma } from "./db";

/**
 * Authentification (Better Auth) — comptes du Bureau.
 * L'atelier reste ouvert (kiosque) ; seul le Bureau est protégé.
 * Rôles : "admin" (gère tout + comptes), "superviseur" (Bureau complet),
 * "client" (lecture seule). Pas d'inscription publique : l'admin crée les comptes.
 */

// Origines de confiance (anti-CSRF). On accepte l'URL configurée + les domaines
// Vercel (prod ET preview) pour éviter les rejets INVALID_ORIGIN.
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  "http://localhost:3000",
].filter((v): v is string => Boolean(v));

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Pas d'inscription publique. Bootstrap de l'admin via ALLOW_SIGNUP=true (seed).
    disableSignUp: process.env.ALLOW_SIGNUP !== "true",
  },
  plugins: [
    admin({
      defaultRole: "client",
      adminRoles: ["admin"],
    }),
  ],
});

export type Role = "admin" | "superviseur" | "client";
