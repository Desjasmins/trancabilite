-- #7 — un S.N. est unique par (projet, référence).
-- AVANT d'appliquer : lancer prisma/checks/7-doublons-serie.sql ; il doit rendre 0 ligne,
-- sinon la création de l'index échoue (doublons à résoudre à la main, registre ISO).

-- CreateIndex
CREATE UNIQUE INDEX "units_projet_reference_serie_key" ON "units"("projet", "reference", "serie");

-- DropIndex : couvert par le préfixe (projet, reference) de l'index unique.
DROP INDEX "units_projet_reference_idx";
