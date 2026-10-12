import postgres from 'postgres'
import fs from 'node:fs'
const sql=postgres(process.env.URH_MIGRATION_DATABASE_URL,{ssl:{rejectUnauthorized:true},max:1,onnotice:()=>{}})
try{
  const functions=await sql`SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='urh_votacion' AND has_function_privilege('anon',p.oid,'EXECUTE')`
  const tables=await sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='urh_votacion' AND c.relkind IN ('r','p','v','m','f') AND c.relname<>'segmento' AND (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE'))`
  const [rpc]=await sql`SELECT p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,has_function_privilege('project_admin',p.oid,'EXECUTE') AS server_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='urh_votacion' AND p.proname='urh_operacion'`
  const bundle=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.js')).map(n=>fs.readFileSync('dist/assets/'+n,'utf8')).join('\n')
  const privateKey=process.env.RBAC_SERVER_API_KEY
  const privilegedKeyInBundle=Boolean(privateKey&&bundle.includes(privateKey))||/\bik_[a-zA-Z0-9]{16,}/.test(bundle)
  console.log(JSON.stringify({anonExecutableFunctions:functions,anonOtherAccessibleTables:tables,rpc,privilegedKeyInBundle,frontendUsesHostedFunctions:bundle.includes('https://feiztkc9.function2.insforge.app')},null,2))
  if(functions.length||tables.length||rpc.anon_execute||!rpc.server_execute||privilegedKeyInBundle)throw new Error('SECURITY_AUDIT_FAILED')
}finally{await sql.end()}
