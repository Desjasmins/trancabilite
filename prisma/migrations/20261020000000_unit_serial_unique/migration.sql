-- #7 — un S.N. est unique par (projet, référence).
-- Prérequis : baseline 00000000000000_init marquée appliquée (migrate resolve) ; AVANT d'appliquer :
-- sinon la création de l'index échoue (doublons à résoudre à la main, registre ISO).

-- CreateIndex
CREATE UNIQUE INDEX "units_projet_reference_serie_key" ON "units"("projet", "reference", "serie");

-- DropIndex : couvert par le préfixe (projet, reference) de l'index unique.
DROP INDEX "units_projet_reference_idx";
