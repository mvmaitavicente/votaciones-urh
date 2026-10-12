import fs from 'node:fs'
import postgres from 'postgres'
const url=process.env.URH_MIGRATION_DATABASE_URL
if(!url||!new URL(url).hostname.includes('feiztkc9'))throw new Error('Proyecto de base de datos no permitido.')
const sql=postgres(url,{ssl:{rejectUnauthorized:true},max:1,connect_timeout:5,onnotice:()=>{}})
try{
  const [info]=await sql`SELECT current_database()='insforge' AS correct_database,current_user=pg_get_userbyid(n.nspowner) AS owns_schema FROM pg_namespace n WHERE n.nspname='urh_votacion'`
  if(!info?.correct_database||!info.owns_schema)throw new Error('OWNER_REQUIRED')
  const [existing]=await sql`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='urh_votacion' AND p.proname='urh_operacion'`
  if(existing.n)throw new Error('MIGRATION_ALREADY_PRESENT')
  await sql.unsafe(fs.readFileSync('migrations/20261012080000_urh-functional.sql','utf8'),[],{prepare:false})
  console.log(JSON.stringify({migrationApplied:true,existingRowsNotDeleted:true}))
}catch(error){console.error(JSON.stringify({migrationApplied:false,errorCode:error.code??'MIGRATION_FAILED'}));process.exitCode=1}
finally{await sql.end({timeout:1})}
