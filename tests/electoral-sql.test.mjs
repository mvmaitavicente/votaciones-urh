import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const object=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
async function database(){const db=new PGlite();await db.exec(fs.readFileSync('tests/fixtures/electoral-schema.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261012080000_urh-functional.sql','utf8'));
  await db.exec("INSERT INTO urh_votacion.rol(codigo) VALUES('ADMINISTRADOR'),('ELECTOR'); INSERT INTO urh_votacion.personal(nombres,activo) VALUES('Admin ficticio',true),('Elector ficticio',true),('Ambos ficticio',true)");
  for(let n=1;n<=5;n++)await db.query('INSERT INTO urh_votacion.usuario(id_object,id_tenant,nombre,activo,id_persona) VALUES($1,$2,$3,$4,$5)',[object(n),tenant,'Cuenta ficticia '+n,n!==4,n<=3?n:null]);
  await db.exec('INSERT INTO urh_votacion.usuario_rol(id_usuario,id_rol) VALUES(1,1),(2,2),(3,1),(3,2),(4,2)');
  return db}
const call=async(db,n,action,data={})=>(await db.query('SELECT urh_votacion.urh_operacion($1::uuid,$2::uuid,$3,$4::jsonb) AS result',[object(n),tenant,action,JSON.stringify(data)])).rows[0].result
async function election(db){
  const event=await call(db,1,'guardar_evento',{dsc_evento:'Evento ficticio',estado:'BORRADOR'});
  const segment=await call(db,1,'guardar_segmento',{dsc_segmento:'Categoría',ord_segmento:1});
  const padron=await call(db,1,'guardar_padron',{id_evento:event.id,id_segmento:segment.id,nom_padron:'Padrón ficticio'});
  await call(db,1,'asignar_trabajador',{id_padron:padron.id,id_personal:2,habilitado:true});
  const candidate=await call(db,1,'guardar_candidatura',{id_evento:event.id,id_segmento:segment.id,dsc_nombre_completo:'Candidatura ficticia',estado:'ACTIVA'});
  await call(db,1,'guardar_opcion',{id_padron:padron.id,id_candidatura:candidate.id,tipo_opcion:'CANDIDATURA',nombre:'Opción A',orden:1,activo:true});
  const option=(await db.query('SELECT id_opcion_electoral FROM urh_votacion.opcion_electoral')).rows[0].id_opcion_electoral;
  const inicio=new Date(Date.now()-3600000).toISOString(),fin=new Date(Date.now()+3600000).toISOString();
  await call(db,1,'guardar_evento',{id_evento:event.id,dsc_evento:'Evento ficticio',estado:'ABIERTO',fecha_inicio:inicio,fecha_fin:fin});
  return{event:event.id,padron:padron.id,option,candidate:candidate.id,inicio,fin}}

test('Roles, activo, inexistente y usuario sin roles en PostgreSQL real embebido',async()=>{const db=await database();try{
  assert.deepEqual((await call(db,1,'verificar_acceso')).roles,['ADMINISTRADOR']);assert.deepEqual((await call(db,2,'verificar_acceso')).roles,['ELECTOR']);assert.deepEqual((await call(db,3,'verificar_acceso')).roles.sort(),['ADMINISTRADOR','ELECTOR']);
  await assert.rejects(call(db,4,'verificar_acceso'),/SIN_ACCESO/);await assert.rejects(call(db,99,'verificar_acceso'),/SIN_ACCESO/);await assert.rejects(call(db,5,'verificar_acceso'),/SIN_ROLES/);
  await assert.rejects(call(db,2,'administracion'),/PERMISO_INSUFICIENTE/);
}finally{await db.close()}})
test('Administración, eventos habilitados, opciones y primer/segundo voto atómico',async()=>{const db=await database();try{const e=await election(db);
  const padrones=await call(db,2,'mis_padrones');assert.equal(padrones.length,1);assert.equal(padrones[0].disponible,true);assert.equal(padrones[0].ya_voto,false);
  assert.equal((await call(db,2,'opciones',{id_padron:e.padron})).length,1);
  assert.equal((await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option})).estado,'VOTO_REGISTRADO');
  assert.equal((await call(db,2,'emitir_voto',{id_padron:e.padron,id_opcion_electoral:e.option})).estado,'YA_VOTO');
  assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.voto')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*) AS n FROM urh_votacion.participacion_electoral')).rows[0].n,1);
  assert.equal((await db.query('SELECT id_participacion FROM urh_votacion.voto')).rows[0].id_participacion,null);
  assert.equal((await call(db,2,'estado_participacion',{id_padron:e.padron})).ya_voto,true);
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
