import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, query,
         where, orderBy, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

/* ── TOAST ── */
function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'88vw',textAlign:'center',boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>{msg}</div>;
}

/* ── LOK PICKER ── */
function LokPicker({ onSelect }) {
  const [kor, setKor] = useState('109');
  const [raf, setRaf] = useState(null);
  return (
    <div style={{padding:16}}>
      <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Koridor</p>
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {['109','110'].map(k=>(
          <button key={k} onClick={()=>{setKor(k);setRaf(null);}}
            style={{flex:1,border:'none',borderRadius:10,padding:'10px 0',fontSize:15,fontWeight:700,cursor:'pointer',
              background:kor===k?'#1e40af':'#f1f5f9',color:kor===k?'#fff':'#475569'}}>
            Koridor {k}
          </button>
        ))}
      </div>
      <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
        Raf {raf?`— ${raf}`:''}
      </p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:5,maxHeight:200,overflowY:'auto',marginBottom:16}}>
        {Array.from({length:114},(_,i)=>i+1).map(n=>(
          <button key={n} onClick={()=>setRaf(n)}
            style={{padding:'6px 0',border:'none',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',
              background:raf===n?'#1e40af':'#f1f5f9',color:raf===n?'#fff':'#475569'}}>
            {n}
          </button>
        ))}
      </div>
      {raf && (
        <>
          <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Kat</p>
          <div style={{display:'flex',gap:8}}>
            {['A','B','C','D','E','F'].map(k=>(
              <button key={k} onClick={()=>onSelect(`A${kor}S${String(raf).padStart(3,'0')}${k}`)}
                style={{flex:1,border:'none',borderRadius:8,padding:'10px 0',fontSize:14,fontWeight:700,cursor:'pointer',
                  background:'#1e40af',color:'#fff'}}>
                {k}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── SAYIM EKRANI ── */
function SayimEkrani({ lokasyon, sessionId, sessionTip, products, onSubmit, onBack }) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState({});
  const [barInput, setBarInput] = useState('');
  const [mode, setMode] = useState('text');
  const [camOn, setCamOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const lastBcRef = useRef({code:'',ts:0});
  const inputRef = useRef(null);
  const entriesRef = useRef(entries);
  useEffect(()=>{entriesRef.current=entries;},[entries]);

  const stopCam = useCallback(()=>{
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    streamRef.current=null; setCamOn(false);
  },[]);

  const scan = useCallback(()=>{
    if(!videoRef.current||!detectorRef.current) return;
    detectorRef.current.detect(videoRef.current).then(res=>{
      if(res.length>0){
        const code=res[0].rawValue; const now=Date.now();
        if(code!==lastBcRef.current.code||now-lastBcRef.current.ts>2000){
          lastBcRef.current={code,ts:now};
          const prod=entriesRef.current;
          const ean=String(code).trim();
          setEntries(prev=>({...prev,[ean]:(prev[ean]||0)+1}));
          toast$(products[ean]?.urunAdi||ean,'success');
        }
      }
      rafRef.current=requestAnimationFrame(scan);
    }).catch(()=>{ rafRef.current=requestAnimationFrame(scan); });
  },[products]);

  const startCam = useCallback(async()=>{
    try{
      if(!('BarcodeDetector' in window)){toast$('Kamera tarayıcı desteklenmiyor','error');return;}
      if(!detectorRef.current) detectorRef.current=new window.BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','qr_code']});
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      setCamOn(true); rafRef.current=requestAnimationFrame(scan);
    }catch(e){toast$('Kamera hatası: '+e.message,'error');}
  },[scan]);

  useEffect(()=>{return()=>{stopCam();};},[stopCam]);

  const handleText = (e) => {
    if(e.key!=='Enter') return;
    const ean=barInput.trim(); if(!ean) return;
    setEntries(prev=>({...prev,[ean]:(prev[ean]||0)+1}));
    toast$(products[ean]?.urunAdi||ean,'success');
    setBarInput('');
  };

  const setManual = (ean, val) => {
    const n=parseInt(val)||0;
    setEntries(prev=>({...prev,[ean]:n}));
  };

  const handleSubmit = async () => {
    if(Object.keys(entries).length===0){toast$('Hiç ürün girilmedi','error');return;}
    setSaving(true);
    try {
      const items = Object.entries(entries).map(([ean,adet])=>({
        ean, adet,
        urunAdi: products[ean]?.urunAdi||'',
        malzemeKodu: products[ean]?.malzemeKodu||'',
      }));
      const ref = await addDoc(collection(db,'countEntries'),{
        sessionId, lokasyon, tip: sessionTip,
        kullanici: profile?.name||user?.email||'',
        kullaniciId: user?.uid||'',
        items, tarih: Timestamp.now(), durum: 'bekliyor',
      });
      onSubmit(ref.id, items);
    } catch(e){toast$('Hata: '+e.message,'error');}
    setSaving(false);
  };

  const itemList = Object.entries(entries).filter(([,v])=>v>0);

  return (
    <div>
      <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
        <div>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📍 {lokasyon}</p>
          <p style={{color:'#94a3b8',fontSize:11}}>{itemList.length} kalem · {itemList.reduce((a,[,v])=>a+v,0)} adet</p>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          style={{marginLeft:'auto',background:'#10b981',border:'none',borderRadius:10,color:'#fff',padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer',opacity:saving?.6:1}}>
          {saving?'Kaydediliyor...':'Kaydet ✓'}
        </button>
      </div>

      <div style={{display:'flex',borderBottom:'1px solid #e2e8f0'}}>
        {[['text','⌨️ Metin'],['cam','📷 Kamera']].map(([m,l])=>(
          <button key={m} onClick={()=>{if(m==='cam'&&!camOn)startCam();if(m!=='cam')stopCam();setMode(m);}}
            style={{flex:1,border:'none',padding:'12px',fontSize:13,fontWeight:600,cursor:'pointer',
              background:mode===m?'#0f172a':'#f8fafc',color:mode===m?'#fff':'#64748b'}}>
            {l}
          </button>
        ))}
      </div>

      {mode==='cam'&&(
        <div style={{position:'relative',background:'#000',maxHeight:240,overflow:'hidden'}}>
          <video ref={videoRef} style={{width:'100%',maxHeight:240,objectFit:'cover'}} playsInline muted />
          {!camOn&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <button onClick={startCam} style={{background:'#3b82f6',border:'none',color:'#fff',borderRadius:10,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer'}}>Kamerayı Başlat</button>
          </div>}
        </div>
      )}

      {mode==='text'&&(
        <div style={{padding:'12px 16px'}}>
          <div style={{display:'flex',gap:8}}>
            <input ref={inputRef} value={barInput} onChange={e=>setBarInput(e.target.value)} onKeyDown={handleText}
              placeholder="Barkod okutun veya yazın → Enter"
              style={{flex:1,padding:'10px 14px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,outline:'none'}} autoFocus />
            <button onClick={()=>handleText({key:'Enter'})} style={{background:'#1e40af',border:'none',borderRadius:10,color:'#fff',padding:'10px 16px',fontWeight:700,cursor:'pointer'}}>Tara</button>
          </div>
        </div>
      )}

      <div style={{padding:'0 16px 16px'}}>
        {itemList.length===0&&<p style={{color:'#94a3b8',fontSize:13,textAlign:'center',padding:'24px 0'}}>Henüz ürün taranmadı</p>}
        {itemList.map(([ean,adet])=>{
          const p=products[ean]||{};
          return (
            <div key={ean} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.urunAdi||ean}</p>
                <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{p.malzemeKodu||ean}</p>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                <button onClick={()=>setManual(ean,adet-1)} style={{width:28,height:28,borderRadius:7,border:'1px solid #cbd5e1',background:'#f8fafc',cursor:'pointer',fontWeight:700,fontSize:16}}>−</button>
                <input type="number" value={adet} onChange={e=>setManual(ean,e.target.value)}
                  style={{width:40,textAlign:'center',border:'1px solid #e2e8f0',borderRadius:7,padding:'4px 0',fontSize:14,fontWeight:700}} />
                <button onClick={()=>setManual(ean,adet+1)} style={{width:28,height:28,borderRadius:7,border:'1px solid #cbd5e1',background:'#f8fafc',cursor:'pointer',fontWeight:700,fontSize:16}}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── ANA SAYFA ── */
export default function DepoSayimi() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [view, setView] = useState('list');          // list|genel_lok|sayim|admin_detay|cakisma|mal_kabul|mk_sayim|mk_ozet
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [selectedLok, setSelectedLok] = useState(null);
  const [myEntries, setMyEntries] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [products, setProducts] = useState({});
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  // Mal kabul
  const [mkTur, setMkTur] = useState('manuel');
  const [mkRef, setMkRef] = useState([]);
  const [mkEntries, setMkEntries] = useState([]);
  // Çakışma
  const [conflicts, setConflicts] = useState([]);
  const [resolvedConflicts, setResolvedConflicts] = useState({});

  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  // Ürünleri yükle
  useEffect(()=>{
    getDocs(collection(db,'products')).then(snap=>{
      const m={};
      snap.docs.forEach(d=>{const p=d.data();if(p.ean)m[p.ean]=p;});
      setProducts(m);
    });
  },[]);

  // Oturumları yükle
  const loadSessions = useCallback(async()=>{
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'countSessions'),orderBy('baslangic','desc')));
      setSessions(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch{}
    setLoading(false);
  },[]);

  useEffect(()=>{loadSessions();},[loadSessions]);

  // Oturuma ait girişleri yükle
  const loadEntries = useCallback(async(sessionId)=>{
    const snap = await getDocs(query(collection(db,'countEntries'),where('sessionId','==',sessionId)));
    const entries = snap.docs.map(d=>({id:d.id,...d.data()}));
    setAllEntries(entries);
    setMyEntries(entries.filter(e=>e.kullaniciId===user?.uid));
    detectConflicts(entries);
  },[user]);

  const detectConflicts = (entries) => {
    const byLok = {};
    entries.forEach(e=>{
      if(!e.lokasyon||e.lokasyon==='MAL_KABUL') return;
      if(!byLok[e.lokasyon]) byLok[e.lokasyon]=[];
      byLok[e.lokasyon].push(e);
    });
    const caks = [];
    Object.entries(byLok).forEach(([lok,elist])=>{
      if(elist.length<2) return;
      // Tüm çiftleri karşılaştır
      for(let i=0;i<elist.length;i++){
        for(let j=i+1;j<elist.length;j++){
          const same = entriesMatch(elist[i].items, elist[j].items);
          if(!same) caks.push({lokasyon:lok, entry1:elist[i], entry2:elist[j]});
        }
      }
    });
    setConflicts(caks);
  };

  const entriesMatch = (items1, items2) => {
    if(!items1||!items2||items1.length!==items2.length) return false;
    const map1 = Object.fromEntries((items1||[]).map(i=>[i.ean,i.adet]));
    const map2 = Object.fromEntries((items2||[]).map(i=>[i.ean,i.adet]));
    const keys = new Set([...Object.keys(map1),...Object.keys(map2)]);
    for(const k of keys){ if(map1[k]!==map2[k]) return false; }
    return true;
  };

  /* ── YENİ OTURUM BAŞLAT ── */
  const startSession = async (tip) => {
    setLoading(true);
    try {
      const ref = await addDoc(collection(db,'countSessions'),{
        tip, tur:'manuel', durum:'aktif',
        baslatan: profile?.name||user?.email||'',
        baslantanId: user?.uid||'',
        baslangic: Timestamp.now(),
      });
      const session = {id:ref.id, tip, tur:'manuel', durum:'aktif',
        baslatan:profile?.name||user?.email||'', baslangic:Timestamp.now()};
      setActiveSession(session);
      setSessions(prev=>[session,...prev]);
      if(tip==='genel') setView('genel_lok');
      else setView('mal_kabul');
    } catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  /* ── OTURUMA KATIL ── */
  const joinSession = (session) => {
    setActiveSession(session);
    loadEntries(session.id);
    if(session.tip==='genel') setView('genel_lok');
    else if(session.tip==='mal_kabul') setView('mk_ozet');
  };

  /* ── SAYIM GÖNDERİLDİ ── */
  const handleSayimSubmit = async (entryId, items) => {
    toast$(`${selectedLok} kaydedildi ✓`,'success');
    setMyEntries(prev=>[...prev,{id:entryId,lokasyon:selectedLok,items,kullaniciId:user?.uid,kullanici:profile?.name||''}]);
    setSelectedLok(null);
    setView('genel_lok');
  };

  /* ── MAL KABUL REFERANS DOSYASI ── */
  const parseMkRef = (file) => {
    const reader = new FileReader();
    reader.onload = ({target:{result}})=>{
      try {
        const wb = XLSX.read(new Uint8Array(result),{type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hIdx=0,cCode=-1,cUrun=-1,cAdet=-1,cEan=-1;
        for(let r=0;r<Math.min(rows.length,10);r++){
          const cells=rows[r].map(c=>String(c||'').toLowerCase().replace(/\s+/g,' ').trim());
          let found=false;
          cells.forEach((cell,j)=>{
            if(/(malzeme|ürün kodu|elis|item)\s*(kodu?|code?)?/.test(cell)&&cCode<0){cCode=j;found=true;}
            if(/ean|barkod/.test(cell)&&cEan<0){cEan=j;found=true;}
            if(/ürün adı|ürün adi|description|sistem/.test(cell)&&cUrun<0){cUrun=j;found=true;}
            if(/miktar|adet|qty|toplam/.test(cell)&&cAdet<0){cAdet=j;found=true;}
          });
          if(found&&cAdet>=0){hIdx=r;break;}
        }
        const refData=[];
        rows.slice(hIdx+1).forEach(row=>{
          const kod=cCode>=0?String(row[cCode]||'').trim():'';
          const adet=parseInt(String(row[cAdet]||'0').replace(/\D/g,''))||0;
          if((!kod)||adet<=0) return;
          const urunAdi=cUrun>=0?String(row[cUrun]||'').trim():'';
          const ean=cEan>=0?String(row[cEan]||'').trim():'';
          refData.push({malzemeKodu:kod,urunAdi,ean,beklenenAdet:adet});
        });
        setMkRef(refData);
        toast$(`${refData.length} kalem referans yüklendi`,'success');
      }catch(e){toast$('Dosya hatası: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  /* ── MAL KABUL ONAY ── */
  const malKabulOnayla = async () => {
    if(!activeSession) return;
    setLoading(true);
    try {
      // Tüm girişleri topla
      const snap = await getDocs(query(collection(db,'countEntries'),where('sessionId','==',activeSession.id)));
      const allItems = {};
      snap.docs.forEach(d=>{
        (d.data().items||[]).forEach(item=>{
          const key=item.malzemeKodu||item.ean;
          if(!allItems[key]) allItems[key]={...item,adet:0};
          allItems[key].adet+=item.adet;
        });
      });

      // Stoka ekle
      const now=Timestamp.now();
      const stockSnap=await getDocs(collection(db,'stock'));
      const stockMap={};
      stockSnap.docs.forEach(d=>{stockMap[d.id]=d.data();});

      const batch=writeBatch(db);
      const movBatch=writeBatch(db);
      Object.values(allItems).forEach(item=>{
        if(!item.ean) return;
        const prev=(stockMap[item.ean]?.miktar)||0;
        const next=prev+item.adet;
        batch.set(doc(db,'stock',item.ean),{ean:item.ean,miktar:next,urunAdi:item.urunAdi||'',malzemeKodu:item.malzemeKodu||'',sonGuncelleme:now},{merge:true});
        movBatch.set(doc(collection(db,'stockMovements')),{
          tarih:now,tip:'mal_kabul',ean:item.ean,
          malzemeKodu:item.malzemeKodu||'',urunAdi:item.urunAdi||'',
          miktar:item.adet,oncekiMiktar:prev,sonrakiMiktar:next,
          kaynak:`mal_kabul:${activeSession.id}`,
          yapan:profile?.name||user?.email||'',yapanId:user?.uid||''
        });
      });
      await batch.commit();
      await movBatch.commit();
      await updateDoc(doc(db,'countSessions',activeSession.id),{durum:'tamamlandi',bitis:now});
      toast$('Mal kabul stoğa eklendi ✓','success');
      setView('list');
      loadSessions();
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  /* ── GENEL SAYIM SONUÇ EXPORT ── */
  const exportGenelSayim = async (sessionId) => {
    const snap = await getDocs(query(collection(db,'countEntries'),where('sessionId','==',sessionId)));
    const allEntries = snap.docs.map(d=>d.data());
    // Çakışma olmayan veya çözülmüş girişleri kullan
    const lokMap = {};
    allEntries.forEach(e=>{
      if(e.lokasyon==='MAL_KABUL') return;
      const lok=e.lokasyon;
      if(!lokMap[lok]) lokMap[lok]=[];
      lokMap[lok].push(e);
    });

    const rows=[['EAN Kodu','Malzeme Kodu','Ürün Adı','Sayılan Adet','Lokasyon']];
    Object.entries(lokMap).forEach(([lok,entries])=>{
      // En son girilen veya onaylanan
      const entry = entries[entries.length-1];
      (entry.items||[]).forEach(item=>{
        rows.push([item.ean||'',item.malzemeKodu||'',item.urunAdi||'',item.adet,lok]);
      });
    });

    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,'Sayim');
    XLSX.writeFile(wb,'genel_sayim_kok_stok.xlsx');
  };

  /* ── ÇAKIŞMA ÇÖZÜM ── */
  const resolveConflict = async (lokasyon, winnerEntryId) => {
    setResolvedConflicts(prev=>({...prev,[lokasyon]:winnerEntryId}));
    // Kaybeden girişleri 'reddedildi' yap
    const cakisma = conflicts.find(c=>c.lokasyon===lokasyon);
    if(!cakisma) return;
    const loser = cakisma.entry1.id===winnerEntryId ? cakisma.entry2 : cakisma.entry1;
    await updateDoc(doc(db,'countEntries',loser.id),{durum:'reddedildi'});
    await updateDoc(doc(db,'countEntries',winnerEntryId),{durum:'onaylandi'});
    toast$(`${lokasyon} çakışması çözüldü ✓`,'success');
    setConflicts(prev=>prev.filter(c=>c.lokasyon!==lokasyon));
  };

  const S = {
    card:{background:'#fff',borderRadius:14,padding:'14px 16px',border:'1px solid #e2e8f0',marginBottom:12},
    btn:{border:'none',borderRadius:10,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer'},
  };

  /* ── VIEWS ── */

  // Sayım ekranı
  if(view==='sayim'&&selectedLok&&activeSession){
    return <SayimEkrani
      lokasyon={selectedLok}
      sessionId={activeSession.id}
      sessionTip={activeSession.tip}
      products={products}
      onSubmit={handleSayimSubmit}
      onBack={()=>{setSelectedLok(null);setView('genel_lok');}}
    />;
  }

  // Mal kabul sayım ekranı
  if(view==='mk_sayim'&&activeSession){
    return <SayimEkrani
      lokasyon="MAL_KABUL"
      sessionId={activeSession.id}
      sessionTip="mal_kabul"
      products={products}
      onSubmit={(id,items)=>{
        setMkEntries(prev=>[...prev,{id,items}]);
        setView('mk_ozet');
      }}
      onBack={()=>setView('mk_ozet')}
    />;
  }

  // Genel sayım — lokasyon seç
  if(view==='genel_lok'&&activeSession){
    const saydim = myEntries.map(e=>e.lokasyon);
    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setView('list');setActiveSession(null);}} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <div>
            <p style={{color:'#fff',fontWeight:700,fontSize:14}}>
              {activeSession.tip==='genel'?'📦 Genel Sayım':'📥 Mal Kabul'}
            </p>
            <p style={{color:'#94a3b8',fontSize:11}}>Lokasyon seç → say → kaydet</p>
          </div>
          {isAdmin&&activeSession.tip==='genel'&&(
            <button onClick={()=>{loadEntries(activeSession.id);setView('admin_detay');}}
              style={{...S.btn,marginLeft:'auto',background:'#3b82f6',color:'#fff',padding:'7px 12px',fontSize:12}}>
              Yönet
            </button>
          )}
        </div>
        {saydim.length>0&&(
          <div style={{padding:'12px 16px',background:'#f0fdf4',borderBottom:'1px solid #dcfce7'}}>
            <p style={{fontSize:12,fontWeight:700,color:'#15803d',marginBottom:6}}>✅ Saydığım lokasyonlar ({saydim.length})</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {saydim.map(l=>(
                <span key={l} style={{background:'#dcfce7',color:'#15803d',borderRadius:6,padding:'3px 8px',fontSize:11,fontWeight:600,fontFamily:'monospace'}}>{l}</span>
              ))}
            </div>
          </div>
        )}
        <div style={{padding:16}}>
          <p style={{fontSize:13,fontWeight:600,color:'#1e293b',marginBottom:12}}>📍 Sayacağın lokasyonu seç:</p>
          <LokPicker onSelect={lok=>{setSelectedLok(lok);setView('sayim');}} />
        </div>
      </div>
    );
  }

  // Mal kabul özet/onay
  if(view==='mk_ozet'&&activeSession){
    const allItems={};
    mkEntries.forEach(e=>{
      (e.items||[]).forEach(item=>{
        const key=item.malzemeKodu||item.ean||item.urunAdi;
        if(!allItems[key]) allItems[key]={...item,adet:0};
        allItems[key].adet+=item.adet;
      });
    });
    const itemList=Object.values(allItems);
    const toplam=itemList.reduce((a,i)=>a+i.adet,0);

    // Referanslı karşılaştırma
    const refMap=Object.fromEntries(mkRef.map(r=>[r.malzemeKodu,r]));
    const farkVar = mkTur==='referansli' && mkRef.length>0 && itemList.some(item=>{
      const ref=refMap[item.malzemeKodu];
      return !ref || ref.beklenenAdet!==item.adet;
    });

    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('mal_kabul')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📥 Mal Kabul Özeti</p>
        </div>
        <div style={{padding:16}}>
          <div style={{...S.card,background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
            <p style={{fontSize:13,fontWeight:700,color:'#15803d'}}>📊 Özet</p>
            <p style={{fontSize:12,color:'#166534',marginTop:4}}>{itemList.length} kalem · {toplam.toLocaleString()} toplam adet</p>
            {farkVar&&<p style={{fontSize:12,color:'#dc2626',marginTop:4,fontWeight:600}}>⚠️ Referans ile fark var — onay gerekiyor</p>}
          </div>

          {mkRef.length>0&&(
            <div style={S.card}>
              <p style={{fontSize:12,fontWeight:700,color:'#64748b',marginBottom:8}}>REFERANS KARŞILAŞTIRMA</p>
              {itemList.slice(0,20).map((item,i)=>{
                const ref=refMap[item.malzemeKodu];
                const beklenen=ref?.beklenenAdet||'—';
                const fark=ref?item.adet-ref.beklenenAdet:null;
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid #f1f5f9'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.urunAdi||item.malzemeKodu}</p>
                      <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{item.malzemeKodu}</p>
                    </div>
                    <p style={{fontSize:12,color:'#64748b',flexShrink:0}}>Bek: {beklenen}</p>
                    <p style={{fontSize:13,fontWeight:700,flexShrink:0,color:fark===0?'#10b981':fark>0?'#3b82f6':'#ef4444'}}>
                      {item.adet} {fark!==null&&fark!==0?`(${fark>0?'+':''}${fark})`:''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {mkRef.length===0&&(
            <div style={S.card}>
              <p style={{fontSize:12,fontWeight:700,color:'#64748b',marginBottom:8}}>SAYILAN ÜRÜNLER</p>
              {itemList.slice(0,30).map((item,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid #f1f5f9'}}>
                  <div style={{flex:1}}><p style={{fontSize:12,fontWeight:600,color:'#1e293b'}}>{item.urunAdi||item.malzemeKodu}</p></div>
                  <p style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>{item.adet}</p>
                </div>
              ))}
            </div>
          )}

          <button onClick={()=>setView('mk_sayim')}
            style={{...S.btn,width:'100%',background:'#3b82f6',color:'#fff',marginBottom:10}}>
            ➕ Daha Fazla Ürün Say
          </button>

          {isAdmin&&(
            <button onClick={malKabulOnayla} disabled={loading}
              style={{...S.btn,width:'100%',background:'#10b981',color:'#fff',opacity:loading?.6:1}}>
              {loading?'Ekleniyor...':'✅ Onayla ve Stoğa Ekle'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Mal kabul başlangıç
  if(view==='mal_kabul'){
    return (
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📥 Mal Kabul Sayımı</p>
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
              <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:8}}>Referans Dosyası</p>
              <p style={{fontSize:11,color:'#64748b',marginBottom:10}}>Satın alma listesi — malzeme kodu + adet içeren Excel</p>
              {mkRef.length>0
                ?<p style={{fontSize:12,color:'#10b981',fontWeight:600}}>✅ {mkRef.length} kalem yüklendi</p>
                :<label style={{...S.btn,background:'#f1f5f9',color:'#475569',display:'inline-block',cursor:'pointer'}}>
                  📂 Dosya Seç
                  <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])parseMkRef(e.target.files[0]);e.target.value='';}} />
                </label>
              }
              {mkRef.length>0&&<button onClick={()=>setMkRef([])} style={{...S.btn,background:'#fee2e2',color:'#ef4444',marginLeft:8,padding:'6px 12px',fontSize:12}}>Değiştir</button>}
            </div>
          )}

          <button
            onClick={()=>{
              if(!activeSession){startSession('mal_kabul').then(()=>setView('mk_sayim'));}
              else setView('mk_sayim');
            }}
            disabled={mkTur==='referansli'&&mkRef.length===0}
            style={{...S.btn,width:'100%',background:'#10b981',color:'#fff',opacity:(mkTur==='referansli'&&mkRef.length===0)?.5:1}}>
            Sayıma Başla →
          </button>
        </div>
      </div>
    );
  }

  // Admin oturum detay
  if(view==='admin_detay'&&activeSession){
    const lokGroups={};
    allEntries.forEach(e=>{
      if(!lokGroups[e.lokasyon]) lokGroups[e.lokasyon]=[];
      lokGroups[e.lokasyon].push(e);
    });
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
          {conflicts.length>0&&(
            <div style={{...S.card,border:'1px solid #fecaca',background:'#fff1f2'}}>
              <p style={{fontSize:13,fontWeight:700,color:'#dc2626',marginBottom:10}}>⚠️ Çakışan Lokasyonlar ({conflicts.length})</p>
              {conflicts.map((c,i)=>(
                <div key={i} style={{marginBottom:12,padding:10,background:'#fff',borderRadius:10,border:'1px solid #fecaca'}}>
                  <p style={{fontSize:12,fontWeight:700,color:'#1e293b',fontFamily:'monospace',marginBottom:8}}>📍 {c.lokasyon}</p>
                  <div style={{display:'flex',gap:8}}>
                    {[c.entry1,c.entry2].map((e,j)=>(
                      <button key={j} onClick={()=>resolveConflict(c.lokasyon,e.id)}
                        style={{...S.btn,flex:1,background:resolvedConflicts[c.lokasyon]===e.id?'#10b981':'#f1f5f9',
                          color:resolvedConflicts[c.lokasyon]===e.id?'#fff':'#475569',fontSize:12}}>
                        ✓ {e.kullanici}<br/>
                        <span style={{fontSize:10}}>{e.items?.length} kalem</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {Object.entries(lokGroups).map(([lok,entries])=>(
            <div key={lok} style={{...S.card}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <p style={{fontSize:12,fontWeight:700,fontFamily:'monospace',color:'#1e293b'}}>{lok}</p>
                {entries.length>1&&<span style={{background:'#fef3c7',color:'#d97706',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>⚠️ {entries.length} giriş</span>}
                {entries.length===1&&<span style={{background:'#dcfce7',color:'#15803d',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>✅</span>}
              </div>
              {entries.map((e,j)=>(
                <p key={j} style={{fontSize:11,color:'#64748b',marginTop:2}}>{e.kullanici}: {e.items?.length} kalem · {e.items?.reduce((a,i)=>a+i.adet,0)} adet</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── LİST VIEW ── */
  const aktifler = sessions.filter(s=>s.durum==='aktif');
  const bitmisler = sessions.filter(s=>s.durum!=='aktif');

  return (
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px'}}>
        <p style={{color:'#fff',fontWeight:700,fontSize:16}}>🔢 Sayım</p>
      </div>
      <div style={{padding:16}}>
        {/* Yeni başlat */}
        {isAdmin&&(
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            <button onClick={()=>startSession('genel')} disabled={loading}
              style={{...S.btn,flex:1,background:'#1e40af',color:'#fff'}}>
              📦 Genel Sayım Başlat
            </button>
            <button onClick={()=>{setMkRef([]);setMkEntries([]);setView('mal_kabul');}} disabled={loading}
              style={{...S.btn,flex:1,background:'#7c3aed',color:'#fff'}}>
              📥 Mal Kabul
            </button>
          </div>
        )}
        {!isAdmin&&(
          <button onClick={()=>{setMkRef([]);setMkEntries([]);setView('mal_kabul');}}
            style={{...S.btn,width:'100%',background:'#7c3aed',color:'#fff',marginBottom:16}}>
            📥 Mal Kabul Sayımı
          </button>
        )}

        {/* Aktif oturumlar */}
        {aktifler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Aktif Oturumlar</p>
            {aktifler.map(s=>(
              <div key={s.id} style={{...S.card,border:'1px solid #bfdbfe',background:'#eff6ff'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>
                      {s.tip==='genel'?'📦 Genel Sayım':'📥 Mal Kabul'}
                    </p>
                    <p style={{fontSize:11,color:'#64748b'}}>
                      {s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||''}
                    </p>
                  </div>
                  <button onClick={()=>joinSession(s)}
                    style={{...S.btn,background:'#1e40af',color:'#fff',padding:'8px 14px',fontSize:12}}>
                    {s.baslantanId===user?.uid?'Devam Et →':'Katıl →'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Tamamlanan oturumlar */}
        {bitmisler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8,marginTop:16}}>Tamamlanan</p>
            {bitmisler.slice(0,10).map(s=>(
              <div key={s.id} style={{...S.card}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:600,color:'#475569'}}>
                      {s.tip==='genel'?'📦 Genel Sayım':'📥 Mal Kabul'} — {s.durum}
                    </p>
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

        {sessions.length===0&&!loading&&(
          <div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}>
            <p style={{fontSize:32,marginBottom:8}}>🔢</p>
            <p style={{fontSize:14,fontWeight:600}}>Henüz sayım yok</p>
            <p style={{fontSize:12,marginTop:4}}>Yukarıdan yeni sayım başlatın</p>
          </div>
        )}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
