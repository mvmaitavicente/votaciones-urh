import fs from 'node:fs'
import postgres from 'postgres'
const url=process.env.URH_MIGRATION_DATABASE_URL
if(!url||!new URL(url).hostname.includes('feiztkc9'))throw new Error('PROJECT_MISMATCH')
const sql=postgres(url,{ssl:{rejectUnauthorized:true},max:1,connect_timeout:5,onnotice:()=>{}})
try{
  const [info]=await sql`SELECT current_database()='insforge' AS correct_database,current_user=pg_get_userbyid(n.nspowner) AS owns_schema FROM pg_namespace n WHERE n.nspname='urh_votacion'`
  if(!info?.correct_database||!info.owns_schema)throw new Error('OWNER_REQUIRED')
  const file=fs.readFileSync('migrations/20261012080000_urh-functional.sql','utf8')
  const start=file.indexOf('CREATE FUNCTION urh_votacion.urh_operacion'),end=file.indexOf('REVOKE ALL ON FUNCTION')
  const source=file.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
  await sql.begin(async tx=>{await tx.unsafe(source,[],{prepare:false});await tx`NOTIFY pgrst,'reload schema'`})
  console.log(JSON.stringify({rpcUpdated:true,existingRowsNotModified:true}))
}catch(e){console.error(JSON.stringify({rpcUpdated:false,errorCode:e.code??'UPDATE_FAILED'}));process.exitCode=1}finally{await sql.end({timeout:1})}
