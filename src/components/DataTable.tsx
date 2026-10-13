import {useMemo,useState,type ReactNode} from 'react'

export type Column<T>={key:string;label:string;value:(row:T)=>string|number;chip?:boolean}
const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'})

export function DataTable<T>({rows,columns,rowKey,actions,toolbar,empty='Sin registros.'}:{rows:T[];columns:Column<T>[];rowKey:(row:T,index:number)=>string;actions?:(row:T)=>ReactNode;toolbar?:(filteredRows:T[])=>ReactNode;empty?:string}){
  const [sort,setSort]=useState<{key:string;dir:1|-1}|null>(null),[page,setPage]=useState(0),[size,setSize]=useState(10),[query,setQuery]=useState('')
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase()
    const filtered=q?rows.filter(r=>columns.some(c=>String(c.value(r)).toLowerCase().includes(q))):rows
    const column=columns.find(c=>c.key===sort?.key)
    if(!sort||!column)return filtered
    return [...filtered].sort((a,b)=>{const x=column.value(a),y=column.value(b);return (typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y)))*sort.dir})
  },[rows,columns,query,sort])
  const pages=Math.max(1,Math.ceil(visible.length/size)),current=Math.min(page,pages-1),start=current*size,slice=visible.slice(start,start+size)
  const toggle=(key:string)=>{setSort(s=>s?.key===key?(s.dir===1?{key,dir:-1}:null):{key,dir:1});setPage(0)}
  return <div className="data-table">
    <div className="data-table-tools"><input type="search" aria-label="Buscar en la tabla" placeholder="Buscar..." value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}}/><span>{visible.length} {visible.length===1?'registro':'registros'}</span>{toolbar?.(visible)}</div>
    <div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c.key} aria-sort={sort?.key===c.key?(sort.dir===1?'ascending':'descending'):'none'}><button type="button" className="sort-button" onClick={()=>toggle(c.key)}>{c.label}<span aria-hidden="true">{sort?.key===c.key?(sort.dir===1?'▲':'▼'):'↕'}</span></button></th>)}{actions&&<th className="actions-cell">Acciones</th>}</tr></thead>
      <tbody>{slice.length?slice.map((r,i)=><tr key={rowKey(r,start+i)}>{columns.map(c=><td key={c.key}>{c.chip?<span className={'status-chip status-'+String(c.value(r)).toLowerCase()}>{c.value(r)}</span>:c.value(r)}</td>)}{actions&&<td className="actions-cell">{actions(r)}</td>}</tr>):<tr><td className="table-empty" colSpan={columns.length+(actions?1:0)}>{query?'No hay coincidencias.':empty}</td></tr>}</tbody></table></div>
    <div className="data-table-footer"><label>Filas por página <select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0)}}>{[10,25,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <span>{visible.length?`${start+1}–${start+slice.length} de ${visible.length}`:'0 de 0'}</span>
      <div className="pager"><button type="button" className="refresh-button" disabled={current===0} onClick={()=>setPage(current-1)} aria-label="Página anterior">‹</button><span>Página {current+1} de {pages}</span><button type="button" className="refresh-button" disabled={current>=pages-1} onClick={()=>setPage(current+1)} aria-label="Página siguiente">›</button></div></div>
  </div>
}
