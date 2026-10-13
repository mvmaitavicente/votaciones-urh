import {build} from 'esbuild'
for(const name of ['verificar-acceso','emitir-voto','operacion','foto-candidatura']){
  await build({entryPoints:[`functions/functional/${name}.ts`],bundle:true,platform:'neutral',format:'esm',target:'es2022',plugins:[{name:'deno-sdk',setup(build){build.onResolve({filter:/^@insforge\/sdk$/},()=>({path:'npm:@insforge/sdk@1.5.2',external:true}))}}],outfile:`artifacts/functional/${name}.js`})
}
console.log('Funciones de fase GUID preparadas en artifacts/functional. No desplegadas.')
