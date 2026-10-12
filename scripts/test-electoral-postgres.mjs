// Prueba real en PRONIED: solo cuentas/eventos ficticios creados aquí, limpieza por sus PK.
import postgres from 'postgres'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
const url=process.env.URH_MIGRATION_DATABASE_URL
if(!url||!new URL(url).hostname.includes('feiztkc9'))throw new Error('PROJECT_MISMATCH')
const sql=postgres(url,{ssl:{rejectUnauthorized:true},max:3,connect_timeout:5,onnotice:()=>{}})
const tenant=randomUUID(),objects=Array.from({length:5},()=>randomUUID())
const users=[],people=[];let eventId,padronId,segmentId;const checks=[]
const op=async(connection,index,action,data={})=>(await connection`SELECT urh_votacion.urh_operacion(${objects[index]}::uuid,${tenant}::uuid,${action},${connection.json(data)}) AS result`)[0].result
try{
  await sql.begin(async tx=>{
    const roles=await tx`SELECT id_rol,codigo FROM urh_votacion.rol WHERE codigo IN ('ADMINISTRADOR','ELECTOR')`
    for(let n=0;n<5;n++){
      const [person]=await tx`INSERT INTO urh_votacion.personal(nombres,activo) VALUES('URH PRUEBA TRANSACCIONAL',true) RETURNING id_personal`;people.push(person.id_personal)
      const [user]=await tx`INSERT INTO urh_votacion.usuario(id_object,id_tenant,nombre,activo,id_persona) VALUES(${objects[n]},${tenant},'URH CUENTA FICTICIA',${n!==3},${person.id_personal}) RETURNING id_usuario`;users.push(user.id_usuario)
      const codes=n===0?['ADMINISTRADOR']:n===1||n===3?['ELECTOR']:n===2?['ADMINISTRADOR','ELECTOR']:[]
      for(const code of codes)await tx`INSERT INTO urh_votacion.usuario_rol(id_usuario,id_rol) VALUES(${user.id_usuario},${roles.find(r=>r.codigo===code).id_rol})`
    }
  })
  for(const [n,roles] of [[0,['ADMINISTRADOR']],[1,['ELECTOR']],[2,['ADMINISTRADOR','ELECTOR']]])assert.deepEqual((await op(sql,n,'verificar_acceso')).roles.sort(),roles)
  await assert.rejects(op(sql,3,'verificar_acceso'),/SIN_ACCESO/);await assert.rejects(op(sql,4,'verificar_acceso'),/SIN_ROLES/)
  checks.push('roles/activo/sin roles')
  eventId=(await op(sql,0,'guardar_evento',{dsc_evento:'URH EVENTO DE PRUEBA TRANSACCIONAL',estado:'BORRADOR'})).id
  segmentId=(await op(sql,0,'guardar_segmento',{dsc_segmento:'URH SEGMENTO FICTICIO',ord_segmento:999})).id
  padronId=(await op(sql,0,'guardar_padron',{id_evento:eventId,id_segmento:segmentId,nom_padron:'URH PADRON FICTICIO'})).id
  await op(sql,0,'asignar_trabajador',{id_padron:padronId,id_personal:people[1],habilitado:true})
  const candidateId=(await op(sql,0,'guardar_candidatura',{id_evento:eventId,id_segmento:segmentId,dsc_nombre_completo:'CANDIDATURA FICTICIA',estado:'ACTIVA'})).id
  await op(sql,0,'guardar_opcion',{id_padron:padronId,id_candidatura:candidateId,tipo_opcion:'CANDIDATURA',nombre:'OPCION FICTICIA',orden:1,activo:true})
  const [option]=await sql`SELECT id_opcion_electoral FROM urh_votacion.opcion_electoral WHERE id_padron=${padronId}`
  const dates={fecha_inicio:new Date(Date.now()-3600000).toISOString(),fecha_fin:new Date(Date.now()+3600000).toISOString()}
  await op(sql,0,'guardar_evento',{id_evento:eventId,dsc_evento:'URH EVENTO DE PRUEBA TRANSACCIONAL',estado:'ABIERTO',...dates})
  await assert.rejects(op(sql,2,'emitir_voto',{id_padron:padronId,id_opcion_electoral:option.id_opcion_electoral}),/ELECTOR_NO_HABILITADO/)
  const suffix=randomUUID().replaceAll('-','').slice(0,12)
  try{await sql.begin(async tx=>{
    await tx.unsafe(`CREATE FUNCTION urh_votacion.test_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id_padron=${Number(padronId)} THEN RAISE EXCEPTION 'URH_TEST_STORAGE_FAILURE'; END IF; RETURN NEW; END $$`)
    await tx.unsafe(`CREATE TRIGGER test_fail_${suffix} BEFORE INSERT ON urh_votacion.voto FOR EACH ROW EXECUTE FUNCTION urh_votacion.test_fail_${suffix}()`)
    await assert.rejects(tx.savepoint(sub=>op(sub,1,'emitir_voto',{id_padron:padronId,id_opcion_electoral:option.id_opcion_electoral})),/URH_TEST_STORAGE_FAILURE/)
    const [count]=await tx`SELECT count(*)::int AS n FROM urh_votacion.participacion_electoral WHERE id_padron=${padronId}`;assert.equal(count.n,0)
    throw new Error('ROLLBACK_TEST_DDL')
  })}catch(error){if(error.message!=='ROLLBACK_TEST_DDL')throw error}
  checks.push('fallo de almacenamiento revierte participación; trigger revertido')
  const results=await Promise.all([0,1].map(()=>sql.begin(async tx=>{const [pid]=await tx`SELECT pg_backend_pid() AS pid`;return{pid:pid.pid,result:await op(tx,1,'emitir_voto',{id_padron:padronId,id_opcion_electoral:option.id_opcion_electoral})}})))
  assert.equal(new Set(results.map(r=>r.pid)).size,2)
  assert.deepEqual(results.map(r=>r.result.estado).sort(),['VOTO_REGISTRADO','YA_VOTO'])
  const [counts]=await sql`SELECT (SELECT count(*)::int FROM urh_votacion.voto WHERE id_padron=${padronId}) AS votos,(SELECT count(*)::int FROM urh_votacion.participacion_electoral WHERE id_padron=${padronId}) AS participantes`
  assert.equal(counts.votos,1);assert.equal(counts.participantes,1)
  checks.push('dos conexiones concurrentes -> un voto y una participación')
  await op(sql,0,'guardar_evento',{id_evento:eventId,dsc_evento:'URH EVENTO DE PRUEBA TRANSACCIONAL',estado:'CERRADO',...dates})
  assert.equal((await op(sql,0,'resultados',{id_padron:padronId}))[0].votos,1)
  checks.push('resultados tras cierre')
  console.log(JSON.stringify({realPostgres:true,checks,success:true,testNamesOnly:true}))
}catch(error){console.error(JSON.stringify({success:false,errorCode:error.code??'TEST_FAILED',businessState:/^[A-Z_]+$/.test(error.message)?error.message:undefined,checks,assertion: error.name==='AssertionError'}));process.exitCode=1}
finally{
  try{await sql.begin(async tx=>{
    if(padronId){await tx`DELETE FROM urh_votacion.voto WHERE id_padron=${padronId}`;await tx`DELETE FROM urh_votacion.participacion_electoral WHERE id_padron=${padronId}`;await tx`DELETE FROM urh_votacion.opcion_electoral WHERE id_padron=${padronId}`;await tx`DELETE FROM urh_votacion.padron_detalle WHERE id_padron=${padronId}`}
    if(eventId){await tx`DELETE FROM urh_votacion.candidatura WHERE id_evento=${eventId}`;await tx`DELETE FROM urh_votacion.padron WHERE id_evento=${eventId}`;await tx`DELETE FROM urh_votacion.evento WHERE id_evento=${eventId}`}
    for(const id of users){await tx`DELETE FROM urh_votacion.usuario_rol WHERE id_usuario=${id}`;await tx`DELETE FROM urh_votacion.usuario WHERE id_usuario=${id}`}
    for(const id of people)await tx`DELETE FROM urh_votacion.personal WHERE id_personal=${id}`
    if(segmentId)await tx`DELETE FROM urh_votacion.segmento WHERE id_segmento=${segmentId}`
  });console.log(JSON.stringify({testRowsCleaned:true,existingRowsNotModified:true}))}catch{console.error('TEST_CLEANUP_FAILED');process.exitCode=1}
  await sql.end({timeout:2})
}
