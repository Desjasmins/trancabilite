import "dotenv/config";
import { PrismaClient, OperationKind } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { defaultTemplate } from "../src/lib/label";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const OPS = ["A. Tremblay", "M. Côté", "J. Bélanger", "S. Roy", "P. Gagnon", "L. Dubé"];

async function main() {
  console.log("Seeding (socle propre, sans données de production)…");

  // Base propre : on retire toute donnée existante (ordre des FK respecté).
  await prisma.traceEvent.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.batch.deleteMany({});
  await prisma.delivery.deleteMany({});
  await prisma.routeStep.deleteMany({});
  await prisma.route.deleteMany({});
  await prisma.operation.deleteMany({});
  await prisma.operator.deleteMany({});

  // --- Opérations (catalogue des postes de production) ---
  await prisma.operation.createMany({
    data: [
      { key: "montage", labelFr: "Montage", labelEn: "Assembly", kind: OperationKind.STANDARD },
      { key: "test", labelFr: "Test", labelEn: "Test", kind: OperationKind.QC },
      { key: "verification", labelFr: "Vérification", labelEn: "Verification", kind: OperationKind.STANDARD },
    ],
  });

  // --- Gammes de fabrication ---
  await prisma.route.create({
    data: {
      name: "Standard",
      isDefault: true,
      steps: {
        create: [
          { operationKey: "montage", position: 0 },
          { operationKey: "test", position: 1 },
          { operationKey: "verification", position: 2 },
        ],
      },
    },
  });
  await prisma.route.create({
    data: {
      name: "Sans test",
      isDefault: false,
      steps: {
        create: [
          { operationKey: "montage", position: 0 },
          { operationKey: "verification", position: 1 },
        ],
      },
    },
  });

  // --- Opérateurs ---
  await prisma.operator.createMany({
    data: OPS.map((name, i) => ({ name, order: i, active: true })),
  });

  // --- Réglages + gabarit d'étiquette ---
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, sub: "ST-4471", proj: "24-3095" },
    update: { sub: "ST-4471", proj: "24-3095" },
  });
  await prisma.labelTemplate.upsert({
    where: { id: 1 },
    create: { id: 1, data: defaultTemplate() as object },
    update: { data: defaultTemplate() as object },
  });

  console.log("Seed terminé : 3 opérations, 2 gammes (Standard, Sans test), 6 opérateurs, réglages + gabarit. Aucune unité/lot/livraison.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
