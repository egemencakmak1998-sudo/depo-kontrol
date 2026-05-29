import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
         query, where, orderBy, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'90vw',textAlign:'center',boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>{msg}</div>;
}

const RAF_LIMITS = {
  '109': { start: 13, end: 117 },
  '110': { start: 14, end: 117 }
};
const getRafRange = (koridor) => RAF_LIMITS[koridor] || RAF_LIMITS['109'];
const getRafList = (koridor) => {
  const { start, end } = getRafRange(koridor);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};
const isValidRaf = (koridor, rafNo) => {
  const { start, end } = getRafRange(koridor);
  return rafNo >= start && rafNo <= end;
};

/* ── LOKASYON SEÇİCİ ── */
function LokPicker({ onSelect, currentLok }) {
  const [search, setSearch] = useState('');
  const [kor, setKor] = useState(currentLok ? currentLok.slice(1,4) : '109');
  const [raf, setRaf] = useState(currentLok ? parseInt(currentLok.slice(5,8)) : null);
  const [kat, setKat] = useState(currentLok ? currentLok.slice(8) : null);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detRef = useRef(null);
  const rafAnimRef = useRef(null);

  const KATS = ['A','B','C','D','E','F'];
  const curLok = raf && kat ? `A${kor}S${String(raf).padStart(3,'0')}${kat}` : null;

  const stopCam = () => {
    if(rafAnimRef.current) cancelAnimationFrame(rafAnimRef.current);
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    streamRef.current = null; setCamOn(false);
  };

  const scanLok = () => {
    if(!videoRef.current||!detRef.current) return;
    detRef.current.detect(videoRef.current).then(res=>{
      if(res.length>0){
        const code = res[0].rawValue.trim();
        const m = code.match(/^A?(109|110)S?(\d{3})([A-F])$/i);
        if(m){
          const rafNo = parseInt(m[2]);
          if(!isValidRaf(m[1], rafNo)) return;
          setKor(m[1]); setRaf(rafNo); setKat(m[3].toUpperCase());
          stopCam();
        }
      }
      rafAnimRef.current = requestAnimationFrame(scanLok);
    }).catch(()=>{ rafAnimRef.current = requestAnimationFrame(scanLok); });
  };

  const startCam = async () => {
    try {
      if(!detRef.current) detRef.current = new window.BarcodeDetector({formats:['code_128','code_39','qr_code','ean_13']});
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      streamRef.current = stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      setCamOn(true);
      rafAnimRef.current = requestAnimationFrame(scanLok);
    } catch(e){ alert('Kamera açılamadı'); }
  };

  useEffect(()=>()=>stopCam(),[]);

  const navigate = (dir) => {
    if(!raf||!kat) return;
    const katIdx = KATS.indexOf(kat);
    if(dir==='up' && katIdx<KATS.length-1){ setKat(KATS[katIdx+1]); }
    else if(dir==='down' && katIdx>0){ setKat(KATS[katIdx-1]); }
    else if(dir==='right' && raf<getRafRange(kor).end){ setRaf(raf+1); }
    else if(dir==='left' && raf>getRafRange(kor).start){ setRaf(raf-1); }
  };

  const handleSearch = (val) => {
    setSearch(val);
    const m = val.trim().match(/^A?(109|110)S?(\d{2,3})([A-F])$/i);
    if(m){
      const rafNo = parseInt(m[2]);
      if(isValidRaf(m[1], rafNo)){ setKor(m[1]); setRaf(rafNo); setKat(m[3].toUpperCase()); }
    }
  };

  return (
    <div style={{padding:14}}>
      {/* Arama + Barkod */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <input value={search} onChange={e=>handleSearch(e.target.value)}
          placeholder="Kod yaz (örn: A109S013B)"
          style={{flex:1,padding:'9px 12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none'}} />
        <button onClick={()=>camOn?stopCam():startCam()}
          style={{background:camOn?'#ef4444':'#1e40af',border:'none',borderRadius:10,color:'#fff',padding:'9px 14px',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
          {camOn?'⏹ Durdur':'📷 Tara'}
        </button>
      </div>

      {camOn&&(
        <div style={{marginBottom:12,borderRadius:10,overflow:'hidden',background:'#000',maxHeight:180}}>
          <video ref={videoRef} style={{width:'100%',maxHeight:180,objectFit:'cover'}} playsInline muted />
        </div>
      )}

      {/* Navigasyon — sadece lokasyon seçiliyse */}
      {curLok&&(
        <div style={{background:'#eff6ff',borderRadius:10,padding:'10px 12px',marginBottom:14}}>
          <p style={{fontSize:11,color:'#1d4ed8',marginBottom:8,fontWeight:600}}>HIZ NAVİGASYONU</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {[['left','← Sol Raf'],['right','Sağ Raf →'],['down','↓ Alt Kat'],['up','↑ Üst Kat']].map(([d,l])=>(
              <button key={d} onClick={()=>navigate(d)}
                style={{background:'#fff',border:'1px solid #bfdbfe',borderRadius:8,padding:'7px 0',fontSize:12,fontWeight:600,cursor:'pointer',color:'#1e40af'}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Koridor */}
      <p style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Koridor</p>
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        {['109','110'].map(k=>(
          <button key={k} onClick={()=>{setKor(k);setRaf(null);setKat(null);}}
            style={{flex:1,border:'none',borderRadius:10,padding:'10px 0',fontSize:14,fontWeight:600,cursor:'pointer',
              background:kor===k?'#1e40af':'#f1f5f9',color:kor===k?'#fff':'#475569'}}>
            {k}
          </button>
        ))}
      </div>

      {/* Raf */}
      <p style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>
        Raf {raf?`— ${raf}`:`(${getRafRange(kor).start}-${getRafRange(kor).end})`}
      </p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:4,maxHeight:160,overflowY:'auto',marginBottom:14}}>
        {getRafList(kor).map(n=>(
          <button key={n} onClick={()=>{setRaf(n);setKat(null);}}
            style={{padding:'6px 0',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',
              background:raf===n?'#1e40af':'#f1f5f9',color:raf===n?'#fff':'#475569'}}>
            {n}
          </button>
        ))}
      </div>

      {/* Kat */}
      {raf&&(
        <>
          <p style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Kat</p>
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            {KATS.map(k=>(
              <button key={k} onClick={()=>setKat(k)}
                style={{flex:1,border:'none',borderRadius:8,padding:'10px 0',fontSize:14,fontWeight:600,cursor:'pointer',
                  background:kat===k?'#1e40af':'#f1f5f9',color:kat===k?'#fff':'#475569'}}>
                {k}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Seçilen + Onayla */}
      {curLok&&(
        <button onClick={()=>onSelect(curLok)}
          style={{width:'100%',background:'#1e40af',border:'none',borderRadius:12,padding:'13px 0',fontSize:15,fontWeight:700,cursor:'pointer',color:'#fff'}}>
          📍 {curLok} — Sayıma Başla →
        </button>
      )}
    </div>
  );
}

/* ── SAYIM EKRANI ── */
function SayimEkrani({ lokasyon, sessionId, sessionTip, products, onSubmit, onBack, requireKnownProduct = false, referenceItems = [] }) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState({});
  const [hasarlilar, setHasarlilar] = useState({});
  const [barInput, setBarInput] = useState('');
  const [mode, setMode] = useState('text');
  const [camOn, setCamOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHasar, setShowHasar] = useState(false);
  const [toast, setToast] = useState(null);
  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detRef = useRef(null);
  const rafRef = useRef(null);
  const lastBcRef = useRef({code:'',ts:0});
  const entriesRef = useRef(entries);
  useEffect(()=>{entriesRef.current=entries;},[entries]);

  const stopCam = useCallback(()=>{
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    streamRef.current=null; setCamOn(false);
  },[]);

  const getProductByCode = useCallback((code)=>{
    const key = String(code || '').trim();
    if(!key) return null;
    return products[key] || null;
  },[products]);

  const getRefKeys = useCallback((ref)=>{
    const keys = new Set();
    const ean = String(ref?.ean || '').trim();
    const malzemeKodu = String(ref?.malzemeKodu || '').trim();
    if(ean) keys.add(ean);
    if(malzemeKodu) keys.add(malzemeKodu);
    const p = products[ean] || products[malzemeKodu];
    if(p?.ean) keys.add(String(p.ean).trim());
    if(p?.malzemeKodu) keys.add(String(p.malzemeKodu).trim());
    return keys;
  },[products]);

  const referenceKeySet = new Set();
  (referenceItems || []).forEach(ref=>{
    getRefKeys(ref).forEach(k=>referenceKeySet.add(k));
  });

  const getEntryCountForRef = (ref) => {
    let total = 0;
    getRefKeys(ref).forEach(k=>{ total += entries[k] || 0; });
    return total;
  };

  const addProductCode = useCallback((code)=>{
    const rawCode = String(code || '').trim();
    if(!rawCode) return false;

    const product = getProductByCode(rawCode);
    if(requireKnownProduct && !product){
      toast$(`Ürün havuzunda bulunamadı: ${rawCode}`,'error');
      return false;
    }

    if(requireKnownProduct && referenceItems.length > 0){
      const possibleKeys = [rawCode, product?.ean, product?.malzemeKodu].filter(Boolean).map(k=>String(k).trim());
      const inReference = possibleKeys.some(k=>referenceKeySet.has(k));
      if(!inReference){
        toast$(`Bu ürün referans dosyasında yok: ${rawCode}`,'error');
        return false;
      }
    }

    const key = product?.ean || product?.malzemeKodu || rawCode;
    setEntries(prev=>({...prev,[key]:(prev[key]||0)+1}));
    toast$(product?.urunAdi || rawCode,'success');
    return true;
  },[getProductByCode, requireKnownProduct, referenceItems, referenceKeySet]);

  const scan = useCallback(()=>{
    if(!videoRef.current||!detRef.current) return;
    detRef.current.detect(videoRef.current).then(res=>{
      if(res.length>0){
        const code=res[0].rawValue; const now=Date.now();
        if(code!==lastBcRef.current.code||now-lastBcRef.current.ts>2000){
          lastBcRef.current={code,ts:now};
          addProductCode(code);
        }
      }
      rafRef.current=requestAnimationFrame(scan);
    }).catch(()=>{rafRef.current=requestAnimationFrame(scan);});
  },[addProductCode]);

  const startCam = useCallback(async()=>{
    try{
      if(!('BarcodeDetector' in window)){toast$('Kamera desteklenmiyor','error');return;}
      if(!detRef.current) detRef.current=new window.BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','qr_code']});
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      setCamOn(true); rafRef.current=requestAnimationFrame(scan);
    }catch(e){toast$('Kamera hatası','error');}
  },[scan]);

  useEffect(()=>()=>stopCam(),[stopCam]);

  const handleText = (e) => {
    if(e.key!=='Enter') return;
    const code=barInput.trim(); if(!code) return;
    const added = addProductCode(code);
    if(added) setBarInput('');
  };

  const handleSubmit = async () => {
    if(Object.keys(entries).length===0){toast$('Hiç ürün girilmedi','error');return;}
    setSaving(true);
    try {
      const items = Object.entries(entries).map(([key,adet])=>{
        const product = products[key] || {};
        return {
          ean: product.ean || key,
          adet,
          urunAdi: product.urunAdi || '',
          malzemeKodu: product.malzemeKodu || '',
          hasarliAdet: hasarlilar[key] || 0,
        };
      });
      const ref = await addDoc(collection(db,'countEntries'),{
        sessionId, lokasyon, tip:sessionTip,
        kullanici:profile?.name||user?.email||'',
        kullaniciId:user?.uid||'',
        items, tarih:Timestamp.now(), durum:'bekliyor',
        hasarliOzet:Object.entries(hasarlilar).map(([key,adet])=>({
          ean: products[key]?.ean || key,
          adet,
          urunAdi: products[key]?.urunAdi || ''
        })).filter(h=>h.adet>0),
      });
      onSubmit(ref.id, items);
    }catch(e){toast$('Hata: '+e.message,'error');}
    setSaving(false);
  };

  const itemList = Object.entries(entries).filter(([,v])=>v>0);
  const toplamAdet = itemList.reduce((a,[,v])=>a+v,0);
  const toplamHasar = Object.values(hasarlilar).reduce((a,b)=>a+b,0);

  return (
    <div>
      <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
        <div style={{flex:1}}>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📍 {lokasyon}</p>
          <p style={{color:'#94a3b8',fontSize:11}}>{itemList.length} kalem · {toplamAdet} adet{toplamHasar>0?` · ⚠️ ${toplamHasar} hasarlı`:''}</p>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          style={{background:'#10b981',border:'none',borderRadius:10,color:'#fff',padding:'8px 14px',fontWeight:700,fontSize:13,cursor:'pointer',opacity:saving?.6:1}}>
          {saving?'...':'Kaydet ✓'}
        </button>
      </div>

      <div style={{display:'flex',borderBottom:'1px solid #e2e8f0'}}>
        {[['text','⌨️ Metin'],['cam','📷 Kamera']].map(([m,l])=>(
          <button key={m} onClick={()=>{if(m==='cam'&&!camOn)startCam();if(m!=='cam')stopCam();setMode(m);}}
            style={{flex:1,border:'none',padding:'11px',fontSize:13,fontWeight:600,cursor:'pointer',
              background:mode===m?'#0f172a':'#f8fafc',color:mode===m?'#fff':'#64748b'}}>
            {l}
          </button>
        ))}
        <button onClick={()=>setShowHasar(!showHasar)}
          style={{border:'none',padding:'11px 14px',fontSize:13,fontWeight:600,cursor:'pointer',
            background:showHasar?'#fef3c7':'#f8fafc',color:showHasar?'#d97706':'#64748b'}}>
          ⚠️ Hasarlı{toplamHasar>0?` (${toplamHasar})`:''}
        </button>
      </div>

      {mode==='cam'&&(
        <div style={{background:'#000',maxHeight:220,overflow:'hidden'}}>
          <video ref={videoRef} style={{width:'100%',maxHeight:220,objectFit:'cover'}} playsInline muted />
          {!camOn&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <button onClick={startCam} style={{background:'#3b82f6',border:'none',color:'#fff',borderRadius:10,padding:'10px 20px',cursor:'pointer'}}>Kamerayı Başlat</button>
          </div>}
        </div>
      )}

      {mode==='text'&&(
        <div style={{padding:'12px 16px'}}>
          <div style={{display:'flex',gap:8}}>
            <input value={barInput} onChange={e=>setBarInput(e.target.value)} onKeyDown={handleText}
              placeholder="Barkod okutun → Enter" autoFocus
              style={{flex:1,padding:'10px 14px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,outline:'none'}} />
            <button onClick={()=>handleText({key:'Enter'})} style={{background:'#1e40af',border:'none',borderRadius:10,color:'#fff',padding:'10px 16px',fontWeight:700,cursor:'pointer'}}>Tara</button>
          </div>
        </div>
      )}

      <div style={{padding:'0 16px 80px'}}>
        {referenceItems.length>0&&(
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,marginBottom:12,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
              <p style={{fontSize:13,fontWeight:800,color:'#1e293b',flex:1}}>📋 Referans Listesi</p>
              <p style={{fontSize:11,color:'#64748b',fontWeight:600}}>
                {referenceItems.filter(r=>getEntryCountForRef(r)===(r.beklenenAdet||0)).length} / {referenceItems.length} tamam
              </p>
            </div>
            <div style={{maxHeight:360,overflowY:'auto'}}>
              {referenceItems.map((ref,i)=>{
                const sayilan = getEntryCountForRef(ref);
                const beklenen = ref.beklenenAdet || 0;
                const p = products[String(ref.ean || '').trim()] || products[String(ref.malzemeKodu || '').trim()] || {};
                const urunAdi = ref.urunAdi || p.urunAdi || ref.malzemeKodu || ref.ean || '-';
                const kod = ref.malzemeKodu || p.malzemeKodu || ref.ean || p.ean || '-';
                const durum = sayilan === beklenen ? 'tamam' : sayilan > beklenen ? 'fazla' : sayilan > 0 ? 'eksik' : 'bekliyor';
                const renk = durum === 'tamam' ? '#10b981' : durum === 'fazla' ? '#ef4444' : durum === 'eksik' ? '#f59e0b' : '#94a3b8';
                const bg = durum === 'tamam' ? '#f0fdf4' : durum === 'fazla' ? '#fef2f2' : durum === 'eksik' ? '#fffbeb' : '#fff';
                return (
                  <div key={`${kod}-${i}`} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderBottom:'1px solid #f1f5f9',background:bg}}>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,fontWeight:700,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{urunAdi}</p>
                      <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{kod}{ref.ean?` · ${ref.ean}`:''}</p>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                      <span style={{fontSize:12,fontWeight:800,color:renk}}>{sayilan}</span>
                      <span style={{fontSize:11,color:'#94a3b8'}}> / {beklenen}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showHasar&&itemList.length>0&&(
          <div style={{background:'#fef3c7',borderRadius:10,padding:'10px 12px',marginBottom:10,border:'1px solid #fde68a'}}>
            <p style={{fontSize:12,fontWeight:700,color:'#92400e',marginBottom:8}}>⚠️ Hasarlı Ürün Girişi</p>
            {itemList.map(([ean,adet])=>{
              const p=products[ean]||{};
              return (
                <div key={ean} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <p style={{flex:1,fontSize:12,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.urunAdi||ean}</p>
                  <input type="number" min="0" max={adet}
                    value={hasarlilar[ean]||0}
                    onChange={e=>setHasarlilar(prev=>({...prev,[ean]:Math.min(adet,Math.max(0,parseInt(e.target.value)||0))}))}
                    style={{width:52,textAlign:'center',border:'1px solid #fde68a',borderRadius:7,padding:'4px',fontSize:13,fontWeight:700,background:'#fff'}} />
                  <span style={{fontSize:11,color:'#92400e'}}>/ {adet}</span>
                </div>
              );
            })}
          </div>
        )}

        {itemList.length===0&&referenceItems.length===0&&<p style={{color:'#94a3b8',fontSize:13,textAlign:'center',padding:'24px 0'}}>Henüz ürün taranmadı</p>}
        {itemList.map(([ean,adet])=>{
          const p=products[ean]||{};
          const hasar=hasarlilar[ean]||0;
          return (
            <div key={ean} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.urunAdi||ean}</p>
                <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{p.malzemeKodu||ean}{hasar>0&&<span style={{color:'#d97706',marginLeft:8}}>⚠️ {hasar} hasarlı</span>}</p>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                <button onClick={()=>setEntries(prev=>({...prev,[ean]:Math.max(0,adet-1)}))}
                  style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#f8fafc',cursor:'pointer',fontWeight:700,fontSize:15}}>−</button>
                <input type="number" value={adet} onChange={e=>setEntries(prev=>({...prev,[ean]:Math.max(0,parseInt(e.target.value)||0)}))}
                  style={{width:40,textAlign:'center',border:'1px solid #e2e8f0',borderRadius:6,padding:'3px 0',fontSize:13,fontWeight:700}} />
                <button onClick={()=>setEntries(prev=>({...prev,[ean]:adet+1}))}
                  style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#f8fafc',cursor:'pointer',fontWeight:700,fontSize:15}}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── ANA COMPONENT ── */
export default function MalKabul() {
  const defaultModule = 'mal_kabul';
  const { user, profile } = useAuth();
  const isAdmin = profile?.role==='admin';

  const [view, setView] = useState('list');
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [selectedLok, setSelectedLok] = useState(null);
  const [myEntries, setMyEntries] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [products, setProducts] = useState({});
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  // Mal kabul
  const [mkTur, setMkTur] = useState('manuel');
  const [mkRef, setMkRef] = useState([]);
  const [mkEntries, setMkEntries] = useState([]);
  // VAS
  const [vasItems, setVasItems] = useState({});
  const [mkLokasyonlar, setMkLokasyonlar] = useState({}); // ean -> lokasyon (mal kabul direkt)
  const [vasSessionId, setVasSessionId] = useState(null);
  const [vasList, setVasList] = useState([]);

  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});
  const isMalKabulModule = defaultModule === 'mal_kabul';
  const moduleSessionTip = isMalKabulModule ? 'mal_kabul' : 'genel';

  useEffect(()=>{
    getDocs(collection(db,'products')).then(snap=>{
      const m={};
      snap.docs.forEach(d=>{
        const p=d.data();
        const normalized = { id:d.id, ...p };
        if(p.ean) m[String(p.ean).trim()] = normalized;
        if(p.malzemeKodu) m[String(p.malzemeKodu).trim()] = normalized;
      });
      setProducts(m);
    });
  },[]);

  const loadSessions = useCallback(async()=>{
    try {
      const snap=await getDocs(query(collection(db,'countSessions'),orderBy('baslangic','desc')));
      setSessions(snap.docs.map(d=>({id:d.id,...d.data()})));
    }catch{}
  },[]);

  useEffect(()=>{loadSessions();},[loadSessions]);

  const detectConflicts = (entries) => {
    const byLok={};
    entries.forEach(e=>{
      if(!e.lokasyon||e.lokasyon==='MAL_KABUL') return;
      if(!byLok[e.lokasyon]) byLok[e.lokasyon]=[];
      byLok[e.lokasyon].push(e);
    });
    const caks=[];
    Object.entries(byLok).forEach(([lok,elist])=>{
      if(elist.length<2) return;
      for(let i=0;i<elist.length;i++){
        for(let j=i+1;j<elist.length;j++){
          if(!entriesMatch(elist[i].items,elist[j].items))
            caks.push({lokasyon:lok,entry1:elist[i],entry2:elist[j]});
        }
      }
    });
    setConflicts(caks);
  };

  const entriesMatch = (a,b) => {
    if(!a||!b||a.length!==b.length) return false;
    const m1=Object.fromEntries(a.map(i=>[i.ean,i.adet]));
    const m2=Object.fromEntries(b.map(i=>[i.ean,i.adet]));
    for(const k of new Set([...Object.keys(m1),...Object.keys(m2)])){
      if(m1[k]!==m2[k]) return false;
    }
    return true;
  };

  const loadEntries = useCallback(async(sessionId)=>{
    const snap=await getDocs(query(collection(db,'countEntries'),where('sessionId','==',sessionId)));
    const entries=snap.docs.map(d=>({id:d.id,...d.data()}));
    setAllEntries(entries);
    setMyEntries(entries.filter(e=>e.kullaniciId===user?.uid));
    detectConflicts(entries);
    return entries;
  },[user]);

  const startSession = async(tip) => {
    setLoading(true);
    try {
      const ref=await addDoc(collection(db,'countSessions'),{
        tip,durum:'aktif',
        baslatan:profile?.name||user?.email||'',
        baslantanId:user?.uid||'',
        baslangic:Timestamp.now(),
      });
      const s={id:ref.id,tip,durum:'aktif',baslatan:profile?.name||user?.email||'',baslangic:Timestamp.now()};
      setActiveSession(s);
      setSessions(prev=>[s,...prev]);
      setView(tip==='genel'?'genel_lok':'mal_kabul');
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  const deleteSession = async(session) => {
    if(!window.confirm(`"${session.tip==='genel'?'Genel Sayım':'Mal Kabul'}" oturumu silinecek.\n\nOturum silinse bile içerideki sayım verileri korunacak.\n\nEmin misiniz?`)) return;
    try {
      await deleteDoc(doc(db,'countSessions',session.id));
      setSessions(prev=>prev.filter(s=>s.id!==session.id));
      toast$('Oturum silindi (veriler korundu)','success');
    }catch(e){toast$('Hata: '+e.message,'error');}
  };

  const handleSayimSubmit = async(entryId,items) => {
    toast$(`${selectedLok} kaydedildi ✓`,'success');
    setMyEntries(prev=>[...prev,{id:entryId,lokasyon:selectedLok,items,kullaniciId:user?.uid,kullanici:profile?.name||''}]);
    setSelectedLok(null);
    setView('genel_lok');
  };

  /* ── MAL KABUL REF PARSE ── */
  const parseMkRef = (file) => {
    const reader=new FileReader();
    reader.onload=async ({target:{result}})=>{
      try {
        const wb=XLSX.read(new Uint8Array(result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hIdx=0,cCode=-1,cUrun=-1,cAdet=-1,cEan=-1;
        for(let r=0;r<Math.min(rows.length,10);r++){
          const cells=rows[r].map(c=>String(c||'').toLowerCase().replace(/\s+/g,' ').trim());
          let found=false;
          cells.forEach((cell,j)=>{
            if(/(malzeme|ürün kodu|elis|item)\s*(kodu?|code?)?/.test(cell)&&cCode<0){cCode=j;found=true;}
            if(/ean|barkod/.test(cell)&&cEan<0){cEan=j;found=true;}
            if(/ürün adı|sistem/.test(cell)&&cUrun<0){cUrun=j;found=true;}
            if(/miktar|adet|qty|toplam/.test(cell)&&cAdet<0){cAdet=j;found=true;}
          });
          if(found&&cAdet>=0){hIdx=r;break;}
        }
        const refData=[];
        rows.slice(hIdx+1).forEach(row=>{
          const kod=cCode>=0?String(row[cCode]||'').trim():'';
          const adet=parseInt(String(row[cAdet]||'0').replace(/\D/g,''))||0;
          if(!kod||adet<=0) return;
          refData.push({malzemeKodu:kod,urunAdi:cUrun>=0?String(row[cUrun]||'').trim():'',ean:cEan>=0?String(row[cEan]||'').trim():'',beklenenAdet:adet});
        });
        setMkRef(refData);
        setMkTur('referansli');
        if(activeSession?.id){
          await updateDoc(doc(db,'countSessions',activeSession.id),{
            mkTur:'referansli',
            referenceItems:refData,
            referenceUpdatedAt:Timestamp.now()
          });
          setActiveSession(prev=>prev?{...prev,mkTur:'referansli',referenceItems:refData}:prev);
        }
        toast$(`${refData.length} kalem referans yüklendi`,'success');
      }catch(e){toast$('Dosya hatası: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  const startMalKabulSayim = async () => {
    if(mkTur==='referansli'&&mkRef.length===0){toast$('Referans dosyası seçin','error');return;}
    setLoading(true);
    try {
      if(!activeSession){
        const payload={
          tip:'mal_kabul',durum:'aktif',
          baslatan:profile?.name||user?.email||'',
          baslantanId:user?.uid||'',
          baslangic:Timestamp.now(),
          mkTur,
          referenceItems:mkTur==='referansli'?mkRef:[],
          vasTransferItems:{},
          mkLokasyonlar:{}
        };
        const ref=await addDoc(collection(db,'countSessions'),payload);
        const s={id:ref.id,...payload};
        setActiveSession(s);
        setSessions(prev=>[s,...prev]);
      }else{
        await updateDoc(doc(db,'countSessions',activeSession.id),{
          mkTur,
          referenceItems:mkTur==='referansli'?mkRef:[],
          updatedAt:Timestamp.now()
        });
        setActiveSession(prev=>prev?{...prev,mkTur,referenceItems:mkTur==='referansli'?mkRef:[]}:prev);
      }
      setView('mk_sayim');
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  const openMalKabulSession = async (s) => {
    setActiveSession(s);
    setMkTur(s.mkTur || (s.referenceItems?.length ? 'referansli' : 'manuel'));
    setMkRef(s.referenceItems || []);
    setVasItems(s.vasTransferItems || {});
    setMkLokasyonlar(s.mkLokasyonlar || {});
    const entries = await loadEntries(s.id);
    setMkEntries(entries.map(e=>({id:e.id,items:e.items||[]})));
    setView(entries.length>0 ? 'mk_ozet' : 'mk_sayim');
  };

  const persistMalKabulOptions = async (nextVasItems=vasItems,nextLokasyonlar=mkLokasyonlar) => {
    if(!activeSession?.id) return;
    try {
      await updateDoc(doc(db,'countSessions',activeSession.id),{
        vasTransferItems:nextVasItems,
        mkLokasyonlar:nextLokasyonlar,
        updatedAt:Timestamp.now()
      });
    }catch(e){/* offline/permission durumunda ekran akışını bozma */}
  };

  /* ── MAL KABUL ONAY + VAS AYRIMI ── */
  const malKabulOnayla = async(vasMap, lokasyonlarMap) => {
    if(!activeSession) return;
    setLoading(true);
    try {
      const snap=await getDocs(query(collection(db,'countEntries'),where('sessionId','==',activeSession.id)));
      const allItems={};
      snap.docs.forEach(d=>{
        (d.data().items||[]).forEach(item=>{
          const key=item.malzemeKodu||item.ean;
          if(!allItems[key]) allItems[key]={...item,adet:0,hasarliAdet:0};
          allItems[key].adet+=item.adet;
          allItems[key].hasarliAdet+=(item.hasarliAdet||0);
        });
      });

      const now=Timestamp.now();
      const stockSnap=await getDocs(collection(db,'stock'));
      const stockMap={};
      stockSnap.docs.forEach(d=>{stockMap[d.id]=d.data();});

      const batch=writeBatch(db);
      const movBatch=writeBatch(db);
      const vasItemsToSave=[];

      Object.values(allItems).forEach(item=>{
        if(!item.ean) return;
        const vasAdet=vasMap[item.ean||item.malzemeKodu]||0;
        const lokAdet=item.adet-vasAdet;
        const prev=(stockMap[item.ean]?.miktar)||0;
        const next=prev+item.adet;
        const lok=lokasyonlarMap[item.ean]||lokasyonlarMap[item.malzemeKodu]||'';
        const prevByLok=stockMap[item.ean]?.byLocation||{};
        const newByLok=lok&&lokAdet>0?{...prevByLok,[lok]:(prevByLok[lok]||0)+lokAdet}:prevByLok;

        batch.set(doc(db,'stock',item.ean),{ean:item.ean,miktar:next,
          urunAdi:item.urunAdi||'',malzemeKodu:item.malzemeKodu||'',
          byLocation:newByLok,sonGuncelleme:now},{merge:true});

        movBatch.set(doc(collection(db,'stockMovements')),{
          tarih:now,tip:'mal_kabul',ean:item.ean,
          malzemeKodu:item.malzemeKodu||'',urunAdi:item.urunAdi||'',
          miktar:item.adet,oncekiMiktar:prev,sonrakiMiktar:next,
          hasarliAdet:item.hasarliAdet||0,
          vasAdet,lokAdet,
          kaynak:`mal_kabul:${activeSession.id}`,
          yapan:profile?.name||user?.email||'',yapanId:user?.uid||''
        });

        if(vasAdet>0){
          vasItemsToSave.push({ean:item.ean,malzemeKodu:item.malzemeKodu||'',
            urunAdi:item.urunAdi||'',adet:vasAdet,
            sessionId:activeSession.id,durum:'etiketleme_bekliyor',tarih:now});
        }
      });

      await batch.commit();
      await movBatch.commit();

      // VAS kayıtları
      for(const vi of vasItemsToSave){
        await addDoc(collection(db,'vasItems'),vi);
      }

      await updateDoc(doc(db,'countSessions',activeSession.id),{durum:'tamamlandi',bitis:now});
      toast$('Mal kabul stoğa eklendi ✓','success');
      setView('list');
      loadSessions();
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  /* ── VAS TAMAMLA → LOKASYONA ── */
  const loadVasItems = useCallback(async()=>{
    const snap=await getDocs(query(collection(db,'vasItems'),where('durum','==','etiketleme_bekliyor')));
    const list=snap.docs.map(d=>{
      const item={id:d.id,...d.data()};
      const product=products[String(item.ean||'').trim()]||products[String(item.malzemeKodu||'').trim()]||{};
      return {
        ...item,
        urunAdi:item.urunAdi||product.urunAdi||item.ean,
        malzemeKodu:item.malzemeKodu||product.malzemeKodu||'',
        ean:item.ean||product.ean||''
      };
    });
    setVasList(list);
  },[products]);

  const vasLokasyonaGonder = async(vasItem,lokasyon) => {
    if(!lokasyon){toast$('Lokasyon seçin','error');return;}
    try {
      const now=Timestamp.now();
      const stockSnap=await getDocs(query(collection(db,'stock'),where('ean','==',vasItem.ean)));
      const prev=stockSnap.empty?0:(stockSnap.docs[0].data().miktar||0);
      await updateDoc(doc(db,'vasItems',vasItem.id),{durum:'tamamlandi',lokasyon,bitis:now});
      await addDoc(collection(db,'stockMovements'),{
        tarih:now,tip:'vas_lokasyon',ean:vasItem.ean,
        malzemeKodu:vasItem.malzemeKodu||'',urunAdi:vasItem.urunAdi||'',
        miktar:0,oncekiMiktar:prev,sonrakiMiktar:prev,
        lokasyon,kaynak:`vas:${vasItem.id}`,
        yapan:profile?.name||user?.email||'',yapanId:user?.uid||''
      });
      setVasList(prev=>prev.filter(v=>v.id!==vasItem.id));
      toast$('VAS → Lokasyona taşındı ✓','success');
    }catch(e){toast$('Hata: '+e.message,'error');}
  };

  /* ── EXPORT ── */
  const exportGenelSayim = async(sessionId) => {
    const snap=await getDocs(query(collection(db,'countEntries'),where('sessionId','==',sessionId)));
    const lokMap={};
    snap.docs.forEach(d=>{
      const e=d.data();
      if(!lokMap[e.lokasyon]) lokMap[e.lokasyon]=e;
    });
    const rows=[['EAN Kodu','Malzeme Kodu','Ürün Adı','Sayılan Adet','Hasarlı Adet','Lokasyon']];
    Object.entries(lokMap).forEach(([lok,entry])=>{
      (entry.items||[]).forEach(item=>{
        rows.push([item.ean||'',item.malzemeKodu||'',item.urunAdi||'',item.adet,item.hasarliAdet||0,lok]);
      });
    });
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Sayim');
    XLSX.writeFile(wb,'genel_sayim_kok_stok.xlsx');
  };

  const S={
    card:{background:'#fff',borderRadius:14,padding:'14px 16px',border:'1px solid #e2e8f0',marginBottom:12},
    btn:{border:'none',borderRadius:10,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer'},
  };

  /* ── SAYIM EKRANI ── */
  if(view==='sayim'&&selectedLok&&activeSession){
    return <SayimEkrani lokasyon={selectedLok} sessionId={activeSession.id}
      sessionTip={activeSession.tip} products={products}
      onSubmit={handleSayimSubmit}
      onBack={()=>{setSelectedLok(null);setView('genel_lok');}}/>;
  }

  if(view==='mk_sayim'&&activeSession){
    return <SayimEkrani lokasyon="MAL_KABUL" sessionId={activeSession.id}
      sessionTip="mal_kabul" products={products}
      requireKnownProduct={mkTur==='referansli'}
      referenceItems={mkTur==='referansli' ? mkRef : []}
      onSubmit={(id,items)=>{setMkEntries(prev=>[...prev,{id,items}]);setView('mk_ozet');}}
      onBack={()=>setView('list')}/>;
  }

  /* ── GENEL SAYIM LOK SEÇ ── */
  if(view==='genel_lok'&&activeSession){
    const saydim=myEntries.map(e=>e.lokasyon);
    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setView('list');setActiveSession(null);}} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <div style={{flex:1}}>
            <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📦 Genel Sayım</p>
            <p style={{color:'#94a3b8',fontSize:11}}>{saydim.length} lokasyon sayıldı</p>
          </div>
          {isAdmin&&(
            <button onClick={()=>{loadEntries(activeSession.id);setView('admin_detay');}}
              style={{...S.btn,background:'#3b82f6',color:'#fff',padding:'7px 12px',fontSize:12}}>
              Yönet
            </button>
          )}
        </div>
        {saydim.length>0&&(
          <div style={{padding:'10px 16px',background:'#f0fdf4',borderBottom:'1px solid #dcfce7'}}>
            <p style={{fontSize:12,fontWeight:600,color:'#15803d',marginBottom:6}}>✅ Saydığım lokasyonlar</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {saydim.map(l=>(
                <span key={l} style={{background:'#dcfce7',color:'#15803d',borderRadius:6,padding:'3px 8px',fontSize:11,fontWeight:600,fontFamily:'monospace'}}>{l}</span>
              ))}
            </div>
          </div>
        )}
        <LokPicker onSelect={lok=>{setSelectedLok(lok);setView('sayim');}} currentLok={saydim[saydim.length-1]} />
      </div>
    );
  }

  /* ── MAL KABUL BAŞLANGIÇ ── */
  if(view==='mal_kabul'){
    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📥 Mal Kabul</p>
        </div>
        <div style={{padding:16}}>
          <div style={S.card}>
            <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:10}}>Sayım Türü</p>
            <div style={{display:'flex',gap:10}}>
              {[['manuel','Manuel'],['referansli','Referanslı']].map(([t,l])=>(
                <button key={t} onClick={()=>setMkTur(t)}
                  style={{...S.btn,flex:1,background:mkTur===t?'#1e40af':'#f1f5f9',color:mkTur===t?'#fff':'#475569'}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {mkTur==='referansli'&&(
            <div style={S.card}>
              <p style={{fontSize:13,fontWeight:700,marginBottom:8}}>Referans Dosyası</p>
              {mkRef.length>0
                ?<div style={{display:'flex',alignItems:'center',gap:10}}>
                  <p style={{fontSize:12,color:'#10b981',fontWeight:600,flex:1}}>✅ {mkRef.length} kalem</p>
                  <button onClick={async()=>{setMkRef([]); if(activeSession?.id){await updateDoc(doc(db,'countSessions',activeSession.id),{referenceItems:[],updatedAt:Timestamp.now()});}}} style={{...S.btn,background:'#fee2e2',color:'#ef4444',padding:'6px 12px',fontSize:12}}>Değiştir</button>
                </div>
                :<label style={{...S.btn,background:'#f1f5f9',color:'#475569',display:'inline-block',cursor:'pointer'}}>
                  📂 Dosya Seç
                  <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])parseMkRef(e.target.files[0]);e.target.value='';}} />
                </label>
              }
            </div>
          )}
          <button onClick={startMalKabulSayim}
            disabled={loading||(mkTur==='referansli'&&mkRef.length===0)}
            style={{...S.btn,width:'100%',background:'#7c3aed',color:'#fff',opacity:(mkTur==='referansli'&&mkRef.length===0)?.5:1}}>
            Sayıma Başla →
          </button>
        </div>
      </div>
    );
  }

  /* ── MAL KABUL ÖZET + VAS AYRIMI ── */
  if(view==='mk_ozet'&&activeSession){
    const allItems={};
    mkEntries.forEach(e=>{
      (e.items||[]).forEach(item=>{
        const key=item.malzemeKodu||item.ean;
        if(!allItems[key]) allItems[key]={...item,adet:0,hasarliAdet:0};
        allItems[key].adet+=item.adet;
        allItems[key].hasarliAdet+=(item.hasarliAdet||0);
      });
    });
    const itemList=Object.values(allItems);
    const toplam=itemList.reduce((a,i)=>a+i.adet,0);
    const toplamHasar=itemList.reduce((a,i)=>a+(i.hasarliAdet||0),0);

    const getItemInfo = (item) => {
      const eanKey = String(item?.ean || '').trim();
      const malzemeKey = String(item?.malzemeKodu || '').trim();
      const p = products[eanKey] || products[malzemeKey] || {};
      return {
        urunAdi: p.urunAdi || item.urunAdi || 'Ürün adı bulunamadı',
        ean: p.ean || item.ean || '',
        malzemeKodu: p.malzemeKodu || item.malzemeKodu || '',
      };
    };

    const ItemKodDetay = ({ item }) => {
      const info = getItemInfo(item);
      return (
        <div style={{marginTop:3}}>
          <p style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{info.urunAdi}</p>
          <p style={{fontSize:10,color:'#64748b',fontFamily:'monospace',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            Malzeme: {info.malzemeKodu || '-'} · EAN: {info.ean || '-'}
          </p>
        </div>
      );
    };

    const refMap=Object.fromEntries(mkRef.map(r=>[r.malzemeKodu,r]));
    const tamEslesen=mkRef.length>0&&itemList.every(item=>{
      const ref=refMap[item.malzemeKodu];
      return ref&&ref.beklenenAdet===item.adet;
    });

    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📥 Mal Kabul Özeti</p>
        </div>
        <div style={{padding:16}}>
          <div style={{...S.card,background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
            <p style={{fontSize:12,fontWeight:700,color:'#15803d'}}>📊 Özet</p>
            <p style={{fontSize:12,color:'#166534',marginTop:4}}>{itemList.length} kalem · {toplam.toLocaleString()} adet{toplamHasar>0?` · ⚠️ ${toplamHasar} hasarlı`:''}</p>
            {tamEslesen&&<p style={{fontSize:12,color:'#10b981',marginTop:4,fontWeight:600}}>✅ Referans ile tam eşleşme</p>}
            {mkRef.length>0&&!tamEslesen&&<p style={{fontSize:12,color:'#d97706',marginTop:4,fontWeight:600}}>⚠️ Referans ile fark var</p>}
          </div>

          {/* VAS Ayrımı */}
          {itemList.length>0&&(
            <div style={S.card}>
              <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:4}}>VAS Transfer</p>
              <p style={{fontSize:11,color:'#64748b',marginBottom:10}}>Ürün tipi VAS'a transfer edilecekse sayılan gerçek adedin tamamı VAS'a gider.</p>
              {itemList.map((item,i)=>{
                const key=item.ean||item.malzemeKodu;
                const selected=(vasItems[key]||0)>=item.adet;
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <ItemKodDetay item={item} />
                      <p style={{fontSize:10,color:'#94a3b8',marginTop:2}}>Sayılan: {item.adet}{selected?' · VAS transfer edilecek':''}{item.hasarliAdet>0?` · ⚠️${item.hasarliAdet} hasarlı`:''}</p>
                    </div>
                    <button onClick={()=>{
                      const next={...vasItems,[key]:selected?0:item.adet};
                      setVasItems(next);
                      persistMalKabulOptions(next,mkLokasyonlar);
                    }}
                      style={{...S.btn,background:selected?'#7c3aed':'#f1f5f9',color:selected?'#fff':'#475569',padding:'7px 10px',fontSize:12,flexShrink:0}}>
                      {selected?'↩ Transfer İptal':'🏷️ VAS’a Transfer Et'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lokasyon girişi — VAS'a gitmeyenler için */}
          {itemList.filter(item=>(vasItems[item.ean||item.malzemeKodu]||0)<item.adet).length>0&&(
            <div style={S.card}>
              <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:4}}>📍 Lokasyon Ata</p>
              <p style={{fontSize:11,color:'#64748b',marginBottom:10}}>Direkt lokasyona gidecek ürünler için lokasyon girin</p>
              {/* Toplu uygula */}
              <div style={{background:'#eff6ff',borderRadius:8,padding:'8px 10px',marginBottom:10}}>
                <p style={{fontSize:11,fontWeight:600,color:'#1d4ed8',marginBottom:5}}>Tümüne aynı lokasyon:</p>
                <input placeholder="A109S013B" style={{width:'100%',padding:'7px 10px',border:'1px solid #bfdbfe',borderRadius:7,fontSize:13,fontFamily:'monospace',outline:'none',boxSizing:'border-box'}}
                  onChange={e=>{
                    const lok=e.target.value.trim().toUpperCase();
                    if(!lok) return;
                    const newLoks={...mkLokasyonlar};
                    itemList.forEach(item=>{
                      if((vasItems[item.ean||item.malzemeKodu]||0)<item.adet)
                        newLoks[item.ean||item.malzemeKodu]=lok;
                    });
                    setMkLokasyonlar(newLoks);
                    persistMalKabulOptions(vasItems,newLoks);
                  }} />
              </div>
              {itemList.filter(item=>(vasItems[item.ean||item.malzemeKodu]||0)<item.adet).map((item,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid #f1f5f9'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <ItemKodDetay item={item} />
                  </div>
                  <input placeholder="Lokasyon"
                    value={mkLokasyonlar[item.ean||item.malzemeKodu]||''}
                    onChange={e=>{const next={...mkLokasyonlar,[item.ean||item.malzemeKodu]:e.target.value.trim().toUpperCase()};setMkLokasyonlar(next);persistMalKabulOptions(vasItems,next);}}
                    style={{width:110,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:11,fontFamily:'monospace',outline:'none',
                      background:mkLokasyonlar[item.ean||item.malzemeKodu]?'#f0fdf4':'#fff'}} />
                </div>
              ))}
            </div>
          )}

          <button onClick={()=>setView('mk_sayim')}
            style={{...S.btn,width:'100%',background:'#3b82f6',color:'#fff',marginBottom:10}}>
            ➕ Daha Fazla Ürün Say
          </button>
          {isAdmin&&(
            <button onClick={()=>{ const missing=itemList.find(i=>!mkLokasyonlar[i.ean||i.malzemeKodu]&&(vasItems[i.ean||i.malzemeKodu]||0)<i.adet); if(missing){const info=getItemInfo(missing); alert((info.urunAdi||info.malzemeKodu||info.ean)+' için lokasyon giriniz');return;} malKabulOnayla(vasItems,mkLokasyonlar);}} disabled={loading||itemList.length===0}
              style={{...S.btn,width:'100%',background:'#10b981',color:'#fff',opacity:loading?.6:1}}>
              {loading?'Ekleniyor...':'✅ Onayla ve Stoğa Ekle'}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── VAS LİSTESİ ── */
  if(view==='vas_liste'){
    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>🏷️ VAS — Etiketleme Bekleyenler</p>
        </div>
        <div style={{padding:16}}>
          {vasList.length===0&&<p style={{color:'#94a3b8',textAlign:'center',padding:'32px 0'}}>VAS'ta bekleyen ürün yok</p>}
          {vasList.map(item=>(
            <VasCard key={item.id} item={item} onSend={vasLokasyonaGonder} />
          ))}
        </div>
      </div>
    );
  }

  /* ── ADMİN DETAY ── */
  if(view==='admin_detay'&&activeSession){
    const lokGroups={};
    allEntries.forEach(e=>{if(!lokGroups[e.lokasyon])lokGroups[e.lokasyon]=[];lokGroups[e.lokasyon].push(e);});
    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('genel_lok')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>Sayım Yönetimi</p>
          <button onClick={()=>exportGenelSayim(activeSession.id)}
            style={{...S.btn,marginLeft:'auto',background:'#10b981',color:'#fff',padding:'7px 12px',fontSize:12}}>
            ⬇️ Kök Stok Excel
          </button>
        </div>
        <div style={{padding:16}}>
          <div style={{...S.card,background:'#f8fafc'}}>
            <p style={{fontSize:12,color:'#64748b'}}>{allEntries.length} giriş · {Object.keys(lokGroups).length} lokasyon · {conflicts.length} çakışma</p>
          </div>
          {conflicts.map((c,i)=>(
            <div key={i} style={{...S.card,border:'1px solid #fecaca',background:'#fff1f2'}}>
              <p style={{fontSize:12,fontWeight:700,color:'#dc2626',marginBottom:8}}>⚠️ Çakışma: {c.lokasyon}</p>
              <div style={{display:'flex',gap:8}}>
                {[c.entry1,c.entry2].map((e,j)=>(
                  <button key={j} onClick={async()=>{
                    await updateDoc(doc(db,'countEntries',e.id),{durum:'onaylandi'});
                    const other=j===0?c.entry2:c.entry1;
                    await updateDoc(doc(db,'countEntries',other.id),{durum:'reddedildi'});
                    setConflicts(prev=>prev.filter(x=>x.lokasyon!==c.lokasyon));
                    toast$('Çakışma çözüldü ✓','success');
                  }}
                    style={{...S.btn,flex:1,background:'#f1f5f9',color:'#1e293b',fontSize:12}}>
                    ✓ {e.kullanici}<br/><span style={{fontSize:10,color:'#64748b'}}>{e.items?.length} kalem</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {Object.entries(lokGroups).map(([lok,entries])=>(
            <div key={lok} style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <p style={{fontSize:12,fontWeight:700,fontFamily:'monospace',color:'#1e293b',flex:1}}>{lok}</p>
                {entries.length>1
                  ?<span style={{background:'#fef3c7',color:'#d97706',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>⚠️ {entries.length}</span>
                  :<span style={{background:'#dcfce7',color:'#15803d',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>✅</span>}
              </div>
              {entries.map((e,j)=>(
                <p key={j} style={{fontSize:11,color:'#64748b',marginTop:2}}>{e.kullanici}: {e.items?.length} kalem</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── LİST ── */
  const visibleSessions = sessions.filter(s => s.tip === moduleSessionTip);
  const aktifler=visibleSessions.filter(s=>s.durum==='aktif');
  const bitmisler=visibleSessions.filter(s=>s.durum!=='aktif');

  return (
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <p style={{color:'#fff',fontWeight:700,fontSize:16}}>{isMalKabulModule ? '📥 Mal Kabul' : '🔢 Sayım'}</p>
        {isMalKabulModule && (
          <button onClick={()=>{loadVasItems();setView('vas_liste');}}
            style={{...S.btn,background:'#7c3aed',color:'#fff',padding:'7px 12px',fontSize:12}}>
            🏷️ VAS Listesi
          </button>
        )}
      </div>
      <div style={{padding:16}}>
        {isAdmin && !isMalKabulModule && (
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            <button onClick={()=>startSession('genel')} disabled={loading}
              style={{...S.btn,flex:1,background:'#1e40af',color:'#fff'}}>
              📦 Genel Sayım Başlat
            </button>
          </div>
        )}
        {isMalKabulModule && (
          <button onClick={()=>{setActiveSession(null);setMkTur('manuel');setMkRef([]);setMkEntries([]);setVasItems({});setMkLokasyonlar({});setView('mal_kabul');}} disabled={loading}
            style={{...S.btn,width:'100%',background:'#7c3aed',color:'#fff',marginBottom:16}}>
            📥 Mal Kabul Sayımı Başlat
          </button>
        )}

        {aktifler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Aktif Oturumlar</p>
            {aktifler.map(s=>(
              <div key={s.id} style={{...S.card,border:'1px solid #bfdbfe',background:'#eff6ff'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>{s.tip==='genel'?'📦 Genel Sayım':'📥 Mal Kabul'}</p>
                    <p style={{fontSize:11,color:'#64748b'}}>{s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||''}</p>
                  </div>
                  <button onClick={()=>{if(s.tip==='mal_kabul') openMalKabulSession(s); else {setActiveSession(s);loadEntries(s.id);setView('genel_lok');}}}
                    style={{...S.btn,background:'#1e40af',color:'#fff',padding:'8px 14px',fontSize:12}}>
                    {s.baslantanId===user?.uid?'Devam →':'Katıl →'}
                  </button>
                  {isAdmin&&(
                    <button onClick={()=>deleteSession(s)}
                      style={{...S.btn,background:'#fee2e2',color:'#ef4444',padding:'8px 10px',fontSize:13}}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {bitmisler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8,marginTop:16}}>Tamamlanan</p>
            {bitmisler.slice(0,10).map(s=>(
              <div key={s.id} style={S.card}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:600,color:'#475569'}}>{s.tip==='genel'?'📦 Genel Sayım':'📥 Mal Kabul'}</p>
                    <p style={{fontSize:11,color:'#94a3b8'}}>{s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||''}</p>
                  </div>
                  {isAdmin&&s.tip==='genel'&&(
                    <button onClick={()=>exportGenelSayim(s.id)}
                      style={{...S.btn,background:'#f1f5f9',color:'#475569',padding:'6px 10px',fontSize:11}}>
                      ⬇️ Excel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {visibleSessions.length===0&&!loading&&(
          <div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}>
            <p style={{fontSize:32,marginBottom:8}}>{isMalKabulModule ? '📥' : '🔢'}</p>
            <p style={{fontSize:14,fontWeight:600}}>{isMalKabulModule ? 'Henüz mal kabul yok' : 'Henüz sayım yok'}</p>
          </div>
        )}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── VAS KART ── */
function VasCard({ item, onSend }) {
  const [lok, setLok] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  return (
    <div style={{background:'#fff',borderRadius:14,padding:'14px 16px',border:'1px solid #e2e8f0',marginBottom:12}}>
      <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:2}}>{item.urunAdi||'Ürün adı bulunamadı'}</p>
      <p style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace',marginBottom:8}}>Malzeme: {item.malzemeKodu||'-'} · EAN: {item.ean||'-'} · {item.adet} adet</p>
      {!showPicker?(
        <div style={{display:'flex',gap:8}}>
          <input value={lok} onChange={e=>setLok(e.target.value.toUpperCase())}
            placeholder="Lokasyon (örn: A109S013B)"
            style={{flex:1,padding:'8px 12px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',fontFamily:'monospace'}} />
          <button onClick={()=>setShowPicker(true)}
            style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'8px 10px',cursor:'pointer',fontSize:13}}>
            📍
          </button>
          <button onClick={()=>onSend(item,lok)} disabled={!lok}
            style={{background:'#10b981',border:'none',borderRadius:8,color:'#fff',padding:'8px 14px',fontSize:13,fontWeight:600,cursor:'pointer',opacity: !lok ? .5 : 1}}>
            Gönder ✓
          </button>
        </div>
      ):(
        <div>
          <LokPicker onSelect={l=>{setLok(l);setShowPicker(false);}} />
        </div>
      )}
    </div>
  );
}
