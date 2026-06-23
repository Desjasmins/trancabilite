import "dotenv/config";
import { PrismaClient, type TestResult } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { defaultTemplate } from "../src/lib/label";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const OPS = ["A. Tremblay", "M. Côté", "J. Bélanger", "S. Roy", "P. Gagnon", "L. Dubé"];
const DESSIN = "925-04812-01 / B";

interface StageData {
  montagePar?: string;
  montageDate?: Date;
  testPar?: string;
  testDate?: Date;
  testDiel?: TestResult;
  testPol?: TestResult;
  testEff?: TestResult;
  verificationPar?: string;
  verificationDate?: Date;
  deliveryId?: string;
  nc?: string;
}

function stageFields(stage: number, liv: string): StageData {
  const now = new Date();
  if (stage === -1) {
    return {
      montagePar: "A. Tremblay",
      montageDate: now,
      testPar: "M. Côté",
      testDate: now,
      testDiel: "accept",
      testPol: "refus",
      nc: "Polarité inversée sur bornier J2 — à reprendre.",
    };
  }
  const d: StageData = {};
  if (stage >= 1) { d.montagePar = "A. Tremblay"; d.montageDate = now; }
  if (stage >= 2) { d.testPar = "M. Côté"; d.testDate = now; d.testDiel = "accept"; d.testPol = "accept"; d.testEff = "accept"; }
  if (stage >= 3) { d.verificationPar = "S. Roy"; d.verificationDate = now; }
  if (stage >= 4) { d.deliveryId = liv; }
  return d;
}

async function main() {
  console.log("Seeding…");

  // Réinitialise (idempotent en dev)
  await prisma.unit.deleteMany({});
  await prisma.batch.deleteMany({});
  await prisma.delivery.deleteMany({});
  await prisma.operator.deleteMany({});

  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, sub: "ST-4471", proj: "24-3095" },
    update: { sub: "ST-4471", proj: "24-3095" },
  });

  await prisma.operator.createMany({
    data: OPS.map((name, i) => ({ name, order: i, active: true })),
  });

  await prisma.labelTemplate.upsert({
    where: { id: 1 },
    create: { id: 1, data: defaultTemplate() as object },
    update: { data: defaultTemplate() as object },
  });

  await prisma.delivery.create({
    data: { id: "LIV-2026-014", client: "Acme Électrique inc.", closed: true },
  });

  await prisma.batch.create({
    data: { id: "L-A1", po: "PO-2026-1185", projet: "24-3095", reference: "A1", sub: "ST-4471", createdBy: "J. Bélanger" },
  });
  await prisma.batch.create({
    data: { id: "L-B1", po: "PO-2026-1192", projet: "24-3110", reference: "B1", sub: "ST-4471", createdBy: "J. Bélanger" },
  });

  const rows: Array<[string, string, string, number, string, string, string]> = [
    ["24-3095", "A1", "001", 4, "PO-2026-1185", "L-A1", "LIV-2026-014"],
    ["24-3095", "A1", "002", 4, "PO-2026-1185", "L-A1", "LIV-2026-014"],
    ["24-3095", "A1", "003", -1, "PO-2026-1185", "L-A1", ""],
    ["24-3110", "B1", "001", 3, "PO-2026-1192", "L-B1", ""],
    ["24-3110", "B1", "002", 2, "PO-2026-1192", "L-B1", ""],
    ["24-3110", "B1", "003", 1, "PO-2026-1192", "L-B1", ""],
    ["24-3110", "B1", "004", 0, "PO-2026-1192", "L-B1", ""],
  ];

  for (const [projet, reference, serie, stage, po, batchId, liv] of rows) {
    await prisma.unit.create({
      data: {
        serie,
        projet,
        reference,
        po,
        batchId,
        dessin: DESSIN,
        sub: "ST-4471",
        etiquettePar: "J. Bélanger",
        etiquetteDate: new Date(),
        etiquetteImprimee: true,
        ...stageFields(stage, liv),
      },
    });
  }

  console.log("Seed terminé : 7 unités, 2 lots, 1 livraison, 6 opérateurs.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
