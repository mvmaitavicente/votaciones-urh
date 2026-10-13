-- Activacion de todos los trabajadores solicitada por el usuario.
-- Aplicar una sola vez con el propietario de urh_votacion.personal.
ALTER TABLE urh_votacion.personal ALTER COLUMN activo SET DEFAULT true;

UPDATE urh_votacion.personal
SET activo = true
WHERE activo IS DISTINCT FROM true;
