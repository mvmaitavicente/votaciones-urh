import {useState} from 'react'

export function CandidatePhoto({src,name}:{src?:string|null;name:string}){
  const [failed,setFailed]=useState<string|null>(null)
  return src&&failed!==src
    ? <img className="candidate-photo" src={src} alt={`Foto de ${name}`} onError={()=>setFailed(src)} />
    : <span className="candidate-photo photo-placeholder" role="img" aria-label={`${name}: sin foto`}>Sin foto</span>
}
