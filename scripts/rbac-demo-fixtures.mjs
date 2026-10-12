// Exclusivamente pruebas locales: no se importa desde src ni desde la función InsForge.
export const demoTenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const demoObject = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const demoIdentities = Array.from({ length: 7 }, (_, index) => ({ id_object: demoObject(index + 1), id_tenant: demoTenant }))
export function createFixtureRepository(scenario) {
  const scenarios = { NO_REGISTRADO: 1, INACTIVO: 2, SIN_ROLES: 3, ADMINISTRADOR: 4, ELECTOR: 5, AMBOS: 6, ERROR: 7 }
  if (scenario && !Object.hasOwn(scenarios, scenario)) throw new Error('Escenario ficticio desconocido.')
  return {
    async findUsers(identity) {
      const number = scenario ? scenarios[scenario] : Number(identity.id_object.slice(-12))
      if (number === 1) return []
      if (number === 7) throw new Error('SIMULATED_CONNECTION_ERROR')
      if ((!scenario && identity.id_tenant !== demoTenant) || number < 2 || number > 6) return []
      return [{ id_usuario: number, nombre: `Cuenta ficticia ${number}`, activo: number !== 2 }]
    },
    async findRoleCodes(userId) {
      return ({ 3: [], 4: ['ADMINISTRADOR'], 5: ['ELECTOR'], 6: ['ADMINISTRADOR', 'ELECTOR'] })[userId] ?? []
    },
  }
}
