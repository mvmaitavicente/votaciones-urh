import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const object=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
async function database(){const db=new PGlite();await db.exec(fs.readFileSync('tests/fixtures/electoral-schema.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012080000_urh-functional.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012180000_candidatura-persona.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012190000_candidatura-unidad.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012200000_candidatura-foto.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012210000_opciones-unidad.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012220000_evento-subtitulo-mensaje-elector.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012230000_fecha-voto-mis-padrones.sql','utf8'));await db.exec(fs.readFileSync('tests/fixtures/electoral-rpc-before-provisional.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012230001_resultados-provisionales-admin.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261013010000_participacion-detalle-personas.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261013020000_resultados-total-evento.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261013030000_rol-supervisor-resultados.sql','utf8'));
  await db.exec("INSERT INTO urh_votacion.rol(codigo) VALUES('ADMINISTRADOR'),('ELECTOR'); INSERT INTO urh_votacion.dependencia(dsc_dependencia) VALUES('Oficina ficticia'); INSERT INTO urh_votacion.personal(nombres,activo) VALUES('Admin ficticio',true),('Elector ficticio',true),('Ambos ficticio',true); UPDATE urh_votacion.personal SET correo_institucional='elector@example.test',id_dependencia=1 WHERE id_personal=2");
  for(let n=1;n<=5;n++)await db.query('INSERT INTO urh_votacion.usuario(id_object,id_tenant,nombre,activo,id_persona) VALUES($1,$2,$3,$4,$5)',[object(n),tenant,'Cuenta ficticia '+n,n!==4,n<=3?n:null]);
  await db.exec("INSERT INTO urh_votacion.usuario_rol(id_usuario,id_rol) SELECT v.id_usuario,r.id_rol FROM (VALUES(1,'ADMINISTRADOR'),(2,'ELECTOR'),(3,'ADMINISTRADOR'),(3,'ELECTOR'),(4,'ELECTOR')) v(id_usuario,codigo) JOIN urh_votacion.rol r ON r.codigo=v.codigo");
  return db}
const call=async(db,n,action,data={})=>(await db.query('SELECT urh_votacion.urh_operacion($1::uuid,$2::uuid,$3,$4::jsonb) AS result',[object(n),tenant,action,JSON.stringify(data)])).rows[0].result
async function election(db){
  const event=await call(db,1,'guardar_evento',{dsc_evento:'Evento ficticio',dsc_sub_titulo:'Subtítulo ficticio',dsc_mensaje:'Indicaciones ficticias',estado:'BORRADOR'});
  const segment=await call(db,1,'guardar_segmento',{dsc_segmento:'Categoría',ord_segmento:1});
  const padron=await call(db,1,'guardar_padron',{id_evento:event.id,id_segmento:segment.id,nom_padron:'Padrón ficticio'});
  await call(db,1,'asignar_trabajador',{id_padron:padron.id,id_personal:2,habilitado:true});
  const candidate=await call(db,1,'guardar_candidatura',{id_evento:event.id,id_segmento:segment.id,dsc_nombre_completo:'Candidatura ficticia',estado:'ACTIVA'});
  await call(db,1,'guardar_opcion',{id_padron:padron.id,id_candidatura:candidate.id,tipo_opcion:'CANDIDATURA',nombre:'Opción A',orden:1,activo:true});
  const option=(await db.query('SELECT id_opcion_electoral FROM urh_votacion.opcion_electoral')).rows[0].id_opcion_electoral;
  const inicio=new Date(Date.now()-3600000).toISOString(),fin=new Date(Date.now()+3600000).toISOString();
  await call(db,1,'guardar_evento',{id_evento:event.id,dsc_evento:'Evento ficticio',dsc_sub_titulo:'Subtítulo ficticio',dsc_mensaje:'Indicaciones ficticias',estado:'ABIERTO',fecha_inicio:inicio,fecha_fin:fin});
  return{event:event.id,padron:padron.id,option,candidate:candidate.id,inicio,fin}}

test('Resultados provisionales: configuración previa, conteo actualizado y acceso exclusivo del administrador',async()=>{const db=await database();try{
  const e=await election(db);
  const event={id_evento:e.event,dsc_evento:'Evento ficticio',fecha_inicio:e.inicio,fecha_fin:e.fin};
  await assert.rejects(call(db,1,'guardar_evento',{...event,estado:'ABIERTO',resultados_en_vivo:true}),/CONFIGURACION_BLOQUEADA/);
  await call(db,1,'guardar_evento',{...event,estado:'BORRADOR'});
  await call(db,1,'guardar_evento',{...event,estado:'BORRADOR',resultados_en_vivo:true});
  await assert.rejects(call(db,1,'resultados',{id_padron:e.padron}),/RESULTADOS_NO_DISPONIBLES/);
  await call(db,1,'guardar_evento',{...event,estado:'ABIERTO'});
  assert.equal((await call(db,1,'administracion')).eventos[0].resultados_en_vivo,true);
  assert.equal((await call(db,1,'resultados',{id_padron:e.padron}))[0].votos,0);
  await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option});
  assert.equal((await call(db,1,'resultados',{id_padron:e.padron}))[0].votos,1);
  assert.equal((await call(db,3,'resultados',{id_padron:e.padron}))[0].votos,1);
  await assert.rejects(call(db,2,'resultados',{id_padron:e.padron}),/PERMISO_INSUFICIENTE/);
  await assert.rejects(call(db,2,'resultados_publicos',{id_padron:e.padron}),/RESULTADOS_NO_DISPONIBLES/);
  await assert.rejects(call(db,1,'guardar_evento',{...event,estado:'ABIERTO',resultados_en_vivo:false}),/CONFIGURACION_BLOQUEADA/);
  await call(db,1,'guardar_evento',{...event,estado:'CERRADO'});
  assert.equal((await call(db,1,'resultados',{id_padron:e.padron}))[0].votos,1);
  await assert.rejects(call(db,2,'resultados_publicos',{id_padron:e.padron}),/RESULTADOS_NO_DISPONIBLES/);
}finally{await db.close()}})

test('Detalle de participación: datos de personas, pendientes y participantes sin elección de voto',async()=>{const db=await database();try{
  const e=await election(db);
  await db.query('INSERT INTO urh_votacion.padron_detalle(id_padron,id_persona,habilitado) VALUES($1,3,true)',[e.padron]);
  const before=await call(db,1,'participacion',{id_padron:e.padron});
  assert.equal(before.habilitados,2);assert.equal(before.participantes,0);assert.equal(before.detalle.length,2);
  const elector=before.detalle.find(p=>p.nombre==='Elector ficticio');
  assert.equal(elector.unidad_organica,'Oficina ficticia');assert.equal(elector.correo,'elector@example.test');assert.equal(elector.segmento,'Categoría');assert.equal(elector.ya_voto,false);assert.ok(elector.id_padron_detalle);
  const other=before.detalle.find(p=>p.nombre==='Ambos ficticio');assert.equal(other.unidad_organica,null);assert.equal(other.correo,null);
  await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option});
  const after=await call(db,1,'participacion',{id_padron:e.padron});
  assert.equal(after.participantes,1);assert.equal(after.detalle.filter(p=>p.ya_voto).length,1);assert.equal(after.detalle.filter(p=>!p.ya_voto).length,1);
  assert.deepEqual(Object.keys(after.detalle[0]).sort(),['correo','id_padron_detalle','nombre','segmento','unidad_organica','ya_voto']);
  await assert.rejects(call(db,2,'participacion',{id_padron:e.padron}),/PERMISO_INSUFICIENTE/);
}finally{await db.close()}})

test('Total del evento agrega segmentos sin multiplicar electores por opciones y no filtra identidad al resumen',async()=>{const db=await database();try{
  const e=await election(db);
  const sg=await call(db,1,'guardar_segmento',{dsc_segmento:'Segundo segmento',ord_segmento:2});
  const pa=(await db.query('INSERT INTO urh_votacion.padron(id_evento,id_segmento,nom_padron) VALUES($1,$2,$3) RETURNING id_padron',[e.event,sg.id,'Segundo padrón'])).rows[0].id_padron;
  await db.query('INSERT INTO urh_votacion.padron_detalle(id_padron,id_persona,habilitado) VALUES($1,3,true),($1,1,false)',[pa]);
  await db.query("INSERT INTO urh_votacion.opcion_electoral(id_padron,tipo_opcion,nombre,orden,activo) VALUES($1,'BLANCO','Blanco',2,true)",[e.padron]);
  const request={id_evento:e.event,modo:'resumen'};
  let total=await call(db,1,'participacion',request);
  assert.equal(total.version,1);assert.equal(total.habilitados,2);assert.equal(total.participantes,0);assert.equal(total.segmentos.length,2);assert.equal(total.resultados_disponibles,false);
  assert.equal(total.segmentos[0].nombre,'Categoría');assert.equal(total.segmentos[1].nombre,'Segundo segmento');
  assert.deepEqual(total.segmentos.flatMap(s=>s.resultados),[]);assert.equal('detalle' in total,false);
  await assert.rejects(call(db,2,'participacion',request),/PERMISO_INSUFICIENTE/);
  await assert.rejects(call(db,1,'participacion',{id_evento:-1,modo:'resumen'}),/EVENTO_INVALIDO/);
  await call(db,1,'guardar_evento',{id_evento:e.event,dsc_evento:'Evento ficticio',estado:'BORRADOR',fecha_inicio:e.inicio,fecha_fin:e.fin});
  await call(db,1,'guardar_evento',{id_evento:e.event,dsc_evento:'Evento ficticio',estado:'ABIERTO',fecha_inicio:e.inicio,fecha_fin:e.fin,resultados_en_vivo:true});
  await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option});
  total=await call(db,1,'participacion',request);
  assert.equal(total.habilitados,2);assert.equal(total.participantes,1);assert.equal(total.resultados_disponibles,true);
  assert.equal(total.segmentos[0].participantes,1);assert.equal(total.segmentos[1].participantes,0);
  assert.equal(total.segmentos[0].resultados.find(r=>r.tipo_opcion==='CANDIDATURA').votos,1);
  assert.equal(total.segmentos[0].resultados.find(r=>r.tipo_opcion==='BLANCO').votos,0);
  const people=await call(db,1,'participacion',{id_evento:e.event,modo:'personas'});
  assert.equal(people.detalle.length,2);assert.equal(people.detalle.filter(p=>p.ya_voto).length,1);
  assert.equal(people.detalle.find(p=>p.nombre==='Ambos ficticio').segmento,'Segundo segmento');
  await assert.rejects(call(db,2,'participacion',{id_evento:e.event,modo:'personas'}),/PERMISO_INSUFICIENTE/);
  const emptyEvent=await call(db,1,'guardar_evento',{dsc_evento:'Otro evento sin padrones',estado:'BORRADOR'});
  const emptySummary=await call(db,1,'participacion',{id_evento:emptyEvent.id,modo:'resumen'});
  assert.equal(emptySummary.habilitados,0);assert.equal(emptySummary.participantes,0);assert.deepEqual(emptySummary.segmentos,[]);
  assert.equal((await call(db,1,'participacion',request)).habilitados,2);
  await assert.rejects(call(db,1,'participacion',{id_evento:e.event,modo:'otro'}),/SOLICITUD_INVALIDA/);
}finally{await db.close()}})

test('SUPERVISOR consulta Resultados y participación pero no administra; combinado con ELECTOR puede votar',async()=>{const db=await database();try{
  const e=await election(db);
  const role=(await db.query("SELECT id_rol FROM urh_votacion.rol WHERE codigo='SUPERVISOR'")).rows[0].id_rol;
  await db.query('INSERT INTO urh_votacion.usuario_rol(id_usuario,id_rol) VALUES(5,$1)',[role]);
  assert.deepEqual((await call(db,5,'verificar_acceso')).roles,['SUPERVISOR']);
  const catalog=await call(db,5,'administracion',{vista:'resultados'});
  assert.deepEqual(Object.keys(catalog).sort(),['eventos','opciones','padrones','segmentos']);
  assert.deepEqual(Object.keys(catalog.opciones[0]).sort(),['foto_url','id_opcion_electoral']);
  assert.equal((await call(db,5,'participacion',{id_padron:e.padron})).habilitados,1);
  assert.equal((await call(db,5,'participacion',{id_evento:e.event,modo:'resumen'})).habilitados,1);
  assert.equal((await call(db,5,'participacion',{id_evento:e.event,modo:'personas'})).detalle.length,1);
  await assert.rejects(call(db,5,'resultados',{id_padron:e.padron}),/RESULTADOS_NO_DISPONIBLES/);
  for(const action of ['administracion','guardar_evento','guardar_segmento','guardar_padron','asignar_trabajador','vincular_usuario','guardar_opcion','guardar_candidatura','guardar_foto','preparar_foto','emitir_voto'])await assert.rejects(call(db,5,action),/PERMISO_INSUFICIENTE/);
  await assert.rejects(call(db,2,'administracion',{vista:'resultados'}),/PERMISO_INSUFICIENTE/);
  await db.query('INSERT INTO urh_votacion.usuario_rol(id_usuario,id_rol) VALUES(2,$1)',[role]);
  assert.deepEqual((await call(db,2,'verificar_acceso')).roles.sort(),['ELECTOR','SUPERVISOR']);
  assert.equal((await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option})).estado,'VOTO_REGISTRADO');
  await assert.rejects(call(db,2,'guardar_evento'),/PERMISO_INSUFICIENTE/);
  await call(db,1,'guardar_evento',{id_evento:e.event,dsc_evento:'Evento ficticio',estado:'CERRADO',fecha_inicio:e.inicio,fecha_fin:e.fin});
  assert.equal((await call(db,5,'resultados',{id_padron:e.padron}))[0].votos,1);
  await db.query('UPDATE urh_votacion.usuario SET activo=false WHERE id_usuario=5');
  await assert.rejects(call(db,5,'participacion',{id_padron:e.padron}),/SIN_ACCESO/);
}finally{await db.close()}})

test('Roles, activo, inexistente y usuario sin roles en PostgreSQL real embebido',async()=>{const db=await database();try{
  assert.deepEqual((await call(db,1,'verificar_acceso')).roles,['ADMINISTRADOR']);assert.deepEqual((await call(db,2,'verificar_acceso')).roles,['ELECTOR']);assert.deepEqual((await call(db,3,'verificar_acceso')).roles.sort(),['ADMINISTRADOR','ELECTOR']);
  await assert.rejects(call(db,4,'verificar_acceso'),/SIN_ACCESO/);await assert.rejects(call(db,99,'verificar_acceso'),/SIN_ACCESO/);await assert.rejects(call(db,5,'verificar_acceso'),/SIN_ROLES/);
  await assert.rejects(call(db,2,'administracion'),/PERMISO_INSUFICIENTE/);
}finally{await db.close()}})
test('Administración, eventos habilitados, opciones y primer/segundo voto atómico',async()=>{const db=await database();try{const e=await election(db);
  const padrones=await call(db,2,'mis_padrones');assert.equal(padrones.length,1);assert.equal(padrones[0].disponible,true);assert.equal(padrones[0].ya_voto,false);assert.equal(padrones[0].dsc_sub_titulo,'Subtítulo ficticio');assert.equal(padrones[0].dsc_mensaje,'Indicaciones ficticias');assert.equal(padrones[0].nombre_completo,'Elector ficticio');assert.equal(padrones[0].unidad_organica,'Oficina ficticia');assert.equal(padrones[0].correo,'elector@example.test');
  assert.equal((await call(db,2,'opciones',{id_padron:e.padron})).length,1);
  assert.equal((await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option})).estado,'VOTO_REGISTRADO');
  assert.equal((await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option})).estado,'YA_VOTO');
  assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.voto')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.participacion_electoral')).rows[0].n,1);
  assert.equal((await db.query('SELECT id_participacion FROM urh_votacion.voto')).rows[0].id_participacion,null);
  assert.equal((await call(db,2,'estado_participacion',{id_padron:e.padron})).ya_voto,true);
  const votado=(await call(db,2,'mis_padrones'))[0];assert.equal(votado.ya_voto,true);assert.ok(votado.fecha_voto&&!Number.isNaN(Date.parse(votado.fecha_voto)))
  await assert.rejects(call(db,1,'resultados',{id_padron:e.padron}),/RESULTADOS_NO_DISPONIBLES/);
  await call(db,1,'guardar_evento',{id_evento:e.event,dsc_evento:'Evento ficticio',estado:'CERRADO',fecha_inicio:e.inicio,fecha_fin:e.fin});
  assert.equal((await call(db,1,'resultados',{id_padron:e.padron}))[0].votos,1);
  assert.equal((await call(db,1,'participacion',{id_padron:e.padron})).participantes,1);
  await assert.rejects(call(db,2,'resultados_publicos',{id_padron:e.padron}),/RESULTADOS_NO_DISPONIBLES/);
  await call(db,1,'guardar_evento',{id_evento:e.event,dsc_evento:'Evento ficticio',estado:'CERRADO',fecha_inicio:e.inicio,fecha_fin:e.fin,resultados_publicados:true});
  assert.equal((await call(db,2,'resultados_publicos',{id_padron:e.padron}))[0].votos,1);
  await assert.rejects(call(db,1,'vincular_usuario',{id_usuario:2,id_personal:1}),/PROCESO_CON_PARTICIPACION/);
}finally{await db.close()}})
test('Dos solicitudes simultáneas de cliente no producen dos votos (PGlite serializa conexiones)',async()=>{const db=await database();try{const e=await election(db);const answers=await Promise.all([call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option}),call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option})]);assert.deepEqual(answers.map(a=>a.estado).sort(),['VOTO_REGISTRADO','YA_VOTO']);assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.voto')).rows[0].n,1)}finally{await db.close()}})
test('Fallo durante INSERT voto revierte la participación y no deja filas parciales',async()=>{const db=await database();try{const e=await election(db);
  await db.exec("CREATE FUNCTION urh_votacion.test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_STORAGE_FAILURE'; END $$; CREATE TRIGGER fail_vote BEFORE INSERT ON urh_votacion.voto FOR EACH ROW EXECUTE FUNCTION urh_votacion.test_failure()");
  await assert.rejects(call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option}),/TEST_STORAGE_FAILURE/);
  assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.participacion_electoral')).rows[0].n,0);assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.voto')).rows[0].n,0);
}finally{await db.close()}})
test('Elector no habilitado, evento cerrado y opción/candidatura inválida se rechazan',async()=>{const db=await database();try{const e=await election(db);
  await assert.rejects(call(db,3,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option}),/ELECTOR_NO_HABILITADO/);
  await assert.rejects(call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:9999}),/OPCION_INVALIDA/);
  await db.query("UPDATE urh_votacion.candidatura SET estado='INACTIVA' WHERE id_candidatura=$1",[e.candidate]);await assert.rejects(call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option}),/CANDIDATURA_INVALIDA/);
  await call(db,1,'guardar_evento',{id_evento:e.event,dsc_evento:'Evento ficticio',estado:'CERRADO',fecha_inicio:e.inicio,fecha_fin:e.fin});await assert.rejects(call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option}),/EVENTO_CERRADO/);
}finally{await db.close()}})
test('UNIQUE de padrón/persona y bloqueo de configuración abierta están en SQL',async()=>{const db=await database();try{const e=await election(db);await assert.rejects(call(db,1,'asignar_trabajador',{id_padron:e.padron,id_personal:3,habilitado:true}),/CONFIGURACION_BLOQUEADA/);await assert.rejects(db.query('INSERT INTO urh_votacion.padron_detalle(id_padron,id_persona,habilitado) VALUES($1,2,true)',[e.padron]),/urh_padron_persona_unica/)}finally{await db.close()}})


test('Candidatura vinculada usa nombre real y valida trabajador, permisos y estado del evento',async()=>{
 const db=await database()
 try {
  const e=await call(db,1,'guardar_evento',{dsc_evento:'Candidatos',estado:'BORRADOR'})
  const seg=await call(db,1,'guardar_segmento',{dsc_segmento:'Segmento',ord_segmento:1})
  const data={id_evento:e.id,id_segmento:seg.id,id_persona:2,dsc_nombre_completo:'Nombre falsificado',dsc_unidad:'Unidad inicial',estado:'ACTIVA'}
  const c=await call(db,1,'guardar_candidatura',data)
  let row=(await call(db,1,'administracion')).candidaturas.find(ca=>ca.id_candidatura===c.id)
  assert.equal(row.id_persona,2)
  assert.equal(row.dsc_unidad,'Unidad inicial')
  assert.equal(row.dsc_nombre_completo,'Elector ficticio')
  await call(db,1,'guardar_candidatura',{...data,id_candidatura:c.id,id_persona:3,dsc_unidad:'Unidad editada'})
  row=(await call(db,1,'administracion')).candidaturas.find(ca=>ca.id_candidatura===c.id)
  assert.equal(row.id_persona,3)
  assert.equal(row.dsc_unidad,'Unidad editada')
  assert.equal(row.dsc_nombre_completo,'Ambos ficticio')
  const legacy={...data,id_candidatura:c.id};delete legacy.id_persona;delete legacy.dsc_unidad
  await call(db,1,'guardar_candidatura',legacy)
  assert.equal((await call(db,1,'administracion')).candidaturas.find(ca=>ca.id_candidatura===c.id).id_persona,3)
  assert.equal((await call(db,1,'administracion')).candidaturas.find(ca=>ca.id_candidatura===c.id).dsc_unidad,'Unidad editada')
  await call(db,1,'guardar_candidatura',{...data,id_candidatura:c.id,dsc_unidad:null})
  assert.equal((await call(db,1,'administracion')).candidaturas.find(ca=>ca.id_candidatura===c.id).dsc_unidad,null)
  for(const id_persona of [null,99999])await assert.rejects(call(db,1,'guardar_candidatura',{...data,id_persona}),/TRABAJADOR_INVALIDO/)
  await db.exec('UPDATE urh_votacion.personal SET activo=false WHERE id_personal=2')
  await assert.rejects(call(db,1,'guardar_candidatura',data),/TRABAJADOR_INVALIDO/)
  await assert.rejects(call(db,2,'guardar_candidatura',{...data,id_persona:3}),/PERMISO_INSUFICIENTE/)
  await db.exec("UPDATE urh_votacion.evento SET estado='ABIERTO'")
  await assert.rejects(call(db,1,'guardar_candidatura',{...data,id_persona:3}),/CONFIGURACION_BLOQUEADA/)
 }finally{await db.close()}
})


test('Foto exige administrador, candidatura valida y evento borrador',async()=>{
 const db=await database()
 try{
  const e=await call(db,1,'guardar_evento',{dsc_evento:'Foto',estado:'BORRADOR'})
  const seg=await call(db,1,'guardar_segmento',{dsc_segmento:'Foto',ord_segmento:1})
  const c=await call(db,1,'guardar_candidatura',{id_evento:e.id,id_segmento:seg.id,id_persona:2,estado:'ACTIVA'})
  const data={id_candidatura:c.id,foto_url:'https://example.com/photo.png',foto_key:c.id+'/photo.png'}
  await assert.rejects(call(db,2,'preparar_foto',data),/PERMISO_INSUFICIENTE/)
  await assert.rejects(call(db,2,'guardar_foto',data),/PERMISO_INSUFICIENTE/)
  await call(db,1,'guardar_foto',data)
  assert.equal((await call(db,1,'administracion')).candidaturas.find(x=>x.id_candidatura===c.id).foto_url,data.foto_url)
  assert.equal((await call(db,1,'preparar_foto',data)).foto_anterior,data.foto_key)
  await assert.rejects(call(db,1,'guardar_foto',{...data,foto_key:'otro/foto.png'}),/SOLICITUD_INVALIDA/)
  await db.exec("UPDATE urh_votacion.evento SET estado='ABIERTO'")
  await assert.rejects(call(db,1,'guardar_foto',data),/CONFIGURACION_BLOQUEADA/)
 }finally{await db.close()}
})
