export function validFunctionalRoles(roles:unknown):boolean{
  return Array.isArray(roles)&&roles.length>0&&roles.every(r=>r==='ADMINISTRADOR'||r==='ELECTOR'||r==='SUPERVISOR')
}
export function functionalPermissions(roles:readonly string[]=[]){
  const canAdmin=roles.includes('ADMINISTRADOR'),canVote=roles.includes('ELECTOR'),canSupervise=roles.includes('SUPERVISOR')
  return {canAdmin,canVote,canSupervise,canResults:canAdmin||canSupervise}
}
