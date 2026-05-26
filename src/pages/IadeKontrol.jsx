import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';

const NEDENLER = ['Hasarlı Ürün','Yanlış Ürün Gönderildi','Müşteri İptali','Eksik Ürün','Ambalaj Bozuk','Diğer'];

function Toast({ msg, type, onDone }) {
  const bg = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return <div style={{ position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'88vw',textAlign:'center' }}>{msg}</div>;
}

export default function IadeKontrol() {
  const { user, profile } = useAuth();
  const [step, setStep]       = useState('cari');   // cari | scan | done
  const [cariIsim, setCari]   = useState('');
  const [cariSearch, setCS]   = useState('');
  const [customers, setCustomers] = useState([]);
  const [items, setItems]     = useState([]); // scanned items
  const [products, setProducts] = useState({}); // ean → product info
  const [barInput, setBarInput] = useState('');
  const [mode, setMode]       = useState('text');
  const [camOn, setCamOn]     = useState(false);
  const [neden, setNeden]     = useState('');
  const [toast, setToast]     = useState(null);
  const [saving, setSaving]   = useState(false);
  const [editIdx, setEditIdx] = useState(null);

  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const detectorRef = useRef(null);
  const rafRef      = useRef(null);
  const lastBcRef   = useRef({ code:'', ts:0 });
  const inputRef    = useRef(null);
  const itemsRef    = useRef(items);
  const prodsRef    = useRef(products);
  const scanFnRef   = useRef(null);

  useEffect(()=>{ itemsRef.current=items; },[items]);
  useEffect(()=>{ prodsRef.current=products; },[products]);

  const toast$ = useCallback((msg,type='info')=>setToast({msg,type,id:Date.now()}),[]);

  useEffect(()=>{
    const load = async () => {
      try {
        // Load customers (auto-built from orders)
        const snap = await getDocs(collection(db,'customers'));
        const list = snap.docs.map(d=>d.data().cariIsim||d.data().name||'').filter(Boolean);
        // Also get unique cari from orders
        const oSnap = await getDocs(collection(db,'orders'));
        const fromOrders = [...new Set(oSnap.docs.map(d=>d.data().cariIsim).filter(Boolean))];
        setCustomers([...new Set([...list,...fromOrders])].sort());
        // Load products for name lookup
        const pSnap = await getDocs(collection(db,'products'));
        const pMap = {};
        pSnap.docs.forEach(d=>{ const p=d.data(); if(p.ean) pMap[p.ean]=p; });
        setProducts(pMap);
      } catch {}
    };
    load();
  },[]);

  const processScan = useCallback((code)=>{
    const c=String(code).trim(); if (!c) return;
    const prod = prodsRef.current[c];
    setItems(prev=>{
      const idx = prev.findIndex(i=>i.ean===c);
      if (idx>=0) {
        const updated=[...prev];
        updated[idx]={...updated[idx],adet:updated[idx].adet+1};
        toast$(`${updated[idx].urunAdi||c}: ${updated[idx].adet} adet`,'info');
        return updated;
      }
      toast$(prod?`${prod.urunAdi} eklendi`:`Barkod eklendi: ${c}`,'success');
      return [...prev,{ ean:c, urunAdi:prod?.urunAdi||'', malzemeKodu:prod?.malzemeKodu||'', adet:1, neden }];
    });
  },[toast$, neden]);

  useEffect(()=>{ scanFnRef.current=processScan; },[processScan]);

  const stopCam = useCallback(()=>{
    if (rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
    if (streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    if (videoRef.current) videoRef.current.srcObject=null;
    setCamOn(false);
  },[]);

  const startCam = useCallback(async()=>{
    if (streamRef.current) return;
    if (!('BarcodeDetector' in window)){toast$('Kamera desteklenmiyor','warning');setMode('text');return;}
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
    } catch(e){toast$('Kamera açılamadı','error');setMode('text');}
  },[toast$]);

  useEffect(()=>{
    if(step!=='scan')return;
    if(mode==='camera'){startCam();return()=>stopCam();}
    else{stopCam();setTimeout(()=>inputRef.current?.focus(),150);}
  },[mode,step]);
  useEffect(()=>()=>stopCam(),[]);

  const handleSave = async () => {
    if (!items.length){toast$('Ürün eklenmedi','error');return;}
    if (!neden){toast$('İade nedeni seçin','error');return;}
    setSaving(true);
    try {
      await addDoc(collection(db,'returns'),{
        cariIsim, tarih:Timestamp.now(),
        operator:profile?.name||user?.email||'',
        operatorId:user?.uid||'',
        items:items.map(i=>({...i,neden:i.neden||neden})),
        neden, durum:'bekliyor',
        toplamAdet:items.reduce((a,i)=>a+i.adet,0),
      });
      toast$('İade kaydedildi, onay bekleniyor ✓','success');
      setStep('done');
    } catch(e){toast$('Kayıt hatası: '+e.message,'error');}
    finally{setSaving(false);}
  };

  const filteredCustomers = customers.filter(c=>c.toLowerCase().includes(cariSearch.toLowerCase())).slice(0,20);

  if (step==='done') return (
    <div>
      <div style={{ background:'#0f172a',padding:'12px 16px' }}><h2 style={{ color:'#f8fafc',fontSize:15,fontWeight:700 }}>↩️ İade Kontrol</h2></div>
      <div style={{ padding:24,textAlign:'center' }}>
        <div style={{ fontSize:64,marginBottom:16 }}>✅</div>
        <h2 style={{ fontSize:20,fontWeight:700,color:'#0f172a',marginBottom:8 }}>İade Kaydedildi!</h2>
        <p style={{ color:'#64748b',fontSize:14,marginBottom:4 }}>{cariIsim}</p>
        <p style={{ color:'#64748b',fontSize:14,marginBottom:24 }}>{items.reduce((a,i)=>a+i.adet,0)} adet · Onay bekliyor</p>
        <button onClick={()=>{setStep('cari');setCari('');setItems([]);setNeden('');}} style={{ background:'linear-gradient(135deg,#3b82f6,#6366f1)',border:'none',color:'#fff',padding:'13px 28px',borderRadius:12,fontWeight:700,cursor:'pointer',fontSize:14 }}>Yeni İade</button>
      </div>
    </div>
  );

  if (step==='scan') return (
    <div style={{ height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <div style={{ background:'#0f172a',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
        <button onClick={()=>setStep('cari')} style={{ background:'rgba(255,255,255,.08)',border:'none',color:'#94a3b8',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>←</button>
        <div style={{ flex:1 }}>
          <p style={{ color:'#e2e8f0',fontSize:13,fontWeight:700 }}>↩️ İade — {cariIsim}</p>
          <p style={{ color:'#64748b',fontSize:11 }}>{items.reduce((a,i)=>a+i.adet,0)} adet okutuldu</p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 12px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer' }}>
          {saving?'Kaydediliyor...':'Kaydet'}
        </button>
      </div>

      {/* Neden */}
      <div style={{ background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'8px 12px',flexShrink:0 }}>
        <p style={{ fontSize:11,fontWeight:600,color:'#64748b',marginBottom:5 }}>İADE NEDENİ:</p>
        <div style={{ display:'flex',gap:5,overflowX:'auto',paddingBottom:2 }}>
          {NEDENLER.map(n=>(
            <button key={n} onClick={()=>setNeden(n)} style={{ padding:'5px 10px',borderRadius:8,border:`2px solid ${neden===n?'#3b82f6':'#e2e8f0'}`,background:neden===n?'#eff6ff':'#fff',color:neden===n?'#2563eb':'#64748b',fontWeight:600,cursor:'pointer',fontSize:11,whiteSpace:'nowrap',flexShrink:0 }}>{n}</button>
          ))}
        </div>
      </div>

      {/* Scanner */}
      <div style={{ background:'#fff',borderBottom:'1px solid #f1f5f9',flexShrink:0 }}>
        <div style={{ display:'flex',borderBottom:'1px solid #f1f5f9' }}>
          {[{id:'camera',lbl:'📷 Kamera'},{id:'text',lbl:'⌨️ Metin'}].map(({id,lbl})=>(
            <button key={id} onClick={()=>setMode(id)} style={{ flex:1,padding:'10px 0',fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:mode===id?'#0f172a':'transparent',color:mode===id?'#fff':'#64748b' }}>{lbl}</button>
          ))}
        </div>
        {mode==='camera'?(
          <div style={{ position:'relative',background:'#000',height:140 }}>
            <video ref={videoRef} style={{ width:'100%',height:'100%',objectFit:'cover' }} playsInline muted />
            {!camOn&&<div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center' }}><p style={{ color:'rgba(255,255,255,.5)',fontSize:13 }}>📷 Başlatılıyor...</p></div>}
          </div>
        ):(
          <div style={{ padding:'10px 10px 6px',display:'flex',gap:7 }}>
            <input ref={inputRef} value={barInput} onChange={e=>setBarInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&barInput.trim()){processScan(barInput);setBarInput('');}}}
              placeholder="Barkod okutun → Enter"
              style={{ flex:1,border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,background:'#f8fafc',fontFamily:'monospace',outline:'none' }}
              onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
            <button onClick={()=>{if(barInput.trim()){processScan(barInput);setBarInput('');inputRef.current?.focus();}}} style={{ background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'#fff',border:'none',padding:'0 16px',borderRadius:10,fontWeight:700,cursor:'pointer' }}>Ekle</button>
          </div>
        )}
      </div>

      {/* Items list */}
      <div style={{ flex:1,overflowY:'auto',padding:'10px 10px 20px' }}>
        {items.length===0?(
          <div style={{ textAlign:'center',padding:'40px 0',color:'#94a3b8' }}><p style={{ fontSize:32,marginBottom:8 }}>📦</p><p style={{ fontSize:13 }}>Henüz ürün eklenmedi</p></div>
        ):items.map((item,idx)=>(
          <div key={idx} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:'11px 12px',marginBottom:7,display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ flex:1,minWidth:0 }}>
              <p style={{ fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.urunAdi||'Bilinmeyen Ürün'}</p>
              <p style={{ fontSize:10,color:'#94a3b8',fontFamily:'monospace' }}>{item.ean}</p>
              {item.neden&&<p style={{ fontSize:10,color:'#f59e0b',marginTop:2 }}>{item.neden}</p>}
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
              <button onClick={()=>{const u=[...items];if(u[idx].adet>1)u[idx]={...u[idx],adet:u[idx].adet-1};else u.splice(idx,1);setItems(u);}} style={{ width:26,height:26,borderRadius:8,border:'1px solid #e2e8f0',background:'#f1f5f9',cursor:'pointer',fontWeight:700 }}>−</button>
              <span style={{ fontSize:15,fontWeight:800,fontFamily:'monospace',color:'#f59e0b',minWidth:20,textAlign:'center' }}>{item.adet}</span>
              <button onClick={()=>{const u=[...items];u[idx]={...u[idx],adet:u[idx].adet+1};setItems(u);}} style={{ width:26,height:26,borderRadius:8,border:'1px solid #e2e8f0',background:'#f1f5f9',cursor:'pointer',fontWeight:700 }}>+</button>
            </div>
          </div>
        ))}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );

  return (
    <div>
      <div style={{ background:'#0f172a',padding:'12px 16px' }}><h2 style={{ color:'#f8fafc',fontSize:15,fontWeight:700 }}>↩️ İade Kontrol</h2></div>
      <div style={{ padding:'16px',maxWidth:500,margin:'0 auto' }}>
        <div style={{ background:'#fff',borderRadius:16,padding:20,border:'1px solid #e2e8f0' }}>
          <p style={{ fontSize:14,fontWeight:700,color:'#0f172a',marginBottom:16 }}>Cari Seçin</p>
          <input value={cariSearch} onChange={e=>setCS(e.target.value)} placeholder="Cari ismi ara..." style={{ width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,outline:'none',marginBottom:10 }} onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
          <div style={{ maxHeight:280,overflowY:'auto' }}>
            {filteredCustomers.map(c=>(
              <button key={c} onClick={()=>{setCari(c);setStep('scan');}} style={{ width:'100%',textAlign:'left',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e8f0',background:'#f8fafc',cursor:'pointer',fontSize:13,fontWeight:500,color:'#334155',marginBottom:5,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                {c}<span style={{ color:'#94a3b8' }}>›</span>
              </button>
            ))}
            {filteredCustomers.length===0&&<p style={{ textAlign:'center',color:'#94a3b8',fontSize:13,padding:16 }}>{customers.length===0?'Henüz cari kaydı yok. Siparişler işlendikçe otomatik oluşur.':'Sonuç bulunamadı'}</p>}
          </div>
          <div style={{ marginTop:12,borderTop:'1px solid #e2e8f0',paddingTop:12 }}>
            <p style={{ fontSize:12,color:'#64748b',marginBottom:8 }}>Listede yok mu?</p>
            <div style={{ display:'flex',gap:8 }}>
              <input value={cariIsim} onChange={e=>setCari(e.target.value)} placeholder="Cari adını yazın..." style={{ flex:1,border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none' }} onFocus={e=>e.target.style.borderColor='#f59e0b'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
              <button onClick={()=>{ if(cariIsim.trim()){setStep('scan');}}} style={{ background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'#fff',border:'none',padding:'0 16px',borderRadius:10,fontWeight:700,cursor:'pointer',fontSize:13 }}>Devam</button>
            </div>
          </div>
        </div>
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
