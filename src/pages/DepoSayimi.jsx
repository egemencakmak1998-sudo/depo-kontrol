import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, query, where, orderBy, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'88vw',textAlign:'center'}}>{msg}</div>;
}

/* ── SCAN SESSION ────────────────────────────────────── */
function CountSession({ session, onDone }) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState({});  // ean → count
  const [products, setProducts] = useState({});
  const [barInput, setBarInput] = useState('');
  const [mode, setMode]         = useState('text');
  const [camOn, setCamOn]       = useState(false);
  const [toast, setToast]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const detectorRef = useRef(null);
  const rafRef      = useRef(null);
  const lastBcRef   = useRef({ code:'', ts:0 });
  const inputRef    = useRef(null);
  const entriesRef  = useRef(entries);
  const prodsRef    = useRef(products);
  const scanFnRef   = useRef(null);

  useEffect(()=>{ entriesRef.current=entries; },[entries]);
  useEffect(()=>{ prodsRef.current=products; },[products]);

  const toast$ = useCallback((msg,type='info')=>setToast({msg,type,id:Date.now()}),[]);

  useEffect(()=>{
    const load = async () => {
      const snap = await getDocs(collection(db,'products'));
      const map = {};
      snap.docs.forEach(d=>{ const p=d.data(); if(p.ean) map[p.ean]=p; });
      setProducts(map);
    };
    load();
  },[]);

  const processScan = useCallback((code)=>{
    const c=String(code).trim(); if (!c) return;
    const prod = prodsRef.current[c];
    setEntries(prev=>{
      const n=(prev[c]||0)+1;
      const ref = session.referansData?.[c];
      if (ref!==undefined) {
        if (n>ref)       toast$(`🔴 FAZLA: ${prod?.urunAdi||c} (${n}/${ref})`,'error');
        else if (n===ref) toast$(`🟢 TAMAM: ${prod?.urunAdi||c}`,'success');
        else              toast$(`🟡 ${prod?.urunAdi||c}: ${n}/${ref}`,'info');
      } else {
        toast$(prod?`${prod.urunAdi}: ${n} adet`:`${c}: ${n} adet`,'info');
      }
      return {...prev,[c]:n};
    });
  },[toast$,session.referansData]);

  useEffect(()=>{ scanFnRef.current=processScan; },[processScan]);

  const stopCam = useCallback(()=>{
    if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    if(videoRef.current) videoRef.current.srcObject=null;
    setCamOn(false);
  },[]);

  const startCam = useCallback(async()=>{
    if(streamRef.current) return;
    if(!('BarcodeDetector' in window)){toast$('Kamera desteklenmiyor','warning');setMode('text');return;}
    try {
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      detectorRef.current=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e']});
      setCamOn(true);
      const loop=async()=>{
        if(videoRef.current?.readyState>=2&&detectorRef.current){
          try{const res=await detectorRef.current.detect(videoRef.current);if(res.length){const bc=res[0].rawValue,now=Date.now();if(bc!==lastBcRef.current.code||now-lastBcRef.current.ts>2000){lastBcRef.current={code:bc,ts:now};scanFnRef.current?.(bc);}}}catch{}
        }
        rafRef.current=requestAnimationFrame(loop);
      };
      rafRef.current=requestAnimationFrame(loop);
    }catch(e){toast$('Kamera açılamadı','error');setMode('text');}
  },[toast$]);

  useEffect(()=>{
    if(mode==='camera'){startCam();return()=>stopCam();}
    else{stopCam();setTimeout(()=>inputRef.current?.focus(),150);}
  },[mode]);
  useEffect(()=>()=>stopCam(),[]);

  const handleFinish = async () => {
    if (!Object.keys(entries).length){ toast$('Hiç ürün taranmadı','error'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db,'countEntries'),{
        sessionId: session.id,
        lokasyon: session.lokasyon,
        kullaniciId: user?.uid,
        kullaniciAdi: profile?.name||user?.email||'',
        entries,
        tarih: Timestamp.now(),
        toplamEan: Object.keys(entries).length,
        toplamAdet: Object.values(entries).reduce((a,b)=>a+b,0),
      });
      await updateDoc(doc(db,'countSessions',session.id),{
        kullanicilar: [...(session.kullanicilar||[]), { uid:user?.uid, name:profile?.name||'' }],
        sonGuncelleme: Timestamp.now(),
      });
      toast$('Sayım kaydedildi ✓','success');
      setTimeout(()=>onDone(),1200);
    }catch(e){ toast$('Hata: '+e.message,'error'); }
    finally{ setSaving(false); }
  };

  const refData = session.referansData || {};
  const allEans = [...new Set([...Object.keys(entries),...Object.keys(refData)])];

  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#0f172a',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <button onClick={onDone} style={{background:'rgba(255,255,255,.08)',border:'none',color:'#94a3b8',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <div style={{flex:1}}>
          <p style={{color:'#e2e8f0',fontSize:13,fontWeight:700}}>🔢 {session.lokasyon} — {session.tur==='referansli'?'Referanslı':'Manuel'}</p>
          <p style={{color:'#64748b',fontSize:11}}>{Object.keys(entries).length} çeşit · {Object.values(entries).reduce((a,b)=>a+b,0)} adet</p>
        </div>
        <button onClick={handleFinish} disabled={saving} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 12px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer'}}>
          {saving?'Kaydediliyor...':'Bitir'}
        </button>
      </div>

      <div style={{background:'#fff',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
        <div style={{display:'flex',borderBottom:'1px solid #f1f5f9'}}>
          {[{id:'camera',lbl:'📷 Kamera'},{id:'text',lbl:'⌨️ Metin'}].map(({id,lbl})=>(
            <button key={id} onClick={()=>setMode(id)} style={{flex:1,padding:'10px 0',fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:mode===id?'#0f172a':'transparent',color:mode===id?'#fff':'#64748b'}}>{lbl}</button>
          ))}
        </div>
        {mode==='camera'?(
          <div style={{position:'relative',background:'#000',height:140}}>
            <video ref={videoRef} style={{width:'100%',height:'100%',objectFit:'cover'}} playsInline muted />
            {!camOn&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center'}}><p style={{color:'rgba(255,255,255,.5)',fontSize:13}}>📷 Başlatılıyor...</p></div>}
          </div>
        ):(
          <div style={{padding:'10px 10px 8px',display:'flex',gap:7}}>
            <input ref={inputRef} value={barInput} onChange={e=>setBarInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&barInput.trim()){processScan(barInput);setBarInput('');}}}
              placeholder="Barkod okutun → Enter"
              style={{flex:1,border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,background:'#f8fafc',fontFamily:'monospace',outline:'none'}}
              onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
            <button onClick={()=>{if(barInput.trim()){processScan(barInput);setBarInput('');inputRef.current?.focus();}}} style={{background:'linear-gradient(135deg,#10b981,#059669)',color:'#fff',border:'none',padding:'0 16px',borderRadius:10,fontWeight:700,cursor:'pointer'}}>Tara</button>
          </div>
        )}
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'10px 10px 20px'}}>
        {allEans.length===0?(
          <div style={{textAlign:'center',padding:'40px 0',color:'#94a3b8'}}><p style={{fontSize:32,marginBottom:8}}>🔢</p><p style={{fontSize:13}}>Henüz ürün taranmadı</p></div>
        ):allEans.map(ean=>{
          const cnt=entries[ean]||0;
          const ref=refData[ean];
          const prod=products[ean];
          const isRef=session.tur==='referansli';
          const status=!isRef?'manual':cnt===0?'missing':cnt===ref?'ok':cnt<ref?'partial':'excess';
          const bg={ok:'#f0fdf4',partial:'#fffbeb',excess:'#fef2f2',missing:'#f8fafc',manual:'#fff'};
          const border={ok:'#86efac',partial:'#fde68a',excess:'#fecaca',missing:'#e2e8f0',manual:'#e2e8f0'};
          return (
            <div key={ean} style={{background:bg[status],border:`1px solid ${border[status]}`,borderRadius:12,padding:'10px 12px',marginBottom:6,display:'flex',alignItems:'center',gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{prod?.urunAdi||'Bilinmeyen'}</p>
                <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{ean}</p>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <p style={{fontSize:14,fontWeight:800,fontFamily:'monospace',color:status==='ok'?'#10b981':status==='partial'?'#f59e0b':status==='excess'?'#ef4444':'#334155'}}>
                  {isRef?`${cnt}/${ref??'?'}`:cnt}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── MAIN ────────────────────────────────────────────── */
export default function DepoSayimi() {
  const { user, profile } = useAuth();
  const [view, setView]           = useState('list'); // list | new | session
  const [locations, setLocations] = useState([]);
  const [sessions, setSessions]   = useState([]);
  const [selLok, setSelLok]       = useState('');
  const [lokSearch, setLS]        = useState('');
  const [tur, setTur]             = useState('manuel');
  const [refFile, setRefFile]     = useState(null);
  const [refItems, setRefItems]   = useState({});
  const [activeSession, setAS]    = useState(null);
  const [toast, setToast]         = useState(null);
  const [creating, setCreating]   = useState(false);
  const toast$ = (msg,type='info')=>setToast({msg,type,id:Date.now()});

  useEffect(()=>{ loadData(); },[]);

  const loadData = async () => {
    try {
      const [pSnap, sSnap] = await Promise.all([
        getDocs(collection(db,'products')),
        getDocs(query(collection(db,'countSessions'),orderBy('baslangic','desc'))),
      ]);
      // Lokasyonları products koleksiyonundaki locations array'inden topla
      const lokSet = new Set();
      pSnap.docs.forEach(d => {
        const locs = d.data().locations || [];
        locs.forEach(l => { if (l && l.trim()) lokSet.add(l.trim()); });
      });
      const sortedLoks = [...lokSet].sort().map(kod => ({ id:kod, kod }));
      setLocations(sortedLoks);
      setSessions(sSnap.docs.map(d=>({id:d.id,...d.data()})).slice(0,30));
    } catch {}
  };

  const parseRefExcel = (file) => {
    const reader = new FileReader();
    reader.onload = ({target:{result}})=>{
      try {
        const wb=XLSX.read(new Uint8Array(result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hIdx=-1,cEan=-1,cQty=-1;
        for(let r=0;r<Math.min(rows.length,20);r++){
          const cells=rows[r].map(c=>String(c).toLowerCase().trim());
          let eF=false,qF=false;
          cells.forEach((cell,j)=>{ if(/ean|barkod/.test(cell)){cEan=j;eF=true;} if(/miktar|adet|qty/.test(cell)){cQty=j;qF=true;} });
          if(eF&&qF){hIdx=r;break;}
        }
        if(hIdx<0){toast$('EAN ve Miktar bulunamadı','error');return;}
        const map = {};
        rows.slice(hIdx+1).forEach(row=>{ const ean=String(row[cEan]||'').trim(); const qty=parseInt(String(row[cQty]).replace(/\D/g,''))||0; if(ean&&qty>0) map[ean]=qty; });
        setRefItems(map);
        toast$(`${Object.keys(map).length} ürün yüklendi`,'success');
      }catch(e){toast$('Hata: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCreate = async () => {
    if (!selLok){toast$('Lokasyon seçin','error');return;}
    if (tur==='referansli'&&!Object.keys(refItems).length){toast$('Referans Excel yükleyin','error');return;}
    setCreating(true);
    try {
      const ref = await addDoc(collection(db,'countSessions'),{
        lokasyon: selLok,
        tur,
        durum: 'devam',
        baslangic: Timestamp.now(),
        kullanicilar: [],
        referansData: tur==='referansli'?refItems:{},
        onayli: false,
      });
      setAS({ id:ref.id, lokasyon:selLok, tur, referansData:tur==='referansli'?refItems:{}, kullanicilar:[] });
      setView('session');
    }catch(e){toast$('Hata: '+e.message,'error');}
    finally{setCreating(false);}
  };

  const filteredLoks = locations.filter(l=>l.kod.toLowerCase().includes(lokSearch.toLowerCase())).slice(0,30);

  if (view==='session'&&activeSession) return (
    <CountSession session={activeSession} onDone={()=>{setView('list');setAS(null);loadData();}} />
  );

  if (view==='new') return (
    <div>
      <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}>
        <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.08)',border:'none',color:'#94a3b8',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <h2 style={{color:'#f8fafc',fontSize:15,fontWeight:700}}>🔢 Yeni Sayım</h2>
      </div>
      <div style={{padding:16,maxWidth:500,margin:'0 auto'}}>
        <div style={{background:'#fff',borderRadius:16,padding:20,border:'1px solid #e2e8f0',marginBottom:14}}>
          <p style={{fontSize:14,fontWeight:700,color:'#0f172a',marginBottom:12}}>Sayım Türü</p>
          <div style={{display:'flex',gap:8}}>
            {[{v:'manuel',l:'Manuel Sayım',sub:'Serbest ürün tara'},{v:'referansli',l:'Referanslı',sub:'Envanter ile karşılaştır'}].map(({v,l,sub})=>(
              <button key={v} onClick={()=>setTur(v)} style={{flex:1,padding:'12px',borderRadius:12,border:`2px solid ${tur===v?'#10b981':'#e2e8f0'}`,background:tur===v?'#f0fdf4':'#fff',cursor:'pointer',textAlign:'left'}}>
                <p style={{fontSize:13,fontWeight:700,color:tur===v?'#065f46':'#334155'}}>{l}</p>
                <p style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{sub}</p>
              </button>
            ))}
          </div>
        </div>

        {tur==='referansli'&&(
          <div style={{background:'#fff',borderRadius:16,padding:20,border:'1px solid #e2e8f0',marginBottom:14}}>
            <p style={{fontSize:14,fontWeight:700,color:'#0f172a',marginBottom:12}}>Referans Envanter (Excel)</p>
            <div onClick={()=>document.getElementById('refFi').click()} style={{border:'2px dashed #cbd5e1',borderRadius:12,padding:'20px',textAlign:'center',cursor:'pointer',background:Object.keys(refItems).length?'#f0fdf4':'#f8fafc'}}>
              <p style={{fontSize:24,marginBottom:6}}>{Object.keys(refItems).length?'✅':'📊'}</p>
              <p style={{fontSize:13,color:'#475569'}}>{Object.keys(refItems).length?`${Object.keys(refItems).length} ürün yüklendi`:'Excel dosyasını tıkla ve seç'}</p>
              <input id="refFi" type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{setRefFile(e.target.files[0]);parseRefExcel(e.target.files[0]);}} />
            </div>
          </div>
        )}

        <div style={{background:'#fff',borderRadius:16,padding:20,border:'1px solid #e2e8f0',marginBottom:20}}>
          <p style={{fontSize:14,fontWeight:700,color:'#0f172a',marginBottom:12}}>Lokasyon Seçin</p>
          {locations.length===0?(
            <div style={{textAlign:'center',padding:'20px 0',color:'#94a3b8'}}>
              <p style={{fontSize:13}}>Lokasyon listesi henüz yüklenmemiş.</p>
              <p style={{fontSize:12,marginTop:4}}>Yönetici panelinden eklenebilir.</p>
            </div>
          ):(
            <>
              <input value={lokSearch} onChange={e=>setLS(e.target.value)} placeholder="Lokasyon kodu ara... (örn: 11072B)" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,outline:'none',marginBottom:10,fontFamily:'monospace'}} onFocus={e=>e.target.style.borderColor='#10b981'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
              <div style={{maxHeight:200,overflowY:'auto'}}>
                {filteredLoks.map(l=>(
                  <button key={l.id} onClick={()=>setSelLok(l.kod)} style={{width:'100%',textAlign:'left',padding:'10px 12px',borderRadius:10,border:`2px solid ${selLok===l.kod?'#10b981':'#e2e8f0'}`,background:selLok===l.kod?'#f0fdf4':'#f8fafc',cursor:'pointer',fontSize:13,fontWeight:600,color:'#334155',marginBottom:5,fontFamily:'monospace'}}>
                    {l.kod} {l.aciklama&&<span style={{fontFamily:'sans-serif',fontWeight:400,color:'#94a3b8',fontSize:12}}>— {l.aciklama}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={handleCreate} disabled={creating||!selLok} style={{width:'100%',background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'14px',borderRadius:14,fontWeight:700,fontSize:15,cursor:'pointer',opacity:(!selLok||creating)?0.6:1}}>
          {creating?'Oluşturuluyor...':'Sayıma Başla'}
        </button>
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );

  return (
    <div>
      <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <h2 style={{color:'#f8fafc',fontSize:15,fontWeight:700}}>🔢 Depo Sayımı</h2>
        <button onClick={()=>setView('new')} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 14px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer'}}>+ Yeni Sayım</button>
      </div>
      <div style={{padding:'16px',maxWidth:600,margin:'0 auto'}}>
        {sessions.length===0?(
          <div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:48,marginBottom:12}}>🔢</p><p style={{fontSize:15,fontWeight:600}}>Henüz sayım yapılmadı</p><button onClick={()=>setView('new')} style={{marginTop:16,background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'12px 24px',borderRadius:12,fontWeight:700,cursor:'pointer'}}>İlk Sayımı Başlat</button></div>
        ):sessions.map(s=>{
          const d=s.baslangic?.toDate?.();
          return (
            <div key={s.id} style={{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:10,border:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:44,height:44,borderRadius:12,background:s.onayli?'#dcfce7':s.durum==='devam'?'#fef3c7':'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                {s.onayli?'✅':s.durum==='devam'?'⏳':'🔢'}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight:700,color:'#0f172a',fontFamily:'monospace'}}>{s.lokasyon}</p>
                <p style={{fontSize:11,color:'#94a3b8'}}>{s.tur==='referansli'?'Referanslı':'Manuel'} · {d?.toLocaleDateString('tr-TR')||'—'}</p>
                <p style={{fontSize:11,color:s.onayli?'#16a34a':s.durum==='devam'?'#d97706':'#64748b'}}>{s.onayli?'✓ Onaylandı':s.durum==='devam'?'Devam Ediyor':'Onay Bekliyor'}</p>
              </div>
              {s.durum==='devam'&&(
                <button onClick={()=>{setAS(s);setView('session');}} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 12px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer',flexShrink:0}}>Devam</button>
              )}
            </div>
          );
        })}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
