import "dotenv/config";
import { auth } from "../src/lib/auth";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Création d'un compte (admin par défaut). Sert aussi à créer superviseurs/clients.
// Lancer avec :  ALLOW_SIGNUP=true pnpm db:seed-admin
// Paramétrable : ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_ROLE
//   ex. ALLOW_SIGNUP=true ADMIN_EMAIL=sup@x.com ADMIN_ROLE=superviseur pnpm db:seed-admin

const email = process.env.ADMIN_EMAIL || "admin@lightbase.local";
const password = process.env.ADMIN_PASSWORD || "Lightbase!2026";
const name = process.env.ADMIN_NAME || "Administrateur";
const role = process.env.ADMIN_ROLE || "admin";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

async function main() {
  if (process.env.ALLOW_SIGNUP !== "true") {
    console.error("Lancez avec ALLOW_SIGNUP=true pour autoriser la création.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { role, emailVerified: true, banned: false },
    });
    console.log(`Compte ${email} déjà présent — rôle forcé à "${role}".`);
    return;
  }

  await auth.api.signUpEmail({ body: { email, password, name } });
  await prisma.user.update({
    where: { email },
    data: { role, emailVerified: true },
  });
  console.log(`Compte créé : ${email} / ${password}  rôle=${role}  (mot de passe à changer)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
