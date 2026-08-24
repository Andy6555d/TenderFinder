'use client'
import { useState } from 'react'
export default function BranchLocationFields({lat,lon}:{lat:number|null;lon:number|null}){
 const [latitude,setLatitude]=useState(lat==null?'':String(lat)); const [longitude,setLongitude]=useState(lon==null?'':String(lon)); const [msg,setMsg]=useState('')
 function locate(){if(!navigator.geolocation){setMsg('Location is not supported by this browser.');return}setMsg('Getting location…');navigator.geolocation.getCurrentPosition(p=>{setLatitude(p.coords.latitude.toFixed(6));setLongitude(p.coords.longitude.toFixed(6));setMsg('Location captured. Save preferences to apply it.')},e=>setMsg(`Could not get location: ${e.message}`),{enableHighAccuracy:true,timeout:10000})}
 return <><div className="field-row"><div className="field"><label>Branch latitude</label><input name="branch_latitude" value={latitude} onChange={e=>setLatitude(e.target.value)} placeholder="53.3498" inputMode="decimal"/></div><div className="field"><label>Branch longitude</label><input name="branch_longitude" value={longitude} onChange={e=>setLongitude(e.target.value)} placeholder="-6.2603" inputMode="decimal"/></div></div><button type="button" className="btn btn-secondary" onClick={locate}>Use my current location</button>{msg&&<p className="muted">{msg}</p>}</>
}
