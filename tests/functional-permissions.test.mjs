import test from 'node:test'
import assert from 'node:assert/strict'
import {functionalPermissions,validFunctionalRoles} from '../src/services/functionalPermissions.ts'
test('Supervisor solo ve resultados; elector y supervisor conserva voto sin administración',()=>{
  assert.deepEqual(functionalPermissions(['SUPERVISOR']),{canAdmin:false,canVote:false,canSupervise:true,canResults:true})
  assert.deepEqual(functionalPermissions(['ELECTOR','SUPERVISOR']),{canAdmin:false,canVote:true,canSupervise:true,canResults:true})
  assert.equal(functionalPermissions(['ELECTOR']).canResults,false)
  assert.equal(functionalPermissions(['ADMINISTRADOR']).canResults,true)
  assert.equal(validFunctionalRoles(['SUPERVISOR']),true)
  assert.equal(validFunctionalRoles(['ELECTOR','SUPERVISOR']),true)
  for(const roles of [[],null,['DESCONOCIDO'],['SUPERVISOR','DESCONOCIDO']])assert.equal(validFunctionalRoles(roles),false)
})
