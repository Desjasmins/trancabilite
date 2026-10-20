-- #7 — détection des S.N. en double, À LANCER AVANT la migration unit_serial_unique.
-- Lecture seule. Attendu : 0 ligne. Toute ligne rendue = un (projet, référence, S.N.)
-- porté par plusieurs unités ; à résoudre avec le responsable qualité avant migration
-- (ne jamais supprimer d'unité ayant des événements : TraceEvent est le registre).
SELECT u.projet,
       u.reference,
       u.serie,
       count(*)                                   AS nb_unites,
       array_agg(u.id ORDER BY u."dateCreation")  AS unit_ids,
       array_agg(u."batchId" ORDER BY u."dateCreation") AS batch_ids,
       (SELECT count(*) FROM trace_events e WHERE e."unitId" = ANY (array_agg(u.id))) AS nb_evenements
FROM units u
GROUP BY u.projet, u.reference, u.serie
HAVING count(*) > 1
ORDER BY u.projet, u.reference, u.serie;
