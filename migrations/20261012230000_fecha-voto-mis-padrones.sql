DO $migration$
DECLARE
  v_definition text;
  v_from text := $find$'ya_voto',EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe WHERE pe.id_padron=pa.id_padron AND pe.id_padron_detalle=pd.id_padron_detalle)$find$;
  v_to text := $replacement$'ya_voto',EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe WHERE pe.id_padron=pa.id_padron AND pe.id_padron_detalle=pd.id_padron_detalle),
        'fecha_voto',(SELECT max(pe.fecha_participacion) FROM urh_votacion.participacion_electoral pe WHERE pe.id_padron=pa.id_padron AND pe.id_padron_detalle=pd.id_padron_detalle)$replacement$;
BEGIN
  SELECT pg_get_functiondef('urh_votacion.urh_operacion(uuid,uuid,text,jsonb)'::regprocedure)
    INTO v_definition;

  IF length(v_definition)-length(replace(v_definition,v_from,'')) <> length(v_from) THEN
    RAISE EXCEPTION 'No se pudo aplicar la actualización de la fecha de participación del elector';
  END IF;

  EXECUTE replace(v_definition,v_from,v_to);
END
$migration$;
