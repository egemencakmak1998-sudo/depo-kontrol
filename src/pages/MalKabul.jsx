import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, setDoc,
         query, where, orderBy, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

/* ── localStorage ── */
const MK_KEY = id => `depoKontrol:malKabul:${id}`;
const readMkDraft  = id => { try { const r=localStorage.getItem(MK_KEY(id)); return r?JSON.parse(r):null; } catch { return null; } };
const writeMkDraft = (id,data) => { try { localStorage.setItem(MK_KEY(id),JSON.stringify({...data,savedAt:Date.now()})); } catch {} };
const clearMkDraft = id => { try { localStorage.removeItem(MK_KEY(id)); } catch {} };
const SETUP_KEY = 'depoKontrol:malKabul:setup';
const readSetupDraft  = () => { try { const r=localStorage.getItem(SETUP_KEY); return r?JSON.parse(r):null; } catch { return null; } };
const writeSetupDraft = data => { try { localStorage.setItem(SETUP_KEY,JSON.stringify(data)); } catch {} };
const clearSetupDraft = () => { try { localStorage.removeItem(SETUP_KEY); } catch {} };

function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'90vw',textAlign:'center',boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>{msg}</div>;
}

const RAF_LIMITS={'109':{start:13,end:117},'110':{start:14,end:117}};
const getRafRange=k=>RAF_LIMITS[k]||RAF_LIMITS['109'];
const getRafList=k=>{const{start,end}=getRafRange(k);return Array.from({length:end-start+1},(_,i)=>start+i);};

function LokPicker({onSelect}){
  const[kor,setKor]=useState('109');const[raf,setRaf]=useState(null);const[kat,setKat]=useState(null);
  const[search,setSearch]=useState('');const[camOn,setCamOn]=useState(false);
  const videoRef=useRef(null);const streamRef=useRef(null);const detRef=useRef(null);const rafAnimRef=useRef(null);
  const KATS=['A','B','C','D','E','F'];
  const curLok=raf&&kat?`A${kor}S${String(raf).padStart(3,'0')}${kat}`:null;
  const stopCam=()=>{if(rafAnimRef.current)cancelAnimationFrame(rafAnimRef.current);if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;setCamOn(false);};
  const scanLok=()=>{if(!videoRef.current||!detRef.current)return;detRef.current.detect(videoRef.current).then(res=>{if(res.length>0){const m=res[0].rawValue.trim().match(/^A?(109|110)S?(\d{3})([A-F])$/i);if(m){setKor(m[1]);setRaf(parseInt(m[2]));setKat(m[3].toUpperCase());stopCam();}}rafAnimRef.current=requestAnimationFrame(scanLok);}).catch(()=>{rafAnimRef.current=requestAnimationFrame(scanLok);});};
  const startCam=async()=>{try{if(!detRef.current)detRef.current=new window.BarcodeDetector({formats:['code_128','code_39','qr_code','ean_13']});const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}setCamOn(true);rafAnimRef.current=requestAnimationFrame(scanLok);}catch{alert('Kamera açılamadı');}};
  useEffect(()=>()=>stopCam(),[]);
  const handleSearch=val=>{setSearch(val);const m=val.trim().match(/^A?(109|110)S?(\d{2,3})([A-F])$/i);if(m){setKor(m[1]);setRaf(parseInt(m[2]));setKat(m[3].toUpperCase());}};
  return(<div style={{padding:14}}>
    <div style={{display:'flex',gap:8,marginBottom:12}}>
      <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Kod yaz (A109S013B)" style={{flex:1,padding:'9px 12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none'}}/>
      <button onClick={()=>camOn?stopCam():startCam()} style={{background:camOn?'#ef4444':'#1e40af',border:'none',borderRadius:10,color:'#fff',padding:'9px 14px',fontSize:13,fontWeight:600,cursor:'pointer'}}>{camOn?'⏹':'📷 Tara'}</button>
    </div>
    {camOn&&<div style={{marginBottom:10,borderRadius:10,overflow:'hidden',background:'#000',maxHeight:160}}><video ref={videoRef} style={{width:'100%',maxHeight:160,objectFit:'cover'}} playsInline muted/></div>}
    <p style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Koridor</p>
    <div style={{display:'flex',gap:8,marginBottom:12}}>{['109','110'].map(k=><button key={k} onClick={()=>{setKor(k);setRaf(null);setKat(null);}} style={{flex:1,border:'none',borderRadius:10,padding:'9px 0',fontSize:14,fontWeight:600,cursor:'pointer',background:kor===k?'#1e40af':'#f1f5f9',color:kor===k?'#fff':'#475569'}}>{k}</button>)}</div>
    <p style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Raf {raf?`— ${raf}`:''}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:4,maxHeight:140,overflowY:'auto',marginBottom:12}}>{getRafList(kor).map(n=><button key={n} onClick={()=>{setRaf(n);setKat(null);}} style={{padding:'5px 0',border:'none',borderRadius:5,fontSize:11,fontWeight:600,cursor:'pointer',background:raf===n?'#1e40af':'#f1f5f9',color:raf===n?'#fff':'#475569'}}>{n}</button>)}</div>
    {raf&&<><p style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Kat</p><div style={{display:'flex',gap:6,marginBottom:12}}>{KATS.map(k=><button key={k} onClick={()=>setKat(k)} style={{flex:1,border:'none',borderRadius:8,padding:'9px 0',fontSize:14,fontWeight:600,cursor:'pointer',background:kat===k?'#1e40af':'#f1f5f9',color:kat===k?'#fff':'#475569'}}>{k}</button>)}</div></>}
    {curLok&&<button onClick={()=>onSelect(curLok)} style={{width:'100%',background:'#1e40af',border:'none',borderRadius:12,padding:'12px 0',fontSize:14,fontWeight:700,cursor:'pointer',color:'#fff'}}>📍 {curLok} — Seç →</button>}
  </div>);
}

function TamamlaModal({ stats, onConfirm, onCancel }) {
  const toplamEksik=(stats.partial||0)-(stats.eksikCount||0);
  const canComplete=toplamEksik===0&&(stats.pending||0)===0;
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:300}}>
      <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:500}}>
        <p style={{fontSize:17,fontWeight:700,color:'#0f172a',marginBottom:16}}>Mal Kabul Tamamla</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          <div style={{background:'#f0fdf4',borderRadius:10,padding:'10px 12px',border:'1px solid #bbf7d0'}}>
            <p style={{fontSize:22,fontWeight:800,color:'#16a34a'}}>{(stats.ok||0)+(stats.excess||0)}</p>
            <p style={{fontSize:12,color:'#15803d'}}>✅ Tam / Fazla — stoğa eklenecek</p>
          </div>
          <div style={{background:(stats.eksikCount||0)>0?'#fefce8':'#fff7ed',borderRadius:10,padding:'10px 12px',border:`1px solid ${(stats.eksikCount||0)>0?'#fde047':'#fed7aa'}`}}>
            <p style={{fontSize:22,fontWeight:800,color:(stats.eksikCount||0)>0?'#ca8a04':'#ea580c'}}>{stats.eksikCount||0}</p>
            <p style={{fontSize:12,color:(stats.eksikCount||0)>0?'#a16207':'#c2410c'}}>🔒 Eksik kabul — stoğa girmeyecek</p>
          </div>
          {toplamEksik>0&&<div style={{background:'#fef2f2',borderRadius:10,padding:'10px 12px',border:'1px solid #fecaca',gridColumn:'1/-1'}}><p style={{fontSize:15,fontWeight:800,color:'#dc2626'}}>{toplamEksik} ürün hâlâ eksik sayılmış</p><p style={{fontSize:12,color:'#b91c1c'}}>⚠️ Sayın veya "Eksik Kapat" yapın</p></div>}
          {(stats.pending||0)>0&&<div style={{background:'#fef2f2',borderRadius:10,padding:'10px 12px',border:'1px solid #fecaca',gridColumn:'1/-1'}}><p style={{fontSize:15,fontWeight:800,color:'#dc2626'}}>{stats.pending} ürün hiç taranmadı</p><p style={{fontSize:12,color:'#b91c1c'}}>⚠️ Sayın veya "Eksik Kapat" yapın</p></div>}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:13,borderRadius:12,border:'2px solid #e2e8f0',background:'#fff',color:'#64748b',fontWeight:600,cursor:'pointer',fontSize:14}}>İptal</button>
          <button onClick={onConfirm} disabled={!canComplete} style={{flex:2,padding:13,borderRadius:12,border:'none',background:canComplete?'linear-gradient(135deg,#10b981,#059669)':'#e2e8f0',color:canComplete?'#fff':'#94a3b8',fontWeight:700,cursor:canComplete?'pointer':'not-allowed',fontSize:14}}>
            {canComplete?'Onayla ve Tamamla ✓':'Önce Eksikleri Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MAL KABUL SAYIM OTURUMU ── */
function MalKabulSayimSession({ sessionId, referenceItems, products, onDone, onBack }) {
  const { user, profile } = useAuth();
  const isRef = referenceItems && referenceItems.length > 0;

  const items = isRef ? referenceItems.map((r,i)=>({
    id:`r${i}`,
    ean: String(r.ean||'').trim(),
    malzemeKodu: String(r.malzemeKodu||'').trim(),
    urunAdi: r.urunAdi||products[String(r.ean||'').trim()]?.urunAdi||products[String(r.malzemeKodu||'').trim()]?.urunAdi||r.malzemeKodu||'',
    beklenen: r.beklenenAdet||0,
  })) : [];

  /* ── Kalıcı başlangıç durumu: önce localStorage, sonra Firestore backup ── */
  const draft = readMkDraft(sessionId);
  const [counts,     setCounts]     = useState(()=>draft?.counts||{});
  const [hasarlilar, setHasarlilar] = useState(()=>draft?.hasarlilar||{});
  const [vasSet,     setVasSet]     = useState(()=>new Set(draft?.vasKeys||[]));
  const [eksikSet,   setEksikSet]   = useState(()=>new Set(draft?.eksikKeys||[]));

  const [scanHistory, setScanHistory] = useState([]);
  const [lastScan,    setLastScan]    = useState(null);
  const [mode,        setMode]        = useState('text');
  const [barInput,    setBarInput]    = useState('');
  const [camOn,       setCamOn]       = useState(false);
  const [filter,      setFilter]      = useState('all');
  const [toast,       setToast]       = useState(null);
  const [showHasar,   setShowHasar]   = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [saving,      setSaving]      = useState(false);

  /* Her state değişiminde ref'leri ANINDA güncelle */
  const countsRef    = useRef(counts);
  const hasarliRef   = useRef(hasarlilar);
  const vasRef       = useRef(vasSet);
  const eksikRef     = useRef(eksikSet);
  const sessionIdRef = useRef(sessionId);
  const refItemsRef  = useRef(referenceItems);

  /* ── ANLIK KAYIT fonksiyonu — hem localStorage hem Firestore ── */
  const persistNow = useCallback((c, h, v, e) => {
    const sid = sessionIdRef.current;
    if(!sid) return;
    const data = {
      counts:    c  ?? countsRef.current,
      hasarlilar:h  ?? hasarliRef.current,
      vasKeys:   [...(v ?? vasRef.current)],
      eksikKeys: [...(e ?? eksikRef.current)],
      referenceItems: refItemsRef.current,
    };
    writeMkDraft(sid, data);
    /* Firestore'a da yaz (async, hata verirse önemli değil) */
    updateDoc(doc(db,'countSessions',sid),{
      draftCounts: data.counts,
      draftHasarlilar: data.hasarlilar,
      draftVasKeys: data.vasKeys,
      draftEksikKeys: data.eksikKeys,
      draftSavedAt: Date.now(),
    }).catch(()=>{});
  },[]);

  /* ── Count setters: setState + ref + kayıt tek seferde ── */
  const updateCounts = useCallback((updater) => {
    setCounts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      countsRef.current = next;
      persistNow(next, null, null, null);
      return next;
    });
  },[persistNow]);

  const updateVasSet = useCallback((updater) => {
    setVasSet(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      vasRef.current = next;
      persistNow(null, null, next, null);
      return next;
    });
  },[persistNow]);

  const updateEksikSet = useCallback((updater) => {
    setEksikSet(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      eksikRef.current = next;
      persistNow(null, null, null, next);
      return next;
    });
  },[persistNow]);

  const updateHasarlilar = useCallback((updater) => {
    setHasarlilar(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      hasarliRef.current = next;
      persistNow(null, next, null, null);
      return next;
    });
  },[persistNow]);

  /* Page hide / beforeunload garantisi */
  useEffect(()=>{
    sessionIdRef.current = sessionId;
    refItemsRef.current = referenceItems;
  },[sessionId, referenceItems]);

  useEffect(()=>{
    const persist = () => persistNow(null, null, null, null);
    window.addEventListener('beforeunload', persist);
    window.addEventListener('pagehide', persist);
    const onVis = () => { if(document.visibilityState==='hidden') persist(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      persist(); // unmount anında da kaydet
      window.removeEventListener('beforeunload', persist);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVis);
    };
  },[persistNow]);

  /* ── Kamera ── */
  const videoRef=useRef(null);const streamRef=useRef(null);const detRef=useRef(null);const rafRef=useRef(null);
  const lockedBcRef=useRef('');const noBcFrameRef=useRef(0);
  const inputRef=useRef(null);const scanFnRef=useRef(null);
  const toast$=useCallback((msg,type='info')=>setToast({msg,type,id:Date.now()}),[]);

  const getKey = item => item?.ean||item?.malzemeKodu||'';

  const findItem = useCallback(code=>{
    const c=String(code||'').trim();if(!c)return null;
    if(isRef) return items.find(i=>i.ean===c||i.malzemeKodu===c)||null;
    return products[c]||null;
  },[items,isRef,products]);

  const processScan = useCallback(code=>{
    const c=String(code||'').trim();if(!c)return;
    const item=findItem(c);
    if(!item){toast$(`Bilinmeyen: ${c}`,'error');setLastScan({code:c,found:false});return;}
    const key=getKey(item);
    // Eksik işaretini kaldır
    updateEksikSet(prev=>{const n=new Set(prev);n.delete(key);return n;});
    updateCounts(prev=>{
      const n=(prev[key]||0)+1;
      setScanHistory(h=>[...h,{key,code:c,item,previousCount:prev[key]||0}]);
      if(isRef){
        if(n>item.beklenen) toast$(`🔴 FAZLA: ${item.urunAdi} ${n}/${item.beklenen}`,'error');
        else if(n===item.beklenen) toast$(`🟢 TAMAM: ${item.urunAdi}`,'success');
        else toast$(`🟡 ${item.urunAdi}: ${n}/${item.beklenen}`,'info');
      } else { toast$(item.urunAdi||c,'success'); }
      setLastScan({code:c,found:true,item,n,expected:item.beklenen});
      return {...prev,[key]:n};
    });
  },[findItem,isRef,toast$,updateCounts,updateEksikSet]);

  useEffect(()=>{scanFnRef.current=processScan;},[processScan]);

  const undoLast=useCallback(()=>{
    setScanHistory(prev=>{
      if(!prev.length){toast$('Geri alınacak yok','warning');return prev;}
      const last=prev[prev.length-1];
      updateCounts(c=>({...c,[last.key]:Math.max(0,(c[last.key]||0)-1)}));
      toast$(`↩️ Geri: ${last.item?.urunAdi||last.code}`,'info');
      return prev.slice(0,-1);
    });
  },[toast$,updateCounts]);

  const setManualCount=useCallback((item,val)=>{
    const key=getKey(item);const n=Math.max(0,parseInt(String(val).replace(/\D/g,''),10)||0);
    updateCounts(prev=>({...prev,[key]:n}));
    if(n>=item.beklenen) updateEksikSet(prev=>{const ns=new Set(prev);ns.delete(key);return ns;});
    setLastScan({code:key,found:true,item,n,expected:item.beklenen});
  },[updateCounts,updateEksikSet]);

  const stopCam=useCallback(()=>{
    if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    if(videoRef.current)videoRef.current.srcObject=null;
    lockedBcRef.current='';noBcFrameRef.current=0;setCamOn(false);
  },[]);

  const startCam=useCallback(async()=>{
    if(streamRef.current)return;
    if(!('BarcodeDetector' in window)){toast$('Kamera desteklenmiyor','warning');setMode('text');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      detRef.current=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','upc_a']});
      setCamOn(true);
      const loop=async()=>{
        if(videoRef.current?.readyState>=2&&detRef.current){
          try{const res=await detRef.current.detect(videoRef.current);
            if(!res.length){noBcFrameRef.current++;if(noBcFrameRef.current>=8)lockedBcRef.current='';}
            else{noBcFrameRef.current=0;const bc=String(res[0].rawValue||'').trim();if(bc&&bc!==lockedBcRef.current){lockedBcRef.current=bc;scanFnRef.current?.(bc);}}}catch{}
        }
        rafRef.current=requestAnimationFrame(loop);
      };
      rafRef.current=requestAnimationFrame(loop);
    }catch(e){toast$('Kamera açılamadı: '+e.message,'error');setMode('text');}
  },[toast$]);

  useEffect(()=>{
    if(mode==='camera'){startCam();return()=>stopCam();}
    stopCam();setTimeout(()=>inputRef.current?.focus(),150);
  },[mode,startCam,stopCam]);
  useEffect(()=>()=>stopCam(),[stopCam]);

  const getStatus=useCallback(item=>{
    const key=getKey(item);const c=counts[key]||0;
    if(!isRef)return c>0?'ok':'pending';
    if(eksikSet.has(key))return 'eksik';
    if(c===0)return 'pending';if(c===item.beklenen)return 'ok';if(c<item.beklenen)return 'partial';return 'excess';
  },[counts,isRef,eksikSet]);

  const freeItems=!isRef?Object.entries(counts).filter(([,v])=>v>0).map(([key,adet])=>{
    const p=products[key]||{};return{id:key,ean:p.ean||key,malzemeKodu:p.malzemeKodu||'',urunAdi:p.urunAdi||key,beklenen:0,_adet:adet};
  }):[];
  const displayItems=isRef?items:freeItems;
  const stats=isRef?items.reduce((a,item)=>{const s=getStatus(item);a[s]=(a[s]||0)+1;return a;},{pending:0,ok:0,partial:0,excess:0,eksik:0}):{ok:freeItems.length,pending:0,partial:0,excess:0,eksik:0};
  stats.eksikCount=eksikSet.size;
  const totalScanned=isRef?items.reduce((a,i)=>a+(counts[getKey(i)]||0),0):freeItems.reduce((a,i)=>a+i._adet,0);
  const totalExpected=isRef?items.reduce((a,i)=>a+i.beklenen,0):0;
  const progress=isRef&&totalExpected?Math.min(100,Math.floor((totalScanned/totalExpected)*100)):0;
  const visible=filter==='all'?displayItems:filter==='eksik'?displayItems.filter(i=>eksikSet.has(getKey(i))):displayItems.filter(i=>getStatus(i)===filter);

  const ST={pending:{dot:'#94a3b8',cnt:'#94a3b8',card:'#fff',border:'#e2e8f0'},ok:{dot:'#10b981',cnt:'#10b981',card:'#f0fdf4',border:'#86efac'},partial:{dot:'#f59e0b',cnt:'#d97706',card:'#fffbeb',border:'#fde68a'},excess:{dot:'#ef4444',cnt:'#dc2626',card:'#fef2f2',border:'#fecaca'},eksik:{dot:'#94a3b8',cnt:'#94a3b8',card:'#f8fafc',border:'#cbd5e1'}};

  const handleDone=async()=>{
    setShowModal(false);
    const total=isRef?totalScanned:freeItems.reduce((a,i)=>a+i._adet,0);
    if(total===0){toast$('Hiç ürün girilmedi','error');return;}
    setSaving(true);
    try{
      const itemsToSave=isRef
        ?items.map(item=>{const key=getKey(item);return{ean:item.ean,malzemeKodu:item.malzemeKodu,urunAdi:item.urunAdi,adet:counts[key]||0,beklenenAdet:item.beklenen,hasarliAdet:hasarlilar[key]||0,vasTransfer:vasSet.has(key),eksikKabul:eksikSet.has(key)};})
        :freeItems.map(item=>({ean:item.ean,malzemeKodu:item.malzemeKodu,urunAdi:item.urunAdi,adet:item._adet,beklenenAdet:0,hasarliAdet:hasarlilar[item.id]||0,vasTransfer:vasSet.has(item.id),eksikKabul:false}));
      const ref=await addDoc(collection(db,'countEntries'),{
        sessionId,lokasyon:'MAL_KABUL',tip:'mal_kabul',
        kullanici:profile?.name||user?.email||'',kullaniciId:user?.uid||'',
        items:itemsToSave,tarih:Timestamp.now(),durum:'bekliyor',
        eksikOzet:itemsToSave.filter(i=>i.eksikKabul).map(i=>({ean:i.ean,malzemeKodu:i.malzemeKodu,urunAdi:i.urunAdi,sayilan:i.adet,beklenen:i.beklenenAdet})),
        hasarliOzet:itemsToSave.filter(i=>i.hasarliAdet>0).map(i=>({ean:i.ean,adet:i.hasarliAdet,urunAdi:i.urunAdi})),
      });
      // Draft temizle
      await updateDoc(doc(db,'countSessions',sessionId),{lastEntryId:ref.id,draftCounts:{},draftSavedAt:Date.now()});
      clearMkDraft(sessionId);
      onDone(ref.id, itemsToSave, [...vasSet]);
    }catch(e){toast$('Hata: '+e.message,'error');}
    setSaving(false);
  };

  return(
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#f1f5f9',overflow:'hidden'}}>
      <div style={{background:'#0f172a',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <button onClick={()=>{persistNow();onBack();}} style={{background:'rgba(255,255,255,.08)',border:'none',color:'#94a3b8',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
        <div style={{flex:1}}>
          {isRef?(
            <>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{color:'#e2e8f0',fontSize:12,fontWeight:600}}>{items.length} kalem · {totalScanned}/{totalExpected} adet</span>
                <span style={{color:progress===100?'#10b981':'#94a3b8',fontSize:12,fontWeight:700}}>%{progress}</span>
              </div>
              <div style={{height:5,background:'rgba(255,255,255,.1)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,transition:'width .35s',background:progress===100?'#10b981':'linear-gradient(90deg,#3b82f6,#6366f1)',width:`${progress}%`}}/>
              </div>
            </>
          ):(
            <span style={{color:'#e2e8f0',fontSize:13,fontWeight:600}}>📥 Manuel · {freeItems.reduce((a,i)=>a+i._adet,0)} adet</span>
          )}
        </div>
        <button onClick={undoLast} disabled={!scanHistory.length} style={{background:scanHistory.length?'#f59e0b':'#334155',border:'none',color:'#fff',padding:'7px 10px',borderRadius:10,fontWeight:700,fontSize:12,cursor:scanHistory.length?'pointer':'not-allowed',flexShrink:0}}>↩️</button>
        <button onClick={()=>setShowModal(true)} disabled={saving} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 12px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer',flexShrink:0}}>Tamamla</button>
      </div>

      {isRef&&(
        <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'7px 10px',display:'flex',gap:5,overflowX:'auto',flexShrink:0}}>
          {[{key:'all',lbl:`Tümü ${items.length}`,bg:'#f1f5f9',clr:'#334155'},{key:'ok',lbl:`✅ ${stats.ok||0}`,bg:'#dcfce7',clr:'#166634'},{key:'partial',lbl:`⚠️ ${stats.partial||0}`,bg:'#fef3c7',clr:'#92400e'},{key:'eksik',lbl:`🔒 ${stats.eksik||0}`,bg:'#f1f5f9',clr:'#64748b'},{key:'excess',lbl:`❌ ${stats.excess||0}`,bg:'#fee2e2',clr:'#991b1b'},{key:'pending',lbl:`⬜ ${stats.pending||0}`,bg:'#f1f5f9',clr:'#64748b'}].map(({key,lbl,bg,clr})=>(
            <button key={key} onClick={()=>setFilter(key)} style={{background:bg,color:clr,border:`2px solid ${filter===key?'#3b82f6':'transparent'}`,padding:'4px 9px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>{lbl}</button>
          ))}
        </div>
      )}

      <div style={{display:'flex',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
        {[['camera','📷 Kamera'],['text','⌨️ Metin']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setMode(id)} style={{flex:1,padding:'10px 0',fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:mode===id?'#0f172a':'#fff',color:mode===id?'#fff':'#64748b'}}>{lbl}</button>
        ))}
        <button onClick={()=>setShowHasar(!showHasar)} style={{border:'none',padding:'10px 14px',fontSize:13,fontWeight:600,cursor:'pointer',background:showHasar?'#fef3c7':'#fff',color:showHasar?'#d97706':'#64748b',flexShrink:0}}>
          ⚠️{Object.values(hasarlilar).reduce((a,b)=>a+b,0)>0?` (${Object.values(hasarlilar).reduce((a,b)=>a+b,0)})`:''}
        </button>
      </div>

      {mode==='camera'&&(
        <div style={{position:'relative',background:'#000',height:150,flexShrink:0}}>
          <video ref={videoRef} style={{width:'100%',height:'100%',objectFit:'cover'}} playsInline muted/>
          {!camOn&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center'}}><p style={{color:'rgba(255,255,255,.5)',fontSize:13}}>📷 Başlatılıyor...</p></div>}
          {camOn&&<div style={{position:'absolute',bottom:6,right:8,background:'rgba(16,185,129,.9)',color:'#fff',fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:6}}>● CANLI</div>}
        </div>
      )}
      {mode==='text'&&(
        <div style={{background:'#fff',padding:'10px',flexShrink:0}}>
          <div style={{display:'flex',gap:7}}>
            <input ref={inputRef} value={barInput} onChange={e=>setBarInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&barInput.trim()){processScan(barInput);setBarInput('');}}}
              placeholder="Barkod okutun → Enter" autoFocus
              style={{flex:1,border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,background:'#f8fafc',fontFamily:'monospace',outline:'none'}}
              onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
            <button onClick={()=>{if(barInput.trim()){processScan(barInput);setBarInput('');inputRef.current?.focus();}}} style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',border:'none',padding:'0 16px',borderRadius:10,fontWeight:700,cursor:'pointer'}}>Tara</button>
          </div>
        </div>
      )}

      {lastScan&&(
        <div style={{margin:'0 10px',flexShrink:0,background:!lastScan.found?'#fef2f2':lastScan.n>lastScan.expected?'#fef2f2':lastScan.n===lastScan.expected?'#f0fdf4':'#fffbeb',border:`1px solid ${!lastScan.found?'#fecaca':lastScan.n>lastScan.expected?'#fecaca':lastScan.n===lastScan.expected?'#86efac':'#fde68a'}`,borderRadius:12,padding:'8px 12px',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18,flexShrink:0}}>{!lastScan.found?'❓':lastScan.n>lastScan.expected?'🔴':lastScan.n===lastScan.expected?'🟢':'🟡'}</span>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:13,fontWeight:700,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lastScan.item?.urunAdi||lastScan.code}</p>
            {lastScan.found&&<p style={{fontSize:10,color:'#64748b',fontFamily:'monospace'}}>{lastScan.code}</p>}
          </div>
          {lastScan.found&&isRef&&<span style={{fontSize:17,fontWeight:800,fontFamily:'monospace',color:lastScan.n>lastScan.expected?'#dc2626':lastScan.n===lastScan.expected?'#16a34a':'#d97706'}}>{lastScan.n}/{lastScan.expected}</span>}
        </div>
      )}

      <div style={{flex:1,overflowY:'auto',padding:'8px 10px 20px'}}>
        {showHasar&&displayItems.length>0&&(
          <div style={{background:'#fef3c7',borderRadius:10,padding:'10px 12px',marginBottom:10,border:'1px solid #fde68a'}}>
            <p style={{fontSize:12,fontWeight:700,color:'#92400e',marginBottom:8}}>⚠️ Hasarlı Adet</p>
            {displayItems.filter(i=>(counts[getKey(i)]||i._adet||0)>0).map((item,idx)=>{
              const key=getKey(item);const sayilan=counts[key]||item._adet||0;
              return(<div key={idx} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <p style={{flex:1,fontSize:12,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.urunAdi}</p>
                <input type="number" min="0" max={sayilan} value={hasarlilar[key]||0}
                  onChange={e=>updateHasarlilar(prev=>({...prev,[key]:Math.min(sayilan,Math.max(0,parseInt(e.target.value)||0))}))}
                  style={{width:52,textAlign:'center',border:'1px solid #fde68a',borderRadius:7,padding:'4px',fontSize:13,fontWeight:700,background:'#fff'}}/>
                <span style={{fontSize:11,color:'#92400e'}}>/ {sayilan}</span>
              </div>);
            })}
          </div>
        )}

        {visible.length===0&&<p style={{color:'#94a3b8',fontSize:13,textAlign:'center',padding:'24px 0'}}>Bu filtrede ürün yok</p>}

        {visible.map(item=>{
          const key=getKey(item);const cnt=counts[key]||item._adet||0;
          const status=getStatus(item);const st=ST[status]||ST.pending;
          const hasar=hasarlilar[key]||0;const pct=item.beklenen>0?Math.min(100,(cnt/item.beklenen)*100):0;
          const isVas=vasSet.has(key);const isEksik=eksikSet.has(key);
          return(
            <div key={key} style={{background:st.card,border:`1px solid ${isEksik?'#94a3b8':st.border}`,borderRadius:14,padding:'11px 12px',marginBottom:7,opacity:isEksik?.7:1}}>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:st.dot}}/>
                <div style={{flex:1,minWidth:100}}>
                  <p style={{fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.urunAdi||'—'}</p>
                  <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>
                    {item.malzemeKodu}{item.malzemeKodu?' · ':''}{item.ean}
                    {hasar>0&&<span style={{color:'#d97706',marginLeft:6}}>⚠️{hasar} hasarlı</span>}
                    {isVas&&<span style={{color:'#7c3aed',marginLeft:6}}>🏷️ VAS</span>}
                    {isEksik&&<span style={{color:'#64748b',marginLeft:6}}>🔒 Eksik</span>}
                  </p>
                </div>
                {!isEksik&&(
                  <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                    <button onClick={()=>setManualCount(item,Math.max(0,cnt-1))} style={{width:28,height:28,borderRadius:8,border:'1px solid #cbd5e1',background:'#f8fafc',fontWeight:800,cursor:'pointer',fontSize:16,lineHeight:1}}>−</button>
                    <input type="number" min="0" value={cnt} onChange={e=>setManualCount(item,e.target.value)} onFocus={e=>e.target.select()}
                      style={{width:isRef?50:38,height:28,border:`2px solid ${st.border}`,borderRadius:7,textAlign:'center',fontSize:13,fontWeight:800,fontFamily:'monospace',color:st.cnt,outline:'none',background:'#fff'}}/>
                    {isRef&&<span style={{fontSize:12,fontWeight:700,fontFamily:'monospace',color:'#94a3b8'}}>/{item.beklenen}</span>}
                    <button onClick={()=>setManualCount(item,cnt+1)} style={{width:28,height:28,borderRadius:8,border:'1px solid #cbd5e1',background:'#f8fafc',fontWeight:800,cursor:'pointer',fontSize:16,lineHeight:1}}>+</button>
                    {isRef&&cnt!==item.beklenen&&cnt>0&&<button onClick={()=>setManualCount(item,item.beklenen)} style={{height:28,padding:'0 6px',borderRadius:7,border:'1px solid #bfdbfe',background:'#eff6ff',color:'#2563eb',fontWeight:700,cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}>={item.beklenen}</button>}
                    <button onClick={()=>updateVasSet(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;})} title="VAS Transfer"
                      style={{height:28,width:28,borderRadius:7,border:`1px solid ${isVas?'#7c3aed':'#e2e8f0'}`,background:isVas?'#7c3aed':'#f8fafc',color:isVas?'#fff':'#94a3b8',fontWeight:700,cursor:'pointer',fontSize:12,flexShrink:0}}>🏷️</button>
                  </div>
                )}
                {isRef&&(status==='partial'||status==='pending')&&!isEksik&&(
                  <button onClick={()=>updateEksikSet(prev=>{const n=new Set(prev);n.add(key);return n;})}
                    style={{height:28,padding:'0 8px',borderRadius:7,border:'1px solid #fca5a5',background:'#fff1f2',color:'#dc2626',fontWeight:600,cursor:'pointer',fontSize:11,whiteSpace:'nowrap',flexShrink:0}}>
                    🔒 Eksik Kapat
                  </button>
                )}
                {isEksik&&(
                  <button onClick={()=>updateEksikSet(prev=>{const n=new Set(prev);n.delete(key);return n;})}
                    style={{height:28,padding:'0 8px',borderRadius:7,border:'1px solid #cbd5e1',background:'#f1f5f9',color:'#64748b',fontWeight:600,cursor:'pointer',fontSize:11,whiteSpace:'nowrap',flexShrink:0}}>↩ Aç</button>
                )}
              </div>
              {isRef&&item.beklenen>1&&!isEksik&&(
                <div style={{marginTop:6,marginLeft:14,height:3,background:'#e2e8f0',borderRadius:4,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:4,transition:'width .3s',width:`${pct}%`,background:cnt>=item.beklenen?'#10b981':cnt>0?'#f59e0b':'transparent'}}/>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal&&<TamamlaModal stats={{ok:stats.ok||0,partial:stats.partial||0,excess:stats.excess||0,pending:stats.pending||0,eksikCount:eksikSet.size}} onConfirm={handleDone} onCancel={()=>setShowModal(false)}/>}
      {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}

/* ── ANA COMPONENT ── */
export default function MalKabul() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role==='admin';

  const [view,         setView]         = useState('list');
  const [sessions,     setSessions]     = useState([]);
  const [activeSession,setActiveSession]= useState(null);
  const [products,     setProducts]     = useState({});
  const [toast,        setToast]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [sessionAdi,   setSessionAdi]   = useState(()=>{ const d=readSetupDraft(); return d?.sessionAdi||''; });
  const [mkTur,        setMkTur]        = useState(()=>{ const d=readSetupDraft(); return d?.mkTur||'manuel'; });
  const [mkRef,        setMkRef]        = useState(()=>{ const d=readSetupDraft(); return d?.mkRef||[]; });
  const [mkEntries,    setMkEntries]    = useState([]);
  const [vasItems,     setVasItems]     = useState({});
  const [mkLokasyonlar,setMkLokasyonlar]= useState({});
  const [vasList,      setVasList]      = useState([]);
  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  useEffect(()=>{
    getDocs(collection(db,'products')).then(snap=>{
      const m={};
      snap.docs.forEach(d=>{const p=d.data();if(p.ean)m[String(p.ean).trim()]={...p};if(p.malzemeKodu)m[String(p.malzemeKodu).trim()]={...p};});
      setProducts(m);
    });
  },[]);

  const loadSessions=useCallback(async()=>{
    try{
      // orderBy kaldırıldı — composite index gerekmeden çalışır, client-side sıralama yapılır
      const snap=await getDocs(query(collection(db,'countSessions'),where('tip','==','mal_kabul')));
      const list=snap.docs.map(d=>({id:d.id,...d.data()}));
      list.sort((a,b)=>(b.baslangic?.toMillis?.()??0)-(a.baslangic?.toMillis?.()??0));
      setSessions(list);
    }catch(e){console.error('loadSessions error:',e);}
  },[]);
  useEffect(()=>{loadSessions();},[loadSessions]);

  useEffect(()=>{
    if(mkRef.length>0||sessionAdi) writeSetupDraft({mkTur,mkRef,sessionAdi});
    else if(mkTur!=='manuel') writeSetupDraft({mkTur,mkRef:[],sessionAdi});
  },[mkRef,mkTur,sessionAdi]);

  const parseMkRef=(file)=>{
    const reader=new FileReader();
    reader.onload=({target:{result}})=>{
      try{
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
          if(!kod||adet<=0)return;
          refData.push({malzemeKodu:kod,urunAdi:cUrun>=0?String(row[cUrun]||'').trim():'',ean:cEan>=0?String(row[cEan]||'').trim():'',beklenenAdet:adet});
        });
        setMkRef(refData);
        toast$(`${refData.length} kalem yüklendi`,'success');
      }catch(e){toast$('Dosya hatası: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  const startMalKabul=async()=>{
    if(mkTur==='referansli'&&mkRef.length===0){toast$('Referans dosyası seçin','error');return;}
    setLoading(true);
    try{
      if(!activeSession){
        const ref=await addDoc(collection(db,'countSessions'),{
          tip:'mal_kabul',durum:'aktif',
          baslatan:profile?.name||user?.email||'',baslantanId:user?.uid||'',
          baslangic:Timestamp.now(),mkTur,sessionAdi:sessionAdi.trim()||'Mal Kabul',
          referenceItems:mkTur==='referansli'?mkRef:[],vasTransferItems:{},mkLokasyonlar:{}
        });
        const s={id:ref.id,tip:'mal_kabul',durum:'aktif',baslatan:profile?.name||user?.email||'',baslangic:Timestamp.now(),mkTur,sessionAdi:sessionAdi.trim()||'Mal Kabul',referenceItems:mkTur==='referansli'?mkRef:[]};
        setActiveSession(s);setSessions(prev=>[s,...prev]);
      }
      clearSetupDraft();setView('mk_sayim');
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  /* openSession: Firestore draft da kontrol et */
  const openSession=async(s)=>{
    setActiveSession(s);
    setMkTur(s.mkTur||'manuel');
    setMkRef(s.referenceItems||[]);
    setVasItems(s.vasTransferItems||{});
    setMkLokasyonlar(s.mkLokasyonlar||{});
    // localStorage draft varsa kullan, yoksa Firestore draft
    const lsDraft=readMkDraft(s.id);
    if(!lsDraft&&s.draftCounts&&Object.keys(s.draftCounts).length>0){
      writeMkDraft(s.id,{
        counts:s.draftCounts,
        hasarlilar:s.draftHasarlilar||{},
        vasKeys:s.draftVasKeys||[],
        eksikKeys:s.draftEksikKeys||[],
        referenceItems:s.referenceItems||[],
      });
    }
    const snap=await getDocs(query(collection(db,'countEntries'),where('sessionId','==',s.id)));
    const entries=snap.docs.map(d=>({id:d.id,...d.data()}));
    setMkEntries(entries.map(e=>({id:e.id,items:e.items||[]})));
    // Eğer entry yoksa veya draft varsa → sayım ekranına git
    const hasDraft=lsDraft&&Object.keys(lsDraft.counts||{}).length>0;
    setView(entries.length>0&&!hasDraft?'mk_ozet':'mk_sayim');
  };

  const handleSayimDone=(entryId,items,vasKeys=[])=>{
    setMkEntries(prev=>[...prev,{id:entryId,items}]);
    if(vasKeys.length>0){
      setVasItems(prev=>{const next={...prev};items.forEach(item=>{const key=item.ean||item.malzemeKodu;if(vasKeys.includes(key))next[key]=(next[key]||0)+item.adet;});return next;});
    }
    setView('mk_ozet');
  };

  const malKabulOnayla=async()=>{
    if(!activeSession)return;
    const allItems={};
    mkEntries.forEach(e=>{(e.items||[]).forEach(item=>{const key=item.malzemeKodu||item.ean;if(!allItems[key])allItems[key]={...item,adet:0,hasarliAdet:0,eksikKabul:false};allItems[key].adet+=item.adet;allItems[key].hasarliAdet+=(item.hasarliAdet||0);if(item.eksikKabul)allItems[key].eksikKabul=true;});});
    const itemList=Object.values(allItems);
    const missing=itemList.find(i=>!mkLokasyonlar[i.ean||i.malzemeKodu]&&(vasItems[i.ean||i.malzemeKodu]||0)<i.adet&&!i.eksikKabul);
    if(missing){toast$(`${missing.urunAdi||missing.malzemeKodu} için lokasyon girin`,'error');return;}
    setLoading(true);
    try{
      const now=Timestamp.now();
      const stockSnap=await getDocs(collection(db,'stock'));
      const stockMap={};stockSnap.docs.forEach(d=>{stockMap[d.id]=d.data();});
      const batch=writeBatch(db);const movBatch=writeBatch(db);const vasItemsToSave=[];
      itemList.forEach(item=>{
        if(!item.ean)return;
        if(item.eksikKabul)return; // eksik stoğa girmez
        const vasAdet=vasItems[item.ean||item.malzemeKodu]||0;
        const lokAdet=item.adet-vasAdet;
        if(lokAdet<=0)return; // tamamı VAS'a gidiyorsa şimdi stoğa yazma
        const prev=(stockMap[item.ean]?.miktar)||0;
        const next=prev+lokAdet;
        const lok=mkLokasyonlar[item.ean]||mkLokasyonlar[item.malzemeKodu]||'';
        const prevByLok=stockMap[item.ean]?.byLocation||{};
        const newByLok=lok&&lokAdet>0?{...prevByLok,[lok]:(prevByLok[lok]||0)+lokAdet}:prevByLok;
        batch.set(doc(db,'stock',item.ean),{ean:item.ean,miktar:next,urunAdi:item.urunAdi||'',malzemeKodu:item.malzemeKodu||'',byLocation:newByLok,sonGuncelleme:now},{merge:true});
        movBatch.set(doc(collection(db,'stockMovements')),{tarih:now,tip:'mal_kabul',ean:item.ean,malzemeKodu:item.malzemeKodu||'',urunAdi:item.urunAdi||'',miktar:lokAdet,oncekiMiktar:prev,sonrakiMiktar:next,hasarliAdet:item.hasarliAdet||0,vasAdet,lokAdet,kaynak:`mal_kabul:${activeSession.id}`,yapan:profile?.name||user?.email||'',yapanId:user?.uid||''});
        if(vasAdet>0)vasItemsToSave.push({ean:item.ean,malzemeKodu:item.malzemeKodu||'',urunAdi:item.urunAdi||'',adet:vasAdet,sessionId:activeSession.id,durum:'etiketleme_bekliyor',tarih:now});
      });
      await batch.commit();await movBatch.commit();
      for(const vi of vasItemsToSave)await addDoc(collection(db,'vasItems'),vi);
      await updateDoc(doc(db,'countSessions',activeSession.id),{durum:'tamamlandi',bitis:now});
      clearMkDraft(activeSession.id);clearSetupDraft();
      toast$('Mal kabul stoğa eklendi ✓','success');
      setView('list');setActiveSession(null);setMkEntries([]);setVasItems({});setMkLokasyonlar({});setMkRef([]);setSessionAdi('');
      loadSessions();
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  const loadVasItems=useCallback(async()=>{
    const snap=await getDocs(query(collection(db,'vasItems'),where('durum','==','etiketleme_bekliyor')));
    const items=snap.docs.map(d=>({id:d.id,...d.data()}));
    const sessionIds=[...new Set(items.map(i=>i.sessionId).filter(Boolean))];
    const sessionInfoMap={};
    await Promise.all(sessionIds.map(async sid=>{
      try{const sSnap=await getDocs(query(collection(db,'countSessions'),where('__name__','==',sid)));
        if(!sSnap.empty){const s=sSnap.docs[0].data();sessionInfoMap[sid]={baslatan:s.baslatan||'',tarih:s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||'',mkTur:s.mkTur||'manuel',sessionAdi:s.sessionAdi||''};}
      }catch{}
    }));
    setVasList(items.map(i=>({...i,_sessionInfo:sessionInfoMap[i.sessionId]||null})));
  },[]);

  const vasLokasyonaGonder=async(vasItem,lokasyon)=>{
    if(!lokasyon){toast$('Lokasyon seçin','error');return;}
    try{
      const now=Timestamp.now();
      const stockSnap=await getDocs(query(collection(db,'stock'),where('ean','==',vasItem.ean)));
      const prev=stockSnap.empty?0:(stockSnap.docs[0].data().miktar||0);
      const prevByLok=stockSnap.empty?{}:(stockSnap.docs[0].data().byLocation||{});
      const next=prev+vasItem.adet;
      const newByLok={...prevByLok,[lokasyon]:(prevByLok[lokasyon]||0)+vasItem.adet};
      await setDoc(doc(db,'stock',vasItem.ean),{ean:vasItem.ean,miktar:next,urunAdi:vasItem.urunAdi||'',malzemeKodu:vasItem.malzemeKodu||'',byLocation:newByLok,sonGuncelleme:now},{merge:true});
      await updateDoc(doc(db,'vasItems',vasItem.id),{durum:'tamamlandi',lokasyon,bitis:now});
      await addDoc(collection(db,'stockMovements'),{tarih:now,tip:'vas_lokasyon',ean:vasItem.ean,malzemeKodu:vasItem.malzemeKodu||'',urunAdi:vasItem.urunAdi||'',miktar:vasItem.adet,oncekiMiktar:prev,sonrakiMiktar:next,lokasyon,kaynak:`vas:${vasItem.id}`,yapan:profile?.name||user?.email||'',yapanId:user?.uid||''});
      setVasList(prev=>prev.filter(v=>v.id!==vasItem.id));
      toast$(`${vasItem.urunAdi||vasItem.ean}: ${vasItem.adet} adet stoğa eklendi ✓`,'success');
    }catch(e){toast$('Hata: '+e.message,'error');}
  };

  const S={card:{background:'#fff',borderRadius:14,padding:'14px 16px',border:'1px solid #e2e8f0',marginBottom:12},btn:{border:'none',borderRadius:10,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer'}};

  if(view==='mk_sayim'&&activeSession){
    return <MalKabulSayimSession
      sessionId={activeSession.id}
      referenceItems={mkTur==='referansli'?mkRef:(activeSession.referenceItems||[])}
      products={products} onDone={handleSayimDone} onBack={()=>setView('list')}/>;
  }

  if(view==='mal_kabul'){
    return(
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📥 Yeni Mal Kabul</p>
        </div>
        <div style={{padding:16}}>
          <div style={S.card}>
            <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:10}}>Sayım Türü</p>
            <div style={{display:'flex',gap:10}}>
              {[['manuel','✍️ Manuel'],['referansli','📋 Referanslı']].map(([t,l])=>(
                <button key={t} onClick={()=>setMkTur(t)} style={{...S.btn,flex:1,background:mkTur===t?'#1e40af':'#f1f5f9',color:mkTur===t?'#fff':'#475569'}}>{l}</button>
              ))}
            </div>
          </div>
          {mkTur==='referansli'&&(
            <div style={S.card}>
              <p style={{fontSize:13,fontWeight:700,marginBottom:4}}>Referans Dosyası</p>
              {mkRef.length>0
                ?<div style={{display:'flex',alignItems:'center',gap:10}}>
                  <p style={{fontSize:12,color:'#10b981',fontWeight:600,flex:1}}>✅ {mkRef.length} kalem yüklendi</p>
                  <button onClick={()=>{setMkRef([]);clearSetupDraft();}} style={{...S.btn,background:'#fee2e2',color:'#ef4444',padding:'6px 12px',fontSize:12}}>Değiştir</button>
                </div>
                :<label style={{...S.btn,background:'#f1f5f9',color:'#475569',display:'inline-block',cursor:'pointer'}}>
                  📂 Dosya Seç
                  <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])parseMkRef(e.target.files[0]);e.target.value='';}}/>
                </label>
              }
            </div>
          )}
          <div style={S.card}>
            <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:6}}>Oturum Adı <span style={{fontSize:11,color:'#94a3b8',fontWeight:400}}>(opsiyonel)</span></p>
            <input value={sessionAdi} onChange={e=>setSessionAdi(e.target.value)} placeholder="Örn: GHD Mayıs, Wella Lot 42..."
              style={{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <button onClick={startMalKabul} disabled={loading||(mkTur==='referansli'&&mkRef.length===0)}
            style={{...S.btn,width:'100%',background:'#7c3aed',color:'#fff',opacity:(mkTur==='referansli'&&mkRef.length===0)?.5:1}}>
            {loading?'...':'Sayıma Başla →'}
          </button>
        </div>
      </div>
    );
  }

  if(view==='mk_ozet'&&activeSession){
    const allItems={};
    mkEntries.forEach(e=>{(e.items||[]).forEach(item=>{const key=item.malzemeKodu||item.ean;if(!allItems[key])allItems[key]={...item,adet:0,hasarliAdet:0,eksikKabul:false};allItems[key].adet+=item.adet;allItems[key].hasarliAdet+=(item.hasarliAdet||0);if(item.eksikKabul)allItems[key].eksikKabul=true;});});
    const itemList=Object.values(allItems);
    const toplam=itemList.filter(i=>!i.eksikKabul).reduce((a,i)=>a+i.adet,0);
    const toplamHasar=itemList.reduce((a,i)=>a+(i.hasarliAdet||0),0);
    const eksikItems=itemList.filter(i=>i.eksikKabul);
    const refMap=Object.fromEntries(mkRef.map(r=>[r.malzemeKodu,r]));
    const tamEslesen=mkRef.length>0&&itemList.filter(i=>!i.eksikKabul).every(i=>{const r=refMap[i.malzemeKodu];return r&&r.beklenenAdet===i.adet;});
    return(
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <p style={{color:'#fff',fontWeight:700,fontSize:14}}>📥 {activeSession?.sessionAdi||'Mal Kabul Özeti'}</p>
        </div>
        <div style={{padding:16}}>
          <div style={{...S.card,background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
            <p style={{fontSize:13,fontWeight:700,color:'#15803d'}}>📊 {itemList.length} kalem · {toplam.toLocaleString()} adet stoğa girecek{toplamHasar>0?` · ⚠️ ${toplamHasar} hasarlı`:''}</p>
            {eksikItems.length>0&&<p style={{fontSize:12,color:'#dc2626',marginTop:4,fontWeight:600}}>🔒 {eksikItems.length} kalem eksik kabul — stoğa girmeyecek</p>}
            {tamEslesen&&<p style={{fontSize:12,color:'#10b981',marginTop:4,fontWeight:600}}>✅ Referans ile tam eşleşme</p>}
            {mkRef.length>0&&!tamEslesen&&<p style={{fontSize:12,color:'#d97706',marginTop:4,fontWeight:600}}>⚠️ Referans ile fark var</p>}
          </div>
          {eksikItems.length>0&&(
            <div style={{...S.card,border:'1px solid #fca5a5',background:'#fff1f2'}}>
              <p style={{fontSize:12,fontWeight:700,color:'#dc2626',marginBottom:8}}>🔒 Eksik Kabul — Stoğa Girmeyecek</p>
              {eksikItems.map((item,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid #fecaca'}}>
                  <div style={{flex:1}}><p style={{fontSize:12,fontWeight:600,color:'#1e293b'}}>{item.urunAdi||item.malzemeKodu}</p></div>
                  <p style={{fontSize:11,color:'#dc2626'}}>{item.adet}/{item.beklenenAdet} adet</p>
                </div>
              ))}
            </div>
          )}
          {itemList.filter(i=>!i.eksikKabul).length>0&&(
            <div style={S.card}>
              <p style={{fontSize:13,fontWeight:700,marginBottom:4}}>🏷️ VAS Transfer</p>
              <p style={{fontSize:11,color:'#64748b',marginBottom:10}}>Etiketlenecek ürünleri seç</p>
              {itemList.filter(i=>!i.eksikKabul).map((item,i)=>{
                const key=item.ean||item.malzemeKodu;const sel=(vasItems[key]||0)>=item.adet;
                return(<div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}>
                  <div style={{flex:1,minWidth:0}}><p style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.urunAdi||item.malzemeKodu}</p><p style={{fontSize:10,color:'#94a3b8'}}>{item.adet} adet{sel?' · 🏷️ VAS':''}</p></div>
                  <button onClick={()=>setVasItems(prev=>({...prev,[key]:sel?0:item.adet}))} style={{...S.btn,background:sel?'#7c3aed':'#f1f5f9',color:sel?'#fff':'#475569',padding:'6px 10px',fontSize:12}}>{sel?'↩ İptal':'VAS →'}</button>
                </div>);
              })}
            </div>
          )}
          {itemList.filter(i=>!i.eksikKabul&&(vasItems[i.ean||i.malzemeKodu]||0)<i.adet).length>0&&(
            <div style={S.card}>
              <p style={{fontSize:13,fontWeight:700,marginBottom:4}}>📍 Lokasyon Ata</p>
              <div style={{background:'#eff6ff',borderRadius:8,padding:'8px 10px',marginBottom:10}}>
                <p style={{fontSize:11,fontWeight:600,color:'#1d4ed8',marginBottom:5}}>Tümüne aynı lokasyon:</p>
                <input placeholder="A109S013B" style={{width:'100%',padding:'7px 10px',border:'1px solid #bfdbfe',borderRadius:7,fontSize:13,fontFamily:'monospace',outline:'none',boxSizing:'border-box'}}
                  onChange={e=>{const lok=e.target.value.trim().toUpperCase();if(!lok)return;const n={...mkLokasyonlar};itemList.filter(i=>!i.eksikKabul&&(vasItems[i.ean||i.malzemeKodu]||0)<i.adet).forEach(i=>{n[i.ean||i.malzemeKodu]=lok;});setMkLokasyonlar(n);}}/>
              </div>
              {itemList.filter(i=>!i.eksikKabul&&(vasItems[i.ean||i.malzemeKodu]||0)<i.adet).map((item,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid #f1f5f9'}}>
                  <p style={{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.urunAdi||item.malzemeKodu}</p>
                  <input placeholder="Lokasyon" value={mkLokasyonlar[item.ean||item.malzemeKodu]||''}
                    onChange={e=>setMkLokasyonlar(prev=>({...prev,[item.ean||item.malzemeKodu]:e.target.value.trim().toUpperCase()}))}
                    style={{width:110,padding:'5px 8px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:11,fontFamily:'monospace',outline:'none',background:mkLokasyonlar[item.ean||item.malzemeKodu]?'#f0fdf4':'#fff'}}/>
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>setView('mk_sayim')} style={{...S.btn,width:'100%',background:'#3b82f6',color:'#fff',marginBottom:10}}>➕ Daha Fazla Ürün Say</button>
          {isAdmin&&<button onClick={malKabulOnayla} disabled={loading||itemList.length===0} style={{...S.btn,width:'100%',background:'#10b981',color:'#fff',opacity:loading?.6:1}}>{loading?'Ekleniyor...':'✅ Onayla ve Stoğa Ekle'}</button>}
        </div>
      </div>
    );
  }

  if(view==='vas_liste'){
    const vasGroups={};
    vasList.forEach(item=>{const sid=item.sessionId||'bilinmiyor';if(!vasGroups[sid])vasGroups[sid]={sessionInfo:item._sessionInfo,items:[]};vasGroups[sid].items.push(item);});
    return(
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setView('list')} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <div style={{flex:1}}><p style={{color:'#fff',fontWeight:700,fontSize:14}}>🏷️ VAS — Etiketleme Bekleyenler</p><p style={{color:'#94a3b8',fontSize:11}}>{vasList.length} ürün · {Object.keys(vasGroups).length} mal kabul</p></div>
          <button onClick={loadVasItems} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:12}}>↻</button>
        </div>
        <div style={{padding:16}}>
          {vasList.length===0&&<div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}><p style={{fontSize:28,marginBottom:8}}>🏷️</p><p style={{fontSize:14,fontWeight:600}}>VAS'ta bekleyen ürün yok</p></div>}
          {Object.entries(vasGroups).map(([sid,group])=>(
            <div key={sid} style={{marginBottom:20}}>
              <div style={{background:'#7c3aed',borderRadius:'12px 12px 0 0',padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1}}>
                  <p style={{color:'#fff',fontWeight:700,fontSize:13}}>📥 {group.sessionInfo?.sessionAdi||'Mal Kabul'} — {group.sessionInfo?.tarih||'Tarih bilinmiyor'}</p>
                  <p style={{color:'rgba(255,255,255,.7)',fontSize:11}}>{group.sessionInfo?.baslatan||''} · {group.sessionInfo?.mkTur==='referansli'?'Referanslı':'Manuel'} · {group.items.length} ürün</p>
                </div>
                <span style={{background:'rgba(255,255,255,.2)',color:'#fff',borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:700}}>{group.items.length} kalem</span>
              </div>
              <div style={{border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 12px 12px',overflow:'hidden'}}>
                {group.items.map((item,i)=>(
                  <div key={item.id} style={{borderBottom:i<group.items.length-1?'1px solid #f1f5f9':'none'}}>
                    <VasCard item={item} onSend={vasLokasyonaGonder}/>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const aktifler=sessions.filter(s=>s.durum==='aktif');
  const bitmisler=sessions.filter(s=>s.durum!=='aktif');
  return(
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <p style={{color:'#fff',fontWeight:700,fontSize:16}}>📥 Mal Kabul</p>
        <button onClick={()=>{loadVasItems();setView('vas_liste');}} style={{...S.btn,background:'#7c3aed',color:'#fff',padding:'7px 12px',fontSize:12}}>🏷️ VAS Listesi</button>
      </div>
      <div style={{padding:16}}>
        {mkRef.length>0&&!activeSession&&(
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:14,padding:'14px 16px',marginBottom:12}}>
            <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:4}}>📋 {sessionAdi||'Yüklenmiş Referans Var'}</p>
            <p style={{fontSize:12,color:'#64748b',marginBottom:10}}>{mkRef.length} kalem · {mkTur==='referansli'?'Referanslı':'Manuel'} — henüz sayım başlatılmadı</p>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setView('mal_kabul')} style={{...S.btn,flex:1,background:'#1e40af',color:'#fff'}}>Devam Et →</button>
              <button onClick={()=>{setMkRef([]);setMkTur('manuel');setSessionAdi('');clearSetupDraft();}} style={{...S.btn,background:'#fee2e2',color:'#ef4444',padding:'10px 12px'}}>✕ Sil</button>
            </div>
          </div>
        )}
        <button onClick={()=>{setActiveSession(null);setMkEntries([]);setVasItems({});setMkLokasyonlar({});if(mkRef.length===0)setMkTur('manuel');setView('mal_kabul');}}
          style={{...S.btn,width:'100%',background:'#7c3aed',color:'#fff',marginBottom:16}}>📥 Yeni Mal Kabul Başlat</button>

        {aktifler.length>0&&<>
          <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>⏸ Devam Eden Mal Kabuller</p>
          {aktifler.map(s=>{
            const draft=readMkDraft(s.id);
            const draftCounts=draft?.counts||s.draftCounts||{};
            const refItems=s.referenceItems||[];
            const scanned=refItems.reduce((a,r)=>{const key=String(r.ean||r.malzemeKodu||'').trim();return a+(draftCounts[key]||0);},0);
            const total=refItems.reduce((a,r)=>a+(r.beklenenAdet||0),0);
            const pct=total?Math.min(100,Math.floor(scanned/total*100)):0;
            const tarih=s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||'';
            const hasDraft=Object.keys(draftCounts).length>0;
            return(
              <div key={s.id} style={{...S.card,border:'1px solid #bfdbfe',background:'#eff6ff'}}>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                      <p style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>📥 {s.sessionAdi||( s.mkTur==='referansli'?'Referanslı':'Manuel')+' Mal Kabul'}</p>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        {hasDraft&&<span style={{background:'#fef3c7',color:'#d97706',borderRadius:6,padding:'2px 7px',fontSize:10,fontWeight:700}}>💾 Kaydedildi</span>}
                        {refItems.length>0&&<span style={{fontSize:11,color:'#1d4ed8',fontWeight:600}}>%{pct}</span>}
                      </div>
                    </div>
                    <p style={{fontSize:11,color:'#64748b'}}>{s.baslatan} · {tarih}{refItems.length>0?` · ${refItems.length} kalem`:''}</p>
                    {refItems.length>0&&<div style={{marginTop:6,height:4,background:'#bfdbfe',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:'#1e40af',borderRadius:2}}/></div>}
                  </div>
                  <button onClick={()=>openSession(s)} style={{...S.btn,background:'#1e40af',color:'#fff',padding:'9px 0',fontSize:13}}>Devam Et →</button>
                </div>
              </div>
            );
          })}
        </>}
        {bitmisler.length>0&&<>
          <p style={{fontSize:12,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8,marginTop:16}}>Tamamlanan</p>
          {bitmisler.slice(0,10).map(s=>(
            <div key={s.id} style={S.card}>
              <p style={{fontSize:13,fontWeight:600,color:'#475569'}}>📥 {s.sessionAdi||( s.mkTur==='referansli'?'Referanslı':'Manuel')+' Mal Kabul'}</p>
              <p style={{fontSize:11,color:'#94a3b8'}}>{s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR')||''}</p>
            </div>
          ))}
        </>}
        {sessions.length===0&&!loading&&<div style={{textAlign:'center',padding:'48px 0',color:'#94a3b8'}}><p style={{fontSize:32,marginBottom:8}}>📥</p><p style={{fontSize:14,fontWeight:600}}>Henüz mal kabul yok</p></div>}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}

function VasCard({item,onSend}){
  const[lok,setLok]=useState('');const[showPicker,setShowPicker]=useState(false);
  return(
    <div style={{background:'#fff',padding:'14px 16px'}}>
      <p style={{fontSize:13,fontWeight:700,color:'#1e293b',marginBottom:2}}>{item.urunAdi||item.ean}</p>
      <p style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace',marginBottom:8}}>{item.malzemeKodu||item.ean} · {item.adet} adet</p>
      {!showPicker?(
        <div style={{display:'flex',gap:8}}>
          <input value={lok} onChange={e=>setLok(e.target.value.toUpperCase())} placeholder="Lokasyon"
            style={{flex:1,padding:'8px 12px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',fontFamily:'monospace'}}/>
          <button onClick={()=>setShowPicker(true)} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'8px 10px',cursor:'pointer',fontSize:13}}>📍</button>
          <button onClick={()=>onSend(item,lok)} disabled={!lok}
            style={{background:'#10b981',border:'none',borderRadius:8,color:'#fff',padding:'8px 14px',fontSize:13,fontWeight:600,cursor:'pointer',opacity:!lok?.5:1}}>
            Gönder ✓
          </button>
        </div>
      ):(
        <LokPicker onSelect={l=>{setLok(l);setShowPicker(false);}}/>
      )}
    </div>
  );
}
