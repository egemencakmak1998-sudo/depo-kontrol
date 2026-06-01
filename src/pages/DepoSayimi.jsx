import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
         query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';

function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'90vw',textAlign:'center',boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>{msg}</div>;
}

/* ── LOKASYON SEÇİCİ ── */
function LokPicker({ onSelect, currentLok, sayilanLoklar=[] }) {
  const [search, setSearch] = useState('');
  const [kor, setKor] = useState(currentLok ? currentLok.slice(1,4) : '109');
  const [raf, setRaf] = useState(currentLok ? parseInt(currentLok.slice(5,8)) : null);
  const [kat, setKat] = useState(currentLok ? currentLok.slice(8) : null);
  const [camOn, setCamOn] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingLok, setPendingLok] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detRef = useRef(null);
  const rafAnimRef = useRef(null);

  const KATS = ['A','B','C','D','E','F'];
  const curLok = raf && kat ? `A${kor}S${String(raf).padStart(3,'0')}${kat}` : null;
  const curLokSayildi = curLok && sayilanLoklar.includes(curLok);

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
          setKor(m[1]); setRaf(parseInt(m[2])); setKat(m[3].toUpperCase());
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
    else if(dir==='right' && raf<117){ setRaf(raf+1); }
    else if(dir==='left' && raf>1){ setRaf(raf-1); }
  };

  const handleSearch = (val) => {
    setSearch(val);
    const m = val.trim().match(/^A?(109|110)S?(\d{2,3})([A-F])$/i);
    if(m){ setKor(m[1]); setRaf(parseInt(m[2])); setKat(m[3].toUpperCase()); }
  };

  const handleSelect = (lok) => {
    if(sayilanLoklar.includes(lok)){
      setPendingLok(lok);
      setShowConfirm(true);
    } else {
      onSelect(lok);
    }
  };

  return (
    <div style={{padding:14}}>
      {/* Sayıldı onay modalı */}
      {showConfirm&&pendingLok&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:300}}>
          <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:500}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:24}}>✅</span>
              <div>
                <p style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>Bu lokasyon sayıldı</p>
                <p style={{fontSize:12,color:'#64748b',fontFamily:'monospace'}}>{pendingLok}</p>
              </div>
            </div>
            <p style={{fontSize:13,color:'#475569',marginBottom:20}}>Bu lokasyon daha önce sayılmış. Tekrar sayarsanız mevcut veriler üzerine yazılır.</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{setShowConfirm(false);setPendingLok(null);}}
                style={{flex:1,padding:13,borderRadius:12,border:'2px solid #e2e8f0',background:'#fff',color:'#64748b',fontWeight:600,cursor:'pointer',fontSize:14}}>
                İptal
              </button>
              <button onClick={()=>{setShowConfirm(false);onSelect(pendingLok);setPendingLok(null);}}
                style={{flex:2,padding:13,borderRadius:12,border:'none',background:'#1e40af',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14}}>
                Tekrar Say →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arama + Barkod */}
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <input value={search} onChange={e=>handleSearch(e.target.value)}
          placeholder="Kod yaz (örn: A109S013B)"
          style={{flex:1,padding:'9px 12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none'}} />
        <button onClick={()=>camOn?stopCam():startCam()}
          style={{background:camOn?'#ef4444':'#1e40af',border:'none',borderRadius:10,color:'#fff',padding:'9px 14px',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
          {camOn?'⏹ Durdur':'📷 Tara'}
        </button>
      </div>

      {/* HVZ havuz hızlı seçim */}
      <button onClick={()=>handleSelect('HVZ')}
        style={{width:'100%',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:'9px 0',fontSize:13,fontWeight:700,cursor:'pointer',color:'#c2410c',marginBottom:14}}>
        📦 HVZ — Havuz (Lokasyonsuz)
      </button>

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
        Raf {raf?`— ${raf}`:''}
      </p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:4,maxHeight:160,overflowY:'auto',marginBottom:14}}>
        {Array.from({length:114},(_,i)=>i+1).map(n=>(
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
            {KATS.map(k=>{
              const lokK=`A${kor}S${String(raf).padStart(3,'0')}${k}`;
              const sayildi=sayilanLoklar.includes(lokK);
              return(
                <button key={k} onClick={()=>setKat(k)}
                  style={{flex:1,border:sayildi&&kat!==k?'2px solid #10b981':'none',borderRadius:8,padding:'10px 0',fontSize:14,fontWeight:600,cursor:'pointer',
                    background:kat===k?'#1e40af':sayildi?'#dcfce7':'#f1f5f9',
                    color:kat===k?'#fff':sayildi?'#15803d':'#475569',
                    position:'relative'}}>
                  {k}
                  {sayildi&&kat!==k&&<span style={{position:'absolute',top:2,right:3,fontSize:8,lineHeight:1}}>✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Seçilen + Onayla */}
      {curLok&&(
        <div>
          {curLokSayildi&&(
            <div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'10px 14px',marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>✅</span>
              <div>
                <p style={{fontSize:12,fontWeight:700,color:'#15803d'}}>Bu lokasyon sayıldı</p>
                <p style={{fontSize:11,color:'#166534'}}>Tekrar saymak için butona basın</p>
              </div>
            </div>
          )}
          <button onClick={()=>handleSelect(curLok)}
            style={{width:'100%',background:curLokSayildi?'#15803d':'#1e40af',border:'none',borderRadius:12,padding:'13px 0',fontSize:15,fontWeight:700,cursor:'pointer',color:'#fff'}}>
            {curLokSayildi?'🔄 Tekrar Say →':'📍 '+curLok+' — Sayıma Başla →'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── SAYIM EKRANI ── */
function SayimEkrani({ lokasyon, sessionId, sessionTip, products, lokMevcut=[], lokLoading=false, onNavigate, onSubmit, onBack, existingEntry=null }) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState(()=>{
    if(existingEntry){
      const m={};
      (existingEntry.items||[]).forEach(i=>{if(i.ean)m[i.ean]=i.adet;});
      return m;
    }
    return {};
  });
  const [hasarlilar, setHasarlilar] = useState(()=>{
    if(existingEntry){
      const m={};
      (existingEntry.items||[]).forEach(i=>{if(i.ean&&i.hasarliAdet>0)m[i.ean]=i.hasarliAdet;});
      return m;
    }
    return {};
  });
  const [barInput, setBarInput] = useState('');
  const [mode, setMode] = useState('text');
  const [camOn, setCamOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHasar, setShowHasar] = useState(false);
  const [toast, setToast] = useState(null);
  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  // Lokasyon navigasyonu — A{kor}S{raf}{kat}
  const KATS_NAV = ['A','B','C','D','E','F'];
  const navLok = (dir) => {
    const m = String(lokasyon||'').match(/^A?(109|110)S?(\d{3})([A-F])$/i);
    if(!m || !onNavigate) return;
    let kor=m[1], raf=parseInt(m[2]), kat=m[3].toUpperCase();
    const ki=KATS_NAV.indexOf(kat);
    if(dir==='up'&&ki<KATS_NAV.length-1) kat=KATS_NAV[ki+1];
    else if(dir==='down'&&ki>0) kat=KATS_NAV[ki-1];
    else if(dir==='right'&&raf<117) raf++;
    else if(dir==='left'&&raf>1) raf--;
    else return;
    if(Object.keys(entriesRef.current||{}).length>0){
      if(!window.confirm('Bu lokasyonda kaydedilmemiş sayım var. Kaydetmeden geçilsin mi?')) return;
    }
    onNavigate(`A${kor}S${String(raf).padStart(3,'0')}${kat}`);
  };

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detRef = useRef(null);
  const rafRef = useRef(null);
  const lastBcRef = useRef({code:'',ts:0});
  const missFramesRef = useRef(0); // kod kaç ardışık frame'dir kadrajda değil
  const entriesRef = useRef(entries);
  useEffect(()=>{entriesRef.current=entries;},[entries]);
  // Lokasyon değişince sayım state'ini sıfırla (yeni lokasyon = yeni sayım)
  useEffect(()=>{ setEntries({}); setHasarlilar({}); }, [lokasyon]);

  const stopCam = useCallback(()=>{
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    streamRef.current=null; setCamOn(false);
  },[]);

  const scan = useCallback(()=>{
    if(!videoRef.current||!detRef.current) return;
    const SCAN_COOLDOWN=2500;       // aynı kod bu süre içinde tekrar sayılamaz
    const MISS_FRAMES_REQUIRED=8;   // yeniden saymak için kod bu kadar frame kadrajdan çıkmalı
    detRef.current.detect(videoRef.current).then(res=>{
      const now=Date.now();
      if(res.length>0){
        const code=String(res[0].rawValue).trim();
        const last=lastBcRef.current;
        const ayniKod=code===last.code;
        const cooldownGecti=now-last.ts>SCAN_COOLDOWN;
        // Aynı kod: hem cooldown geçmeli HEM de arada kadrajdan çıkmış olmalı (el titremesi koruması)
        // Farklı kod: doğrudan say
        const kabul = !ayniKod || (cooldownGecti && missFramesRef.current>=MISS_FRAMES_REQUIRED);
        if(kabul){
          lastBcRef.current={code,ts:now};
          missFramesRef.current=0;
          const ean=code;
          setEntries(prev=>({...prev,[ean]:(prev[ean]||0)+1}));
          toast$(products[ean]?.urunAdi||ean,'success');
        } else {
          // Aynı kod hâlâ kadrajda — kayıp sayacını sıfırla
          missFramesRef.current=0;
        }
      } else {
        // Kadrajda kod yok — kayıp sayacını artır
        if(missFramesRef.current<999) missFramesRef.current++;
      }
      rafRef.current=requestAnimationFrame(scan);
    }).catch(()=>{rafRef.current=requestAnimationFrame(scan);});
  },[products]);

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
    const ean=barInput.trim(); if(!ean) return;
    setEntries(prev=>({...prev,[ean]:(prev[ean]||0)+1}));
    toast$(products[ean]?.urunAdi||ean,'success');
    setBarInput('');
  };

  const handleSubmit = async () => {
    if(Object.keys(entries).length===0){toast$('Hiç ürün girilmedi','error');return;}
    setSaving(true);
    try {
      const items = Object.entries(entries).map(([ean,adet])=>({
        ean, adet,
        urunAdi:products[ean]?.urunAdi||'',
        malzemeKodu:products[ean]?.malzemeKodu||'',
        hasarliAdet:hasarlilar[ean]||0,
      }));
      const hasarliOzet=Object.entries(hasarlilar).map(([ean,adet])=>({
        ean,adet,urunAdi:products[ean]?.urunAdi||''
      })).filter(h=>h.adet>0);

      let entryId;
      if(existingEntry){
        /* Düzenleme modu — mevcut entry güncelle */
        await updateDoc(doc(db,'countEntries',existingEntry.id),{
          items, hasarliOzet,
          tarih:Timestamp.now(),
          kullanici:profile?.name||user?.email||'',
          kullaniciId:user?.uid||'',
          durum:'bekliyor',
        });
        entryId=existingEntry.id;
      } else {
        /* Yeni kayıt */
        const ref = await addDoc(collection(db,'countEntries'),{
          sessionId, lokasyon, tip:sessionTip,
          kullanici:profile?.name||user?.email||'',
          kullaniciId:user?.uid||'',
          items, tarih:Timestamp.now(), durum:'bekliyor',
          hasarliOzet,
        });
        entryId=ref.id;
      }
      onSubmit(entryId, items, !!existingEntry);
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
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📍 {lokasyon}</p>
            {existingEntry&&<span style={{background:'#10b981',color:'#fff',borderRadius:6,padding:'2px 7px',fontSize:10,fontWeight:700}}>✏️ Düzenle</span>}
          </div>
          <p style={{color:'#94a3b8',fontSize:11}}>{itemList.length} kalem · {toplamAdet} adet{toplamHasar>0?` · ⚠️ ${toplamHasar} hasarlı`:''}</p>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          style={{background:'#10b981',border:'none',borderRadius:10,color:'#fff',padding:'8px 14px',fontWeight:700,fontSize:13,cursor:'pointer',opacity:saving?.6:1}}>
          {saving?'...':'Kaydet ✓'}
        </button>
      </div>

      {existingEntry&&(
        <div style={{background:'#fefce8',borderBottom:'1px solid #fde68a',padding:'10px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:15}}>📋</span>
            <p style={{fontSize:12,fontWeight:700,color:'#92400e'}}>Önceki Sayım Bilgileri</p>
          </div>
          <p style={{fontSize:11,color:'#a16207'}}>
            👤 {existingEntry.kullanici||'—'}
            {existingEntry.tarih?.toDate&&<> · 🕐 {(()=>{try{return existingEntry.tarih.toDate().toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return '';}})()}</>}
          </p>
          <p style={{fontSize:11,color:'#a16207',marginTop:2}}>
            📦 {(existingEntry.items||[]).length} kalem · {(existingEntry.items||[]).reduce((a,it)=>a+(it.adet||0),0)} adet sayılmış
          </p>
          <p style={{fontSize:10,color:'#ca8a04',marginTop:4,fontStyle:'italic'}}>Aşağıdaki adetler önceki sayımdan yüklendi. Kontrol edip Kaydet'e basın.</p>
        </div>
      )}

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

        {/* Lokasyon hızlı navigasyon */}
        {onNavigate&&(
          <div style={{background:'#eff6ff',borderRadius:10,padding:'8px 10px',marginBottom:10,border:'1px solid #bfdbfe'}}>
            <p style={{fontSize:10,color:'#1d4ed8',marginBottom:6,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>🧭 Hızlı Lokasyon Geçişi</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              {[['left','← Sol Raf'],['right','Sağ Raf →'],['down','↓ Alt Kat'],['up','↑ Üst Kat']].map(([d,l])=>(
                <button key={d} onClick={()=>navLok(d)}
                  style={{background:'#fff',border:'1px solid #bfdbfe',borderRadius:8,padding:'7px 0',fontSize:12,fontWeight:600,cursor:'pointer',color:'#1e40af'}}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* Bu lokasyondaki mevcut ürünler — her zaman görünür + hızlı doğrulama */}
        <div style={{background:'#eff6ff',borderRadius:10,padding:'10px 12px',marginBottom:12,border:'1px solid #bfdbfe'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <p style={{fontSize:11,fontWeight:700,color:'#1d4ed8',textTransform:'uppercase',letterSpacing:1}}>📍 Bu Lokasyondaki Mevcut Ürünler</p>
            {lokMevcut.length>0&&(
              <button onClick={()=>{
                // Tüm mevcut ürünleri stok adetleriyle sayıma onayla
                setEntries(prev=>{const n={...prev};lokMevcut.forEach(p=>{if(p.ean)n[p.ean]=(p.lokMiktar??0);});return n;});
                toast$('Tüm ürünler stok adediyle onaylandı','success');
              }} style={{background:'#1e40af',border:'none',borderRadius:7,color:'#fff',padding:'5px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                ✓ Tümünü Onayla
              </button>
            )}
          </div>
          {lokLoading
            ? <p style={{fontSize:12,color:'#64748b',textAlign:'center',padding:'8px 0'}}>Yükleniyor...</p>
            : lokMevcut.length===0
              ? <p style={{fontSize:12,color:'#64748b',textAlign:'center',padding:'8px 0'}}>Bu lokasyonda kayıtlı ürün bulunmuyor</p>
              : lokMevcut.map((p,i)=>{
                  const stokAdet=p.lokMiktar??0;
                  const sayilan=p.ean!=null?entries[p.ean]:undefined;
                  const onaylandi=sayilan!==undefined;
                  const tutuyor=onaylandi&&sayilan===stokAdet;
                  return (
                  <div key={i} style={{padding:'7px 0',borderBottom:i<lokMevcut.length-1?'1px solid #dbeafe':'none'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.urunAdi||'—'}</p>
                        <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{p.malzemeKodu}{p.malzemeKodu&&p.ean?' · ':''}{p.ean}</p>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:stokAdet<=0?'#ef4444':'#1d4ed8',flexShrink:0}}>Stok: {stokAdet}</span>
                    </div>
                    {p.ean&&(
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6}}>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <button onClick={()=>setEntries(prev=>({...prev,[p.ean]:Math.max(0,(prev[p.ean]??stokAdet)-1)}))}
                            style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700,fontSize:15}}>−</button>
                          <input type="number" value={onaylandi?sayilan:''} placeholder={String(stokAdet)}
                            onChange={e=>setEntries(prev=>({...prev,[p.ean]:Math.max(0,parseInt(e.target.value)||0)}))}
                            style={{width:48,textAlign:'center',border:'1px solid #cbd5e1',borderRadius:6,padding:'3px 0',fontSize:13,fontWeight:700,background:'#fff'}} />
                          <button onClick={()=>setEntries(prev=>({...prev,[p.ean]:(prev[p.ean]??stokAdet)+1}))}
                            style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700,fontSize:15}}>+</button>
                        </div>
                        {!onaylandi
                          ? <button onClick={()=>setEntries(prev=>({...prev,[p.ean]:stokAdet}))}
                              style={{background:'#dbeafe',border:'none',borderRadius:7,color:'#1e40af',padding:'5px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>✓ Onayla</button>
                          : tutuyor
                            ? <span style={{background:'#dcfce7',color:'#15803d',borderRadius:7,padding:'5px 10px',fontSize:11,fontWeight:700}}>✅ Tutuyor</span>
                            : <span style={{background:'#fef3c7',color:'#d97706',borderRadius:7,padding:'5px 10px',fontSize:11,fontWeight:700}}>⚠️ Fark: {sayilan-stokAdet>0?'+':''}{sayilan-stokAdet}</span>
                        }
                      </div>
                    )}
                  </div>
                );})
          }
        </div>
        {itemList.length===0&&<p style={{color:'#94a3b8',fontSize:13,textAlign:'center',padding:'16px 0'}}>Henüz ürün taranmadı</p>}
        {itemList.map(([ean,adet])=>{
          const p=products[ean]||{};
          const hasar=hasarlilar[ean]||0;
          return (
            <div key={ean} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.urunAdi||ean}</p>
                <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{p.malzemeKodu||''}{p.malzemeKodu&&ean?' · ':''}{ean}{hasar>0&&<span style={{color:'#d97706',marginLeft:8}}>⚠️ {hasar} hasarlı</span>}</p>
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
export default function DepoSayimi() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role==='admin';

  const [view, setView] = useState('list');
  const [sessions, setSessions] = useState([]);
  const [lokMevcut, setLokMevcut] = useState([]); // current products at selected location
  const [lokLoading, setLokLoading] = useState(false);
  const [lastLok, setLastLok] = useState(() => { try { return localStorage.getItem('depoKontrol:sayim:lastLok')||null; } catch { return null; } });
  const [activeSession, setActiveSession] = useState(null);
  const [selectedLok, setSelectedLok] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [myEntries, setMyEntries] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [products, setProducts] = useState({});
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [lokFilter, setLokFilter] = useState('all'); // all | counted | uncounted

  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  useEffect(()=>{
    getDocs(collection(db,'products')).then(snap=>{
      const m={};
      snap.docs.forEach(d=>{const p=d.data();if(p.ean)m[p.ean]=p;});
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

  const loadLokasyon = useCallback(async(lok) => {
    if(!lok) { setLokMevcut([]); return; }
    setLokLoading(true);
    try {
      try { localStorage.setItem('depoKontrol:sayim:lastLok', lok); } catch {}
      if(lok==='HVZ'){
        // Havuz: stok'ta byLocation.HVZ > 0 olan ürünler
        const stockSnap = await getDocs(collection(db,'stock'));
        const hvzItems = stockSnap.docs
          .map(d=>({ean:d.id,...d.data()}))
          .filter(s=>(s.byLocation?.HVZ??0)>0)
          .map(s=>({ean:s.ean,urunAdi:s.urunAdi||'',malzemeKodu:s.malzemeKodu||'',lokMiktar:s.byLocation.HVZ}));
        setLokMevcut(hvzItems.sort((a,b)=>(a.urunAdi||'').localeCompare(b.urunAdi||'')));
        setLokLoading(false);
        return;
      }
      const snap = await getDocs(query(collection(db,'products'), where('locations','array-contains',lok)));
      const prods = snap.docs.map(d=>({id:d.id,...d.data()}));
      const withStock = await Promise.all(prods.map(async p => {
        if(!p.ean) return {...p, lokMiktar:null};
        const s = await getDoc(doc(db,'stock',p.ean));
        if(!s.exists()) return {...p, lokMiktar:null};
        const lokM = s.data().byLocation?.[lok] ?? null;
        const totM = s.data().miktar ?? null;
        return {...p, lokMiktar: lokM !== null ? lokM : totM};
      }));
      setLokMevcut(withStock.sort((a,b)=>(a.urunAdi||'').localeCompare(b.urunAdi||'')));
    } catch { setLokMevcut([]); }
    setLokLoading(false);
  },[]);

  const selectLokasyon = useCallback((lok) => {
    // Bu lokasyonda benim daha önce kaydettiğim entry var mı?
    const existing = allEntries.find(e=>e.lokasyon===lok&&e.kullaniciId===undefined
      ? false : allEntries.find(e2=>e2.lokasyon===lok)) || null;
    // Tüm entry'ler arasında bu lokasyona ait en son kaydı bul
    const lokEntry = [...allEntries].filter(e=>e.lokasyon===lok)
      .sort((a,b)=>(b.tarih?.toMillis?.()??0)-(a.tarih?.toMillis?.()??0))[0] || null;
    setSelectedLok(lok);
    setSelectedEntry(lokEntry);
    setLastLok(lok);
    loadLokasyon(lok);
    setView('sayim');
  },[loadLokasyon, allEntries]);

  const loadEntries = useCallback(async(sessionId)=>{
    const snap=await getDocs(query(collection(db,'countEntries'),where('sessionId','==',sessionId)));
    const entries=snap.docs.map(d=>({id:d.id,...d.data()}));
    setAllEntries(entries);
    setMyEntries(entries.filter(e=>e.kullaniciId===user?.uid));
    detectConflicts(entries);
  },[user]);

  const startSession = async(tip) => {
    // Devam eden genel sayım varsa yeni başlatmaya izin verme
    const aktifGenel = sessions.filter(s=>s.durum==='aktif'&&s.tip==='genel');
    if(tip==='genel'&&aktifGenel.length>0){
      toast$('Zaten devam eden bir genel sayım var. Önce onu tamamlayın veya silin.','error');
      return;
    }
    if(tip==='genel'&&!window.confirm('Yeni bir genel depo sayımı başlatılacak.\n\nTüm lokasyonlar yeniden sayılacak. Devam edilsin mi?')) return;
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
      setView('genel_lok');
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

  const handleSayimSubmit = async(entryId, items, isEdit=false) => {
    if(isEdit){
      // Mevcut entry'yi güncelle
      setMyEntries(prev=>prev.map(e=>e.id===entryId?{...e,items}:e));
      setAllEntries(prev=>prev.map(e=>e.id===entryId?{...e,items}:e));
      toast$(`${selectedLok} güncellendi ✓`,'success');
    } else {
      toast$(`${selectedLok} kaydedildi ✓`,'success');
      const newEntry={id:entryId,lokasyon:selectedLok,items,kullaniciId:user?.uid,kullanici:profile?.name||''};
      setMyEntries(prev=>[...prev,newEntry]);
      setAllEntries(prev=>[...prev,newEntry]);
    }
    setSelectedLok(null);
    setSelectedEntry(null);
    setView('genel_lok');
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

  /* ── ANLIK DETAYLI EXPORT (sayım devam ederken) ── */
  const exportDetayli = (tumLoklar, entriesByLok) => {
    const fmtTarih=(t)=>{ try{return t?.toDate?.()?.toLocaleString('tr-TR')||'';}catch{return '';} };
    const rows=[['Lokasyon','Ürün Adı','Barkod/EAN','Malzeme Kodu','Sayılan Adet','Hasarlı Adet','Sayımı Yapan','Sayım Tarihi/Saati','Sayım Durumu']];
    tumLoklar.forEach(lok=>{
      const entry=entriesByLok[lok];
      if(entry&&(entry.items||[]).length>0){
        (entry.items||[]).forEach(item=>{
          rows.push([lok,item.urunAdi||'',item.ean||'',item.malzemeKodu||'',item.adet||0,item.hasarliAdet||0,entry.kullanici||'',fmtTarih(entry.tarih),'Sayıldı']);
        });
      } else {
        rows.push([lok,'','','','','','','','Sayılmadı']);
      }
    });
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!cols']=[{wch:14},{wch:34},{wch:16},{wch:16},{wch:12},{wch:12},{wch:18},{wch:20},{wch:12}];
    XLSX.utils.book_append_sheet(wb,ws,'Sayim Durumu');
    XLSX.writeFile(wb,`sayim_durum_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const S={
    card:{background:'#fff',borderRadius:14,padding:'14px 16px',border:'1px solid #e2e8f0',marginBottom:12},
    btn:{border:'none',borderRadius:10,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer'},
  };

  /* ── SAYIM EKRANI ── */
  if(view==='sayim'&&selectedLok&&activeSession){
    return <SayimEkrani lokasyon={selectedLok} sessionId={activeSession.id}
      sessionTip={activeSession.tip} products={products}
      lokMevcut={lokMevcut} lokLoading={lokLoading}
      existingEntry={selectedEntry}
      onNavigate={(newLok)=>{ setSelectedLok(newLok); setLastLok(newLok); loadLokasyon(newLok); setSelectedEntry(allEntries.find(e=>e.lokasyon===newLok)||null); }}
      onSubmit={handleSayimSubmit}
      onBack={()=>{setSelectedEntry(null);setView('genel_lok');}}/>;
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
        <LokPicker onSelect={selectLokasyon} currentLok={lastLok||saydim[saydim.length-1]} sayilanLoklar={allEntries.map(e=>e.lokasyon).filter(Boolean)} />
      </div>
    );
  }

  /* ── ADMİN DETAY ── */
  if(view==='admin_detay'&&activeSession){
    // Her lokasyon için en son entry (çok kullanıcılı: en son kaydedilen)
    const entriesByLok={};
    allEntries.forEach(e=>{
      if(!e.lokasyon||e.lokasyon==='MAL_KABUL') return;
      const cur=entriesByLok[e.lokasyon];
      if(!cur||((e.tarih?.toMillis?.()??0)>(cur.tarih?.toMillis?.()??0))) entriesByLok[e.lokasyon]=e;
    });

    // Tüm geçerli lokasyonlar — products.locations[] üzerinden
    const tumLokSet=new Set();
    Object.values(products).forEach(p=>{
      (p.locations||[]).forEach(l=>{ if(l&&l!=='BELIRLENECEK'&&/^A\d{3}S\d{3}[A-F]$/.test(l)) tumLokSet.add(l); });
    });
    // Sayılmış ama ürün listesinde olmayan lokasyonları da ekle
    Object.keys(entriesByLok).forEach(l=>tumLokSet.add(l));
    const tumLoklar=[...tumLokSet].sort();

    const sayilanLoklar=tumLoklar.filter(l=>entriesByLok[l]);
    const sayilmayanLoklar=tumLoklar.filter(l=>!entriesByLok[l]);
    const toplam=tumLoklar.length;
    const tamamlanan=sayilanLoklar.length;
    const kalan=toplam-tamamlanan;
    const yuzde=toplam>0?Math.round((tamamlanan/toplam)*100):0;

    const gosterilen=lokFilter==='counted'?sayilanLoklar:lokFilter==='uncounted'?sayilmayanLoklar:tumLoklar;
    const fmtTarih=(t)=>{ try{return t?.toDate?.()?.toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})||'';}catch{return '';} };

    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('genel_lok')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14,flex:1}}>Sayım Yönetimi</p>
          <button onClick={()=>loadEntries(activeSession.id)}
            style={{...S.btn,background:'rgba(255,255,255,.1)',color:'#fff',padding:'7px 10px',fontSize:12}}>↻</button>
        </div>

        <div style={{padding:16}}>
          {/* Progress bar */}
          <div style={S.card}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:8}}>
              <p style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Genel İlerleme</p>
              <p style={{fontSize:22,fontWeight:800,color:yuzde>=100?'#10b981':'#1e40af'}}>%{yuzde}</p>
            </div>
            <div style={{height:12,background:'#e2e8f0',borderRadius:8,overflow:'hidden',marginBottom:10}}>
              <div style={{height:'100%',width:`${yuzde}%`,background:yuzde>=100?'#10b981':'linear-gradient(90deg,#3b82f6,#1e40af)',borderRadius:8,transition:'width .3s'}} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'center'}}>
              <div style={{background:'#f8fafc',borderRadius:8,padding:'8px 4px'}}>
                <p style={{fontSize:18,fontWeight:800,color:'#0f172a'}}>{toplam}</p>
                <p style={{fontSize:10,color:'#64748b'}}>Toplam Lokasyon</p>
              </div>
              <div style={{background:'#f0fdf4',borderRadius:8,padding:'8px 4px'}}>
                <p style={{fontSize:18,fontWeight:800,color:'#15803d'}}>{tamamlanan}</p>
                <p style={{fontSize:10,color:'#15803d'}}>Tamamlanan</p>
              </div>
              <div style={{background:'#fff7ed',borderRadius:8,padding:'8px 4px'}}>
                <p style={{fontSize:18,fontWeight:800,color:'#d97706'}}>{kalan}</p>
                <p style={{fontSize:10,color:'#d97706'}}>Kalan</p>
              </div>
            </div>
          </div>

          {/* Export */}
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <button onClick={()=>exportDetayli(tumLoklar,entriesByLok)}
              style={{...S.btn,flex:1,background:'#10b981',color:'#fff',fontSize:12}}>
              ⬇️ Anlık Durum Excel
            </button>
            <button onClick={()=>exportGenelSayim(activeSession.id)}
              style={{...S.btn,flex:1,background:'#0d9488',color:'#fff',fontSize:12}}>
              ⬇️ Kök Stok Excel
            </button>
          </div>

          {/* Çakışmalar */}
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

          {/* Filtre */}
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            {[['all',`Tümü (${toplam})`],['counted',`Sayılan (${tamamlanan})`],['uncounted',`Sayılmayan (${kalan})`]].map(([f,l])=>(
              <button key={f} onClick={()=>setLokFilter(f)}
                style={{flex:1,border:'none',borderRadius:8,padding:'8px 4px',fontSize:11,fontWeight:600,cursor:'pointer',
                  background:lokFilter===f?'#1e40af':'#f1f5f9',color:lokFilter===f?'#fff':'#475569'}}>
                {l}
              </button>
            ))}
          </div>

          {/* Lokasyon listesi */}
          {gosterilen.length===0&&<p style={{color:'#94a3b8',fontSize:13,textAlign:'center',padding:'24px 0'}}>Bu filtrede lokasyon yok</p>}
          {gosterilen.map(lok=>{
            const entry=entriesByLok[lok];
            const sayildi=!!entry;
            const kalemSayisi=entry?(entry.items||[]).length:0;
            const toplamAdet=entry?(entry.items||[]).reduce((a,it)=>a+(it.adet||0),0):0;
            return (
              <div key={lok} style={{background:'#fff',borderRadius:10,padding:'10px 12px',marginBottom:6,
                border:`1px solid ${sayildi?'#bbf7d0':'#e2e8f0'}`,
                borderLeft:`3px solid ${sayildi?'#10b981':'#cbd5e1'}`}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <p style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:'#1e293b',flex:1}}>{lok}</p>
                  {sayildi
                    ?<span style={{background:'#dcfce7',color:'#15803d',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>✅ Sayıldı</span>
                    :<span style={{background:'#f1f5f9',color:'#94a3b8',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>○ Sayılmadı</span>}
                </div>
                {sayildi&&(
                  <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid #f1f5f9'}}>
                    <p style={{fontSize:11,color:'#475569'}}>👤 {entry.kullanici||'—'} · {fmtTarih(entry.tarih)}</p>
                    <p style={{fontSize:11,color:'#64748b',marginTop:2}}>📦 {kalemSayisi} kalem · {toplamAdet} adet</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── LİST ── */
  const aktifler=sessions.filter(s=>s.durum==='aktif'&&s.tip==='genel');
  const bitmisler=sessions.filter(s=>s.durum!=='aktif'&&s.tip==='genel');

  return (
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <p style={{color:'#fff',fontWeight:700,fontSize:16}}>🔢 Sayım</p>
      </div>
      <div style={{padding:16}}>
        {isAdmin&&(
          <div style={{marginBottom:16}}>
            <button onClick={()=>startSession('genel')} disabled={loading||aktifler.length>0}
              style={{...S.btn,width:'100%',background:aktifler.length>0?'#cbd5e1':'#1e40af',color:'#fff',cursor:aktifler.length>0?'not-allowed':'pointer'}}>
              📦 Genel Sayım Başlat
            </button>
            {aktifler.length>0&&<p style={{fontSize:11,color:'#d97706',marginTop:6,fontWeight:600}}>⚠️ Devam eden bir genel sayım var. Yeni sayım için önce mevcut sayımı tamamlayın veya silin.</p>}
          </div>
        )}

        {aktifler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Aktif Oturumlar</p>
            {aktifler.map(s=>(
              <div key={s.id} style={{...S.card,border:'1px solid #bfdbfe',background:'#eff6ff'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>📦 Genel Sayım</p>
                    <p style={{fontSize:11,color:'#64748b'}}>{s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||''}</p>
                  </div>
                  <button onClick={()=>{setActiveSession(s);loadEntries(s.id);setView('genel_lok');}}
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
                    <p style={{fontSize:13,fontWeight:600,color:'#475569'}}>📦 Genel Sayım</p>
                    <p style={{fontSize:11,color:'#94a3b8'}}>{s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||''}</p>
                  </div>
                  {isAdmin&&(
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

        {sessions.length===0&&!loading&&(
          <div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}>
            <p style={{fontSize:32,marginBottom:8}}>🔢</p>
            <p style={{fontSize:14,fontWeight:600}}>Henüz sayım yok</p>
          </div>
        )}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
