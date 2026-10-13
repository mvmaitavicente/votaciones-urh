DO $migration$
DECLARE
  v_definition text;
  v_from text := $find$'evento',ev.dsc_evento,$find$;
  v_to text := $replacement$'evento',ev.dsc_evento,'dsc_sub_titulo',ev.dsc_sub_titulo,'dsc_mensaje',ev.dsc_mensaje,
        'nombre_completo',(SELECT concat_ws(' ',per.nombres,per.apellido_paterno,per.apellido_materno) FROM urh_votacion.personal per WHERE per.id_personal=u.id_persona),
        'unidad_organica',(SELECT dep.dsc_dependencia FROM urh_votacion.personal per JOIN urh_votacion.dependencia dep ON dep.id_dependencia=per.id_dependencia WHERE per.id_personal=u.id_persona),
        'correo',(SELECT per.correo_institucional::text FROM urh_votacion.personal per WHERE per.id_personal=u.id_persona),
        'dsc_segmento',(SELECT sg.dsc_segmento FROM urh_votacion.segmento sg WHERE sg.id_segmento=pa.id_segmento),$replacement$;
BEGIN
  SELECT pg_get_functiondef('urh_votacion.urh_operacion(uuid,uuid,text,jsonb)'::regprocedure)
    INTO v_definition;

  IF length(v_definition)-length(replace(v_definition,v_from,'')) <> length(v_from) THEN
    RAISE EXCEPTION 'No se pudo aplicar la actualización de los datos del evento para el elector';
  END IF;

  EXECUTE replace(v_definition,v_from,v_to);
END
$migration$;
