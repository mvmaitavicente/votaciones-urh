ALTER TABLE urh_votacion.candidatura ADD COLUMN IF NOT EXISTS foto_key text;
-- Usar propietario PostgreSQL. Reemplaza solo la RPC; conserva ACL existentes.
CREATE OR REPLACE FUNCTION urh_votacion.urh_operacion(p_object uuid,p_tenant uuid,p_accion text,p_datos jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  u urh_votacion.usuario%ROWTYPE; e urh_votacion.evento%ROWTYPE;
  p urh_votacion.padron%ROWTYPE; d urh_votacion.padron_detalle%ROWTYPE;
  o urh_votacion.opcion_electoral%ROWTYPE;
  v_roles jsonb; v_admin boolean; v_elector boolean;
  v_id bigint; v_persona integer; v_evento integer; v_estado text;
  v_inicio timestamptz; v_fin timestamptz; v_constraint text;
BEGIN
  IF p_object IS NULL OR p_tenant IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'SOLICITUD_INVALIDA';
  END IF;
  IF (SELECT count(*) FROM urh_votacion.usuario WHERE lower(id_object)=p_object::text AND lower(id_tenant)=p_tenant::text) <> 1 THEN
    RAISE EXCEPTION 'SIN_ACCESO';
  END IF;
  SELECT * INTO u FROM urh_votacion.usuario WHERE lower(id_object)=p_object::text AND lower(id_tenant)=p_tenant::text FOR SHARE;
  IF u.activo IS NOT TRUE THEN RAISE EXCEPTION 'SIN_ACCESO'; END IF;
  SELECT coalesce(jsonb_agg(DISTINCT r.codigo),'[]'::jsonb) INTO v_roles
    FROM urh_votacion.usuario_rol ur JOIN urh_votacion.rol r USING(id_rol)
    WHERE ur.id_usuario=u.id_usuario AND r.codigo IN ('ADMINISTRADOR','ELECTOR');
  v_admin := v_roles ? 'ADMINISTRADOR'; v_elector := v_roles ? 'ELECTOR';
  IF NOT v_admin AND NOT v_elector THEN RAISE EXCEPTION 'SIN_ROLES'; END IF;
  IF p_accion='verificar_acceso' THEN
    RETURN jsonb_build_object('autorizado',true,'estado','AUTORIZADO','usuario',jsonb_build_object('id_usuario',u.id_usuario,'nombre',u.nombre),'roles',v_roles,'modo','FASE_FUNCIONAL_GUID');
  END IF;

  IF p_accion IN ('mis_padrones','opciones','emitir_voto','estado_participacion','resultados_publicos') THEN
    IF NOT v_elector THEN RAISE EXCEPTION 'PERMISO_INSUFICIENTE'; END IF;
    IF u.id_persona IS NULL THEN RAISE EXCEPTION 'TRABAJADOR_NO_VINCULADO'; END IF;
    IF NOT EXISTS (SELECT 1 FROM urh_votacion.personal WHERE id_personal=u.id_persona AND activo IS TRUE) THEN RAISE EXCEPTION 'ELECTOR_NO_HABILITADO'; END IF;
    IF p_accion='mis_padrones' THEN
      RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id_padron',pa.id_padron,'nom_padron',pa.nom_padron,'id_evento',ev.id_evento,'evento',ev.dsc_evento,
        'fecha_inicio',ev.fecha_inicio,'fecha_fin',ev.fecha_fin,'estado',ev.estado,'resultados_publicados',ev.resultados_publicados,
        'disponible',ev.estado='ABIERTO' AND now()>=ev.fecha_inicio AND now()<ev.fecha_fin,
        'ya_voto',EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe WHERE pe.id_padron=pa.id_padron AND pe.id_padron_detalle=pd.id_padron_detalle)))
        FROM urh_votacion.padron_detalle pd JOIN urh_votacion.padron pa ON pa.id_padron=pd.id_padron JOIN urh_votacion.evento ev USING(id_evento)
        WHERE pd.id_persona=u.id_persona AND pd.habilitado IS TRUE),'[]'::jsonb);
    END IF;
    SELECT * INTO p FROM urh_votacion.padron WHERE id_padron=(p_datos->>'id_padron')::integer FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PADRON_INVALIDO'; END IF;
    SELECT * INTO e FROM urh_votacion.evento WHERE id_evento=p.id_evento FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
    SELECT * INTO d FROM urh_votacion.padron_detalle WHERE id_padron=p.id_padron AND id_persona=u.id_persona FOR UPDATE;
    IF NOT FOUND OR d.habilitado IS NOT TRUE THEN RAISE EXCEPTION 'ELECTOR_NO_HABILITADO'; END IF;
    IF p_accion='estado_participacion' THEN
      RETURN jsonb_build_object('ya_voto',EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral WHERE id_padron=p.id_padron AND id_padron_detalle=d.id_padron_detalle));
    END IF;
    IF p_accion='resultados_publicos' THEN
      IF e.estado<>'CERRADO' OR e.resultados_publicados IS NOT TRUE THEN RAISE EXCEPTION 'RESULTADOS_NO_DISPONIBLES'; END IF;
      RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT op.id_opcion_electoral,op.nombre,op.tipo_opcion,count(v.id_voto) AS votos
        FROM urh_votacion.opcion_electoral op LEFT JOIN urh_votacion.voto v ON v.id_opcion_electoral=op.id_opcion_electoral AND v.id_padron=op.id_padron
        WHERE op.id_padron=p.id_padron GROUP BY op.id_opcion_electoral,op.nombre,op.tipo_opcion,op.orden ORDER BY votos DESC,op.orden) x),'[]'::jsonb);
    END IF;
    IF e.estado <> 'ABIERTO' OR e.fecha_inicio IS NULL OR e.fecha_fin IS NULL OR now()<e.fecha_inicio OR now()>=e.fecha_fin THEN RAISE EXCEPTION 'EVENTO_CERRADO'; END IF;
    IF p_accion='opciones' THEN
      RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id_opcion_electoral',op.id_opcion_electoral,'nombre',op.nombre,'tipo_opcion',op.tipo_opcion,'orden',op.orden,
        'candidatura',ca.dsc_nombre_completo,'cargo',ca.dsc_cargo,'foto_url',ca.foto_url) ORDER BY op.orden,op.id_opcion_electoral)
        FROM urh_votacion.opcion_electoral op LEFT JOIN urh_votacion.candidatura ca USING(id_candidatura)
        WHERE op.id_padron=p.id_padron AND op.activo IS TRUE AND (op.id_candidatura IS NULL OR (ca.id_evento=e.id_evento AND ca.id_segmento=p.id_segmento AND ca.estado='ACTIVA'))),'[]'::jsonb);
    END IF;
    SELECT * INTO o FROM urh_votacion.opcion_electoral WHERE id_opcion_electoral=(p_datos->>'id_opcion_electoral')::bigint FOR SHARE;
    IF NOT FOUND OR o.id_padron<>p.id_padron OR o.activo IS NOT TRUE THEN RAISE EXCEPTION 'OPCION_INVALIDA'; END IF;
    IF o.id_candidatura IS NOT NULL AND NOT EXISTS(SELECT 1 FROM urh_votacion.candidatura WHERE id_candidatura=o.id_candidatura AND id_evento=e.id_evento AND id_segmento=p.id_segmento AND estado='ACTIVA') THEN RAISE EXCEPTION 'CANDIDATURA_INVALIDA'; END IF;
    -- La UNIQUE, no un SELECT previo, garantiza una sola participación bajo concurrencia.
    BEGIN
      INSERT INTO urh_votacion.participacion_electoral(id_padron_detalle,id_padron) VALUES(d.id_padron_detalle,p.id_padron);
      -- Sin identidad ni FK de participación; precisión de fecha reducida para votos nuevos.
      INSERT INTO urh_votacion.voto(id_padron,id_opcion_electoral,fecha_emision) VALUES(p.id_padron,o.id_opcion_electoral,date_trunc('day',now()));
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'urh_participacion_unica' THEN RAISE; END IF;
      RETURN jsonb_build_object('estado','YA_VOTO');
    END;
    RETURN jsonb_build_object('estado','VOTO_REGISTRADO');
  END IF;

  IF NOT v_admin THEN RAISE EXCEPTION 'PERMISO_INSUFICIENTE'; END IF;
  IF p_accion='administracion' THEN
    RETURN jsonb_build_object(
      'eventos',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM urh_votacion.evento ORDER BY id_evento DESC LIMIT 1000) x),'[]'::jsonb),
      'segmentos',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM urh_votacion.segmento ORDER BY ord_segmento LIMIT 1000) x),'[]'::jsonb),
      'padrones',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM urh_votacion.padron ORDER BY id_padron DESC LIMIT 1000) x),'[]'::jsonb),
      'candidaturas',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id_candidatura,id_evento,id_persona,id_segmento,dsc_nombre_completo,dsc_cargo,dsc_unidad,foto_url,foto_key,estado FROM urh_votacion.candidatura ORDER BY id_candidatura LIMIT 1000) x),'[]'::jsonb),
      'opciones',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM urh_votacion.opcion_electoral ORDER BY id_opcion_electoral LIMIT 1000) x),'[]'::jsonb),
      'trabajadores',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id_personal,concat_ws(' ',nombres,apellido_paterno,apellido_materno) AS nombre,activo FROM urh_votacion.personal ORDER BY id_personal LIMIT 1000) x),'[]'::jsonb),
      'usuarios',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id_usuario,id_persona,nombre,activo FROM urh_votacion.usuario ORDER BY id_usuario LIMIT 1000) x),'[]'::jsonb),
      'asignaciones',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id_padron_detalle,id_padron,id_persona,habilitado FROM urh_votacion.padron_detalle ORDER BY id_padron_detalle LIMIT 2000) x),'[]'::jsonb));
  END IF;
  IF p_accion='guardar_evento' THEN
    v_id := nullif(p_datos->>'id_evento','')::integer; v_estado := coalesce(p_datos->>'estado','BORRADOR');
    v_inicio := nullif(p_datos->>'fecha_inicio','')::timestamptz; v_fin := nullif(p_datos->>'fecha_fin','')::timestamptz;
    IF coalesce(trim(p_datos->>'dsc_evento'),'')='' OR v_estado NOT IN ('BORRADOR','ABIERTO','CERRADO') THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA'; END IF;
    IF v_estado='ABIERTO' AND (v_inicio IS NULL OR v_fin IS NULL OR v_fin<=v_inicio) THEN RAISE EXCEPTION 'FECHAS_INVALIDAS'; END IF;
    IF coalesce((p_datos->>'resultados_publicados')::boolean,false) AND v_estado<>'CERRADO' THEN RAISE EXCEPTION 'RESULTADOS_NO_DISPONIBLES'; END IF;
    IF v_id IS NOT NULL THEN
      SELECT * INTO e FROM urh_votacion.evento WHERE id_evento=v_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
      IF e.estado='CERRADO' AND v_estado<>'CERRADO' THEN RAISE EXCEPTION 'EVENTO_CERRADO'; END IF;
      IF EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe JOIN urh_votacion.padron pa USING(id_padron) WHERE pa.id_evento=e.id_evento)
        AND (e.fecha_inicio IS DISTINCT FROM v_inicio OR e.fecha_fin IS DISTINCT FROM v_fin OR v_estado='BORRADOR') THEN RAISE EXCEPTION 'PROCESO_CON_PARTICIPACION'; END IF;
      UPDATE urh_votacion.evento SET dsc_evento=p_datos->>'dsc_evento',dsc_sub_titulo=p_datos->>'dsc_sub_titulo',dsc_mensaje=p_datos->>'dsc_mensaje',fecha_inicio=v_inicio,fecha_fin=v_fin,estado=v_estado,resultados_publicados=coalesce((p_datos->>'resultados_publicados')::boolean,false) WHERE id_evento=v_id;
    ELSE
      INSERT INTO urh_votacion.evento(dsc_evento,dsc_sub_titulo,dsc_mensaje,fecha_inicio,fecha_fin,estado,resultados_publicados)
        VALUES(p_datos->>'dsc_evento',p_datos->>'dsc_sub_titulo',p_datos->>'dsc_mensaje',v_inicio,v_fin,v_estado,coalesce((p_datos->>'resultados_publicados')::boolean,false)) RETURNING id_evento INTO v_id;
    END IF;
    RETURN jsonb_build_object('id',v_id);
  END IF;
  IF p_accion='guardar_segmento' THEN
    v_id := nullif(p_datos->>'id_segmento','')::integer;
    IF coalesce(trim(p_datos->>'dsc_segmento'),'')='' THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA'; END IF;
    IF v_id IS NULL THEN INSERT INTO urh_votacion.segmento(dsc_segmento,ord_segmento) VALUES(p_datos->>'dsc_segmento',(p_datos->>'ord_segmento')::integer) RETURNING id_segmento INTO v_id;
    ELSE UPDATE urh_votacion.segmento SET dsc_segmento=p_datos->>'dsc_segmento',ord_segmento=(p_datos->>'ord_segmento')::integer WHERE id_segmento=v_id; IF NOT FOUND THEN RAISE EXCEPTION 'SEGMENTO_INVALIDO'; END IF; END IF;
    RETURN jsonb_build_object('id',v_id);
  END IF;
  IF p_accion='vincular_usuario' THEN
    v_id := (p_datos->>'id_usuario')::integer; v_persona := (p_datos->>'id_personal')::integer;
    SELECT id_persona INTO v_evento FROM urh_votacion.usuario WHERE id_usuario=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'USUARIO_INVALIDO'; END IF;
    IF v_evento IS NOT NULL AND v_evento<>v_persona AND EXISTS (
      SELECT 1 FROM urh_votacion.padron_detalle pd JOIN urh_votacion.participacion_electoral pe USING(id_padron_detalle)
      WHERE pd.id_persona=v_evento
    ) THEN RAISE EXCEPTION 'PROCESO_CON_PARTICIPACION'; END IF;
    IF NOT EXISTS(SELECT 1 FROM urh_votacion.personal WHERE id_personal=v_persona) THEN RAISE EXCEPTION 'TRABAJADOR_INVALIDO'; END IF;
    IF EXISTS(SELECT 1 FROM urh_votacion.usuario WHERE id_persona=v_persona AND id_usuario<>v_id) THEN RAISE EXCEPTION 'TRABAJADOR_YA_VINCULADO'; END IF;
    UPDATE urh_votacion.usuario SET id_persona=v_persona WHERE id_usuario=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'USUARIO_INVALIDO'; END IF;
    RETURN jsonb_build_object('estado','VINCULADO');
  END IF;
  IF p_accion IN ('guardar_padron','asignar_trabajador','guardar_opcion') THEN
    v_id := nullif(p_datos->>'id_padron','')::integer;
    IF p_accion='guardar_padron' THEN
      v_evento := (p_datos->>'id_evento')::integer;
      IF NOT EXISTS(SELECT 1 FROM urh_votacion.segmento WHERE id_segmento=(p_datos->>'id_segmento')::integer) THEN RAISE EXCEPTION 'SEGMENTO_INVALIDO'; END IF;
    ELSE SELECT id_evento INTO v_evento FROM urh_votacion.padron WHERE id_padron=v_id; END IF;
    SELECT * INTO e FROM urh_votacion.evento WHERE id_evento=v_evento FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
    IF e.estado<>'BORRADOR' OR EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe JOIN urh_votacion.padron pa USING(id_padron) WHERE pa.id_evento=e.id_evento) THEN RAISE EXCEPTION 'CONFIGURACION_BLOQUEADA'; END IF;
    IF p_accion='guardar_padron' THEN
      IF coalesce(trim(p_datos->>'nom_padron'),'')='' THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA'; END IF;
      IF v_id IS NULL THEN INSERT INTO urh_votacion.padron(id_evento,id_segmento,nom_padron,dsc_padron) VALUES(v_evento,(p_datos->>'id_segmento')::integer,p_datos->>'nom_padron',p_datos->>'dsc_padron') RETURNING id_padron INTO v_id;
      ELSE UPDATE urh_votacion.padron SET id_segmento=(p_datos->>'id_segmento')::integer,nom_padron=p_datos->>'nom_padron',dsc_padron=p_datos->>'dsc_padron' WHERE id_padron=v_id AND id_evento=v_evento; IF NOT FOUND THEN RAISE EXCEPTION 'PADRON_INVALIDO'; END IF; END IF;
    ELSIF p_accion='asignar_trabajador' THEN
      v_persona := (p_datos->>'id_personal')::integer;
      IF NOT EXISTS(SELECT 1 FROM urh_votacion.personal WHERE id_personal=v_persona AND activo IS TRUE) THEN RAISE EXCEPTION 'TRABAJADOR_INVALIDO'; END IF;
      INSERT INTO urh_votacion.padron_detalle(id_padron,id_persona,habilitado) VALUES(v_id,v_persona,coalesce((p_datos->>'habilitado')::boolean,true))
        ON CONFLICT ON CONSTRAINT urh_padron_persona_unica DO UPDATE SET habilitado=excluded.habilitado;
    ELSE
      IF coalesce(trim(p_datos->>'nombre'),'')='' THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA'; END IF;
      IF coalesce(p_datos->>'tipo_opcion','CANDIDATURA') NOT IN ('CANDIDATURA','BLANCO','NULO') THEN RAISE EXCEPTION 'OPCION_INVALIDA'; END IF;
      IF nullif(p_datos->>'id_candidatura','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM urh_votacion.candidatura WHERE id_candidatura=(p_datos->>'id_candidatura')::integer AND id_evento=v_evento AND id_segmento=(SELECT id_segmento FROM urh_votacion.padron WHERE id_padron=v_id) AND estado='ACTIVA') THEN RAISE EXCEPTION 'CANDIDATURA_INVALIDA'; END IF;
      IF nullif(p_datos->>'id_opcion_electoral','') IS NULL THEN
        INSERT INTO urh_votacion.opcion_electoral(id_padron,id_candidatura,tipo_opcion,nombre,orden,activo) VALUES(v_id,nullif(p_datos->>'id_candidatura','')::integer,coalesce(p_datos->>'tipo_opcion','CANDIDATURA'),p_datos->>'nombre',(p_datos->>'orden')::integer,coalesce((p_datos->>'activo')::boolean,true));
      ELSE UPDATE urh_votacion.opcion_electoral SET id_candidatura=nullif(p_datos->>'id_candidatura','')::integer,tipo_opcion=coalesce(p_datos->>'tipo_opcion','CANDIDATURA'),nombre=p_datos->>'nombre',orden=(p_datos->>'orden')::integer,activo=coalesce((p_datos->>'activo')::boolean,true) WHERE id_opcion_electoral=(p_datos->>'id_opcion_electoral')::bigint AND id_padron=v_id; IF NOT FOUND THEN RAISE EXCEPTION 'OPCION_INVALIDA'; END IF; END IF;
    END IF;
    RETURN jsonb_build_object('estado','GUARDADO','id',v_id);
  END IF;
  IF p_accion IN ('preparar_foto','guardar_foto') THEN
    v_id := (p_datos->>'id_candidatura')::integer;
    SELECT id_evento INTO v_evento FROM urh_votacion.candidatura WHERE id_candidatura=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANDIDATURA_INVALIDA'; END IF;
    SELECT * INTO e FROM urh_votacion.evento WHERE id_evento=v_evento FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
    IF e.estado<>'BORRADOR' OR EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe JOIN urh_votacion.padron pa USING(id_padron) WHERE pa.id_evento=e.id_evento) THEN RAISE EXCEPTION 'CONFIGURACION_BLOQUEADA'; END IF;
    SELECT foto_key INTO v_estado FROM urh_votacion.candidatura WHERE id_candidatura=v_id FOR UPDATE;
    IF p_accion='guardar_foto' THEN
      IF coalesce(p_datos->>'foto_key','') NOT LIKE v_id::text||'/%'
         OR coalesce(p_datos->>'foto_url','') NOT LIKE 'https://%' THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA'; END IF;
      UPDATE urh_votacion.candidatura SET foto_url=p_datos->>'foto_url',foto_key=p_datos->>'foto_key' WHERE id_candidatura=v_id;
    END IF;
    RETURN jsonb_build_object('foto_anterior',v_estado);
  END IF;
  IF p_accion='guardar_candidatura' THEN
    v_evento := (p_datos->>'id_evento')::integer;
    SELECT * INTO e FROM urh_votacion.evento WHERE id_evento=v_evento FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
    IF e.estado<>'BORRADOR' OR EXISTS(SELECT 1 FROM urh_votacion.participacion_electoral pe JOIN urh_votacion.padron pa USING(id_padron) WHERE pa.id_evento=e.id_evento) THEN RAISE EXCEPTION 'CONFIGURACION_BLOQUEADA'; END IF;
    IF NOT EXISTS(SELECT 1 FROM urh_votacion.segmento WHERE id_segmento=(p_datos->>'id_segmento')::integer) THEN RAISE EXCEPTION 'SEGMENTO_INVALIDO'; END IF;
    v_id := nullif(p_datos->>'id_candidatura','')::integer;
    -- Mantener la persona al editar desde clientes anteriores que omiten el campo.
    IF p_datos ? 'id_persona' THEN
      v_persona := nullif(p_datos->>'id_persona','')::integer;
      IF v_persona IS NULL THEN RAISE EXCEPTION 'TRABAJADOR_INVALIDO'; END IF;
    ELSE
      SELECT id_persona INTO v_persona FROM urh_votacion.candidatura WHERE id_candidatura=v_id AND id_evento=v_evento;
    END IF;
    IF v_persona IS NOT NULL THEN
      SELECT concat_ws(' ',nombres,apellido_paterno,apellido_materno) INTO v_estado
        FROM urh_votacion.personal WHERE id_personal=v_persona AND activo IS TRUE FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TRABAJADOR_INVALIDO'; END IF;
      p_datos := jsonb_set(p_datos,'{dsc_nombre_completo}',to_jsonb(v_estado));
    END IF;
    IF coalesce(trim(p_datos->>'dsc_nombre_completo'),'')='' THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA'; END IF;
    IF v_id IS NULL THEN INSERT INTO urh_votacion.candidatura(id_evento,id_persona,id_segmento,dsc_nombre_completo,dsc_cargo,dsc_unidad,estado,fecha_registro) VALUES(v_evento,v_persona,(p_datos->>'id_segmento')::integer,p_datos->>'dsc_nombre_completo',p_datos->>'dsc_cargo',p_datos->>'dsc_unidad',coalesce(p_datos->>'estado','ACTIVA'),now()) RETURNING id_candidatura INTO v_id;
    ELSE UPDATE urh_votacion.candidatura SET id_persona=v_persona,id_segmento=(p_datos->>'id_segmento')::integer,dsc_nombre_completo=p_datos->>'dsc_nombre_completo',dsc_cargo=p_datos->>'dsc_cargo',dsc_unidad=CASE WHEN p_datos ? 'dsc_unidad' THEN p_datos->>'dsc_unidad' ELSE dsc_unidad END,estado=coalesce(p_datos->>'estado','ACTIVA') WHERE id_candidatura=v_id AND id_evento=v_evento; IF NOT FOUND THEN RAISE EXCEPTION 'CANDIDATURA_INVALIDA'; END IF; END IF;
    RETURN jsonb_build_object('id',v_id);
  END IF;
  IF p_accion IN ('participacion','resultados') THEN
    SELECT * INTO p FROM urh_votacion.padron WHERE id_padron=(p_datos->>'id_padron')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'PADRON_INVALIDO'; END IF;
    IF p_accion='participacion' THEN
      RETURN jsonb_build_object('habilitados',(SELECT count(*) FROM urh_votacion.padron_detalle WHERE id_padron=p.id_padron AND habilitado IS TRUE),
        'participantes',(SELECT count(*) FROM urh_votacion.participacion_electoral WHERE id_padron=p.id_padron),
        'detalle',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',concat_ws(' ',per.nombres,per.apellido_paterno,per.apellido_materno),'ya_voto',pe.id_participacion IS NOT NULL))
          FROM urh_votacion.padron_detalle pd JOIN urh_votacion.personal per ON per.id_personal=pd.id_persona LEFT JOIN urh_votacion.participacion_electoral pe ON pe.id_padron_detalle=pd.id_padron_detalle AND pe.id_padron=pd.id_padron WHERE pd.id_padron=p.id_padron AND pd.habilitado IS TRUE),'[]'::jsonb));
    END IF;
    SELECT * INTO e FROM urh_votacion.evento WHERE id_evento=p.id_evento;
    IF e.estado<>'CERRADO' THEN RAISE EXCEPTION 'RESULTADOS_NO_DISPONIBLES'; END IF;
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT op.id_opcion_electoral,op.nombre,op.tipo_opcion,count(v.id_voto) AS votos
      FROM urh_votacion.opcion_electoral op LEFT JOIN urh_votacion.voto v ON v.id_opcion_electoral=op.id_opcion_electoral AND v.id_padron=op.id_padron
      WHERE op.id_padron=p.id_padron GROUP BY op.id_opcion_electoral,op.nombre,op.tipo_opcion,op.orden ORDER BY votos DESC,op.orden) x),'[]'::jsonb);
  END IF;
  RAISE EXCEPTION 'OPERACION_INVALIDA';
END;
$$;
NOTIFY pgrst,'reload schema';
