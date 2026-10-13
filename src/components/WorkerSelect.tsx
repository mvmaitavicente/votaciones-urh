import {useState} from 'react'

type Option = {value:string;label:string}
const normalize = (text:string) => text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim()

export function WorkerSelect({id,value,options,required,onChange}:{id:string;value:string;options:Option[];required?:boolean;onChange:(value:string)=>void}) {
  const [search,setSearch]=useState('')
  const words=normalize(search).split(/\s+/).filter(Boolean)
  const matches=options.filter(option=>words.every(word=>normalize(option.label).includes(word)))
  const selected=options.find(option=>option.value===value)
  const keepSelected=selected&&!matches.some(option=>option.value===value)
  return <>
    <label htmlFor={`${id}-search`}>Buscar trabajador</label>
    <input id={`${id}-search`} type="search" placeholder="Escribe un nombre o apellido" value={search}
      onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault()}}
      aria-controls={id} aria-describedby={`${id}-results`} />
    <p id={`${id}-results`} role="status">{matches.length===0?'No hay trabajadores que coincidan.':`${matches.length} trabajadores encontrados.`}{keepSelected?' Se conserva el trabajador seleccionado.':''}</p>
    <select id={id} value={value} required={required} onChange={event=>onChange(event.target.value)}>
      <option value="">Selecciona...</option>
      {keepSelected&&<option value={selected.value}>{selected.label} (seleccionado)</option>}
      {matches.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </>
}
