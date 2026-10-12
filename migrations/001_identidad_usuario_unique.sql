-- PROPUESTA OPCIONAL. NO EJECUTADA. No cambia filas, PK, FK, RLS ni permisos.
-- Primero comprobar con el propietario que no hay identidades duplicadas:
-- SELECT lower(id_tenant), lower(id_object), count(*) FROM urh_votacion.usuario
-- WHERE id_tenant IS NOT NULL AND id_object IS NOT NULL
-- GROUP BY lower(id_tenant), lower(id_object) HAVING count(*) > 1;
-- Si hay duplicados, este CREATE fallará sin eliminar registros. Revisarlos manualmente.
BEGIN;
CREATE UNIQUE INDEX urh_usuario_entra_identidad_unique
  ON urh_votacion.usuario (lower(id_tenant), lower(id_object))
  WHERE id_tenant IS NOT NULL AND id_object IS NOT NULL;
COMMIT;
-- Reversión SOLO si este índice fue creado para esta propuesta:
-- DROP INDEX urh_votacion.urh_usuario_entra_identidad_unique;
