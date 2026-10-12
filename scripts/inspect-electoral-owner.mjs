import postgres from 'postgres'
const url=process.env.URH_MIGRATION_DATABASE_URL
if(!url||!new URL(url).hostname.includes('feiztkc9'))throw new Error('La conexión no corresponde al proyecto esperado.')
const sql=postgres(url,{ssl:{rejectUnauthorized:true},max:1,connect_timeout:5,onnotice:()=>{}})
try{
  const rows=await sql`SELECT current_database()='insforge' AS correct_database, current_user=pg_get_userbyid(n.nspowner) AS owns_schema FROM pg_namespace n WHERE n.nspname='urh_votacion'`
  console.log(JSON.stringify({protectedConnectionVerified:rows.length===1,...rows[0]}))
}catch(error){console.log(JSON.stringify({protectedConnectionVerified:false,errorCode:error.code??'CONNECTION_FAILED'}));process.exitCode=1}
finally{await sql.end({timeout:1})}
