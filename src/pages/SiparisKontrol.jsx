import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

/* ── helpers ─────────────────────────────────────────── */
function Toast({ msg, type, onDone }) {
  const bg = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return <div style={{ position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'88vw',textAlign:'center',boxShadow:'0 8px 24px rgba(0,0,0,.2)' }}>{msg}</div>;
}

function PageHeader({ title, onBack, right }) {
  return (
    <div style={{ background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,zIndex:50 }}>
      {onBack && <button onClick={onBack} style={{ background:'rgba(255,255,255,.08)',border:'none',color:'#94a3b8',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center' }}>←</button>}
      <h2 style={{ color:'#f8fafc',fontSize:15,fontWeight:700,flex:1 }}>{title}</h2>
      {right}
    </div>
  );
}

/* ── KOLI MODAL ──────────────────────────────────────── */
function KoliModal({ onSave, onClose }) {
  const [tur, setTur]       = useState('koli'); // koli | palet
  const [koli, setKoli]     = useState('');
  const [palet, setPalet]   = useState('1');   // 1 | 0.5
  const [koliP, setKoliP]   = useState('');

  const save = () => {
    if (tur === 'koli') {
      if (!koli) return;
      onSave({ tur:'koli', koli:parseInt(koli), label:`${koli} Koli` });
    } else {
      if (!koliP) return;
      onSave({ tur:'palet', palet:parseFloat(palet), koli:parseInt(koliP), label:`${palet} Palet + ${koliP} Koli` });
    }
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200 }}>
      <div style={{ background:'#fff',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:500 }}>
        <h3 style={{ fontSize:17,fontWeight:700,color:'#0f172a',marginBottom:20 }}>Koli / Palet Bilgisi</h3>
        <div style={{ display:'flex',gap:8,marginBottom:20 }}>
          {[{v:'koli',l:'Sadece Koli'},{v:'palet',l:'Palet + Koli'}].map(({v,l})=>(
            <button key={v} onClick={()=>setTur(v)} style={{ flex:1,padding:'10px',borderRadius:10,border:`2px solid ${tur===v?'#3b82f6':'#e2e8f0'}`,background:tur===v?'#eff6ff':'#fff',color:tur===v?'#2563eb':'#64748b',fontWeight:600,cursor:'pointer',fontSize:13 }}>{l}</button>
          ))}
        </div>
        {tur==='koli' ? (
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:'#64748b',display:'block',marginBottom:6 }}>KOLİ ADEDİ</label>
            <input type="number" value={koli} onChange={e=>setKoli(e.target.value)} placeholder="örn: 12" style={{ width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:16,outline:'none' }} />
          </div>
        ) : (
          <div style={{ display:'flex',gap:12 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12,fontWeight:600,color:'#64748b',display:'block',marginBottom:6 }}>PALET</label>
              <select value={palet} onChange={e=>setPalet(e.target.value)} style={{ width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:15,outline:'none',background:'#fff' }}>
                <option value="1">1 Palet (Tam)</option>
                <option value="0.5">0.5 Palet (Yarım)</option>
              </select>
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12,fontWeight:600,color:'#64748b',display:'block',marginBottom:6 }}>KOLİ ADEDİ</label>
              <input type="number" value={koliP} onChange={e=>setKoliP(e.target.value)} placeholder="örn: 30" style={{ width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:16,outline:'none' }} />
            </div>
          </div>
        )}
        <div style={{ display:'flex',gap:10,marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1,padding:'13px',borderRadius:12,border:'2px solid #e2e8f0',background:'#fff',color:'#64748b',fontWeight:600,cursor:'pointer',fontSize:14 }}>İptal</button>
          <button onClick={save} style={{ flex:2,padding:'13px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14 }}>Kaydet</button>
        </div>
      </div>
    </div>
  );
}

/* ── SCAN SESSION ────────────────────────────────────── */
function ScanSession({ items, irsaliyeInfo, onDone, onBack }) {
  const { user, profile } = useAuth();
  const [counts,    setCounts]    = useState({});
  const [lastScan,  setLastScan]  = useState(null);
  const [mode,      setMode]      = useState('text');
  const [barInput,  setBarInput]  = useState('');
  const [camOn,     setCamOn]     = useState(false);
  const [filter,    setFilter]    = useState('all');
  const [toast,     setToast]     = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [showKoli,  setShowKoli]  = useState(false);
  const [startTime] = useState(Date.now());

  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const detectorRef = useRef(null);
  const rafRef      = useRef(null);
  const lastBcRef   = useRef({ code:'', ts:0 });
  const inputRef    = useRef(null);
  const itemsRef    = useRef(items);
  const scanFnRef   = useRef(null);

  useEffect(()=>{ itemsRef.current = items; },[items]);

  const toast$ = useCallback((msg, type='info') => setToast({ msg, type, id:Date.now() }), []);

  const processScan = useCallback((code) => {
    const c = String(code).trim(); if (!c) return;
    const item = itemsRef.current.find(i => i.ean === c || i.malzemeKodu === c);
    if (!item) { toast$(`Bilinmeyen barkod: ${c}`, 'error'); setLastScan({ code:c, found:false }); return; }
    setCounts(prev => {
      const n = (prev[c]||0) + 1;
      if (n > item.beklenen)       toast$(`🔴 FAZLA: ${item.urunAdi||c}  ${n}/${item.beklenen}`, 'error');
      else if (n === item.beklenen) toast$(`🟢 TAMAM: ${item.urunAdi||c}`, 'success');
      else                          toast$(`🟡 ${item.urunAdi||c}: ${n}/${item.beklenen}`, 'info');
      setLastScan({ code:c, found:true, item, n, expected:item.beklenen });
      return { ...prev, [c]: n };
    });
  }, [toast$]);

  useEffect(()=>{ scanFnRef.current = processScan; },[processScan]);

  const stopCam = useCallback(()=>{
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current=null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
    if (videoRef.current) videoRef.current.srcObject=null;
    setCamOn(false);
  },[]);

  const startCam = useCallback(async ()=>{
    if (streamRef.current) return;
    if (!('BarcodeDetector' in window)) { toast$('Kamera tarama desteklenmiyor. Metin modunu kullanın.','warning'); setMode('text'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 } } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject=stream; await videoRef.current.play(); }
      detectorRef.current = new BarcodeDetector({ formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e'] });
      setCamOn(true);
      const loop = async () => {
        if (videoRef.current?.readyState >= 2 && detectorRef.current) {
          try {
            const res = await detectorRef.current.detect(videoRef.current);
            if (res.length) {
              const bc=res[0].rawValue, now=Date.now();
              if (bc !== lastBcRef.current.code || now-lastBcRef.current.ts > 2000) {
                lastBcRef.current = { code:bc, ts:now };
                scanFnRef.current?.(bc);
              }
            }
          } catch {}
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch(e) { toast$('Kamera açılamadı: '+e.message,'error'); setMode('text'); }
  },[toast$]);

  useEffect(()=>{
    if (mode==='camera') { startCam(); return ()=>stopCam(); }
    else { stopCam(); setTimeout(()=>inputRef.current?.focus(),150); }
  },[mode]);

  useEffect(()=>()=>stopCam(),[]);

  const getStatus = useCallback((item)=>{
    const c=counts[item.ean]||counts[item.malzemeKodu]||0;
    if (c===0) return 'pending';
    if (c===item.beklenen) return 'ok';
    if (c<item.beklenen) return 'partial';
    return 'excess';
  },[counts]);

  const stats = items.reduce((a,item)=>(a[getStatus(item)]++,a),{pending:0,ok:0,partial:0,excess:0});
  const totalScanned  = items.reduce((a,i)=>a+(counts[i.ean]||counts[i.malzemeKodu]||0),0);
  const totalExpected = items.reduce((a,i)=>a+i.beklenen,0);
  const progress      = totalExpected ? Math.min(100,Math.round(totalScanned/totalExpected*100)) : 0;
  const visible       = filter==='all' ? items : items.filter(i=>getStatus(i)===filter);

  const handleDone = () => setShowKoli(true);

  const saveOrder = async (koliInfo) => {
    setSaving(true);
    try {
      const sure = Math.round((Date.now()-startTime)/60000);
      const itemsData = items.map(item => ({
        ean: item.ean,
        malzemeKodu: item.malzemeKodu || '',
        urunAdi: item.urunAdi || '',
        beklenen: item.beklenen,
        taranan: counts[item.ean]||counts[item.malzemeKodu]||0,
      }));
      const ref = await addDoc(collection(db,'orders'), {
        irsaliyeNo: irsaliyeInfo.irsaliyeNo || '',
        cariIsim:   irsaliyeInfo.cariIsim   || '',
        tarih:      Timestamp.now(),
        operator:   profile?.name || user?.email || '',
        operatorId: user?.uid || '',
        items:      itemsData,
        durum:      'tamamlandi',
        koliInfo,
        kargoTakipNo:  '',
        kargoFirmasi:  'Yurtiçi Kargo',
        sure,
        tamam:    stats.ok,
        eksik:    stats.partial,
        fazla:    stats.excess,
        taranmadi:stats.pending,
        toplamKalem: items.length,
      });
      toast$('Kontrol kaydedildi ✓','success');
      setTimeout(()=>onDone(ref.id),1000);
    } catch(e) { toast$('Kayıt hatası: '+e.message,'error'); }
    finally { setSaving(false); }
  };

  const ST = {
    pending: { dot:'#94a3b8', cnt:'#94a3b8', card:'#fff',    border:'#e2e8f0' },
    ok:      { dot:'#10b981', cnt:'#10b981', card:'#f0fdf4', border:'#86efac' },
    partial: { dot:'#f59e0b', cnt:'#d97706', card:'#fffbeb', border:'#fde68a' },
    excess:  { dot:'#ef4444', cnt:'#dc2626', card:'#fef2f2', border:'#fecaca' },
  };

  return (
    <div style={{ height:'100dvh',display:'flex',flexDirection:'column',background:'#f1f5f9',overflow:'hidden' }}>
      {/* Top bar */}
      <div style={{ background:'#0f172a',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'rgba(255,255,255,.08)',border:'none',color:'#94a3b8',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
            <span style={{ color:'#e2e8f0',fontSize:12,fontWeight:600 }}>{items.length} kalem · {totalScanned}/{totalExpected} adet</span>
            <span style={{ color:progress===100?'#10b981':'#94a3b8',fontSize:12,fontWeight:700,fontFamily:'monospace' }}>%{progress}</span>
          </div>
          <div style={{ height:5,background:'rgba(255,255,255,.1)',borderRadius:4,overflow:'hidden' }}>
            <div style={{ height:'100%',borderRadius:4,transition:'width .35s',background:progress===100?'#10b981':'linear-gradient(90deg,#3b82f6,#6366f1)',width:`${progress}%` }} />
          </div>
        </div>
        <button onClick={handleDone} style={{ background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 12px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer',flexShrink:0 }}>
          Tamamla
        </button>
      </div>

      {/* Filter */}
      <div style={{ background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'7px 10px',display:'flex',gap:5,overflowX:'auto',flexShrink:0 }}>
        {[
          {key:'all',lbl:`Tümü ${items.length}`,bg:'#f1f5f9',clr:'#334155'},
          {key:'ok',lbl:`✅ ${stats.ok}`,bg:'#dcfce7',clr:'#166534'},
          {key:'partial',lbl:`⚠️ ${stats.partial}`,bg:'#fef3c7',clr:'#92400e'},
          {key:'excess',lbl:`❌ ${stats.excess}`,bg:'#fee2e2',clr:'#991b1b'},
          {key:'pending',lbl:`⬜ ${stats.pending}`,bg:'#f1f5f9',clr:'#64748b'},
        ].map(({key,lbl,bg,clr})=>(
          <button key={key} onClick={()=>setFilter(key)} style={{ background:bg,color:clr,border:`2px solid ${filter===key?'#3b82f6':'transparent'}`,padding:'4px 9px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0 }}>{lbl}</button>
        ))}
      </div>

      {/* Scanner */}
      <div style={{ background:'#fff',borderBottom:'1px solid #f1f5f9',flexShrink:0 }}>
        <div style={{ display:'flex',borderBottom:'1px solid #f1f5f9' }}>
          {[{id:'camera',lbl:'📷 Kamera'},{id:'text',lbl:'⌨️ Metin / Tabanca'}].map(({id,lbl})=>(
            <button key={id} onClick={()=>setMode(id)} style={{ flex:1,padding:'11px 0',fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:mode===id?'#0f172a':'transparent',color:mode===id?'#fff':'#64748b' }}>{lbl}</button>
          ))}
        </div>
        {mode==='camera' ? (
          <div style={{ position:'relative',background:'#000',height:160 }}>
            <video ref={videoRef} style={{ width:'100%',height:'100%',objectFit:'cover' }} playsInline muted />
            {!camOn && <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center' }}><p style={{ color:'rgba(255,255,255,.5)',fontSize:13 }}>📷 Kamera başlatılıyor...</p></div>}
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none' }}>
              <div style={{ position:'relative',width:210,height:55 }}>
                {[{top:0,left:0,borderTop:'2px solid #fff',borderLeft:'2px solid #fff'},{top:0,right:0,borderTop:'2px solid #fff',borderRight:'2px solid #fff'},{bottom:0,left:0,borderBottom:'2px solid #fff',borderLeft:'2px solid #fff'},{bottom:0,right:0,borderBottom:'2px solid #fff',borderRight:'2px solid #fff'}].map((s,i)=>(
                  <div key={i} style={{ position:'absolute',width:16,height:16,...s }} />
                ))}
              </div>
            </div>
            {camOn && <div style={{ position:'absolute',bottom:6,right:8,background:'rgba(16,185,129,.9)',color:'#fff',fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:6 }}>● CANLI</div>}
          </div>
        ) : (
          <div style={{ padding:'10px 10px 6px' }}>
            <div style={{ display:'flex',gap:7 }}>
              <input ref={inputRef} value={barInput} onChange={e=>setBarInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&barInput.trim()){processScan(barInput);setBarInput('');} }}
                placeholder="Barkod okutun veya yazın → Enter"
                style={{ flex:1,border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:14,background:'#f8fafc',fontFamily:'monospace',outline:'none' }}
                onFocus={e=>e.target.style.borderColor='#3b82f6'}
                onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
              <button onClick={()=>{ if(barInput.trim()){processScan(barInput);setBarInput('');inputRef.current?.focus();} }}
                style={{ background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',border:'none',padding:'0 16px',borderRadius:10,fontWeight:700,cursor:'pointer' }}>Tara</button>
            </div>
          </div>
        )}
        {lastScan && (
          <div style={{ margin:'0 10px 10px',background:!lastScan.found?'#fef2f2':lastScan.n>lastScan.expected?'#fef2f2':lastScan.n===lastScan.expected?'#f0fdf4':'#fffbeb',border:`1px solid ${!lastScan.found?'#fecaca':lastScan.n>lastScan.expected?'#fecaca':lastScan.n===lastScan.expected?'#86efac':'#fde68a'}`,borderRadius:12,padding:'9px 12px',display:'flex',alignItems:'center',gap:10 }}>
            <span style={{ fontSize:20,flexShrink:0 }}>{!lastScan.found?'❓':lastScan.n>lastScan.expected?'🔴':lastScan.n===lastScan.expected?'🟢':'🟡'}</span>
            <div style={{ flex:1,minWidth:0 }}>
              <p style={{ fontSize:13,fontWeight:700,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{lastScan.item?.urunAdi||lastScan.code}</p>
              {lastScan.found && <p style={{ fontSize:10,color:'#64748b',fontFamily:'monospace' }}>{lastScan.code}</p>}
            </div>
            {lastScan.found && <span style={{ fontSize:17,fontWeight:800,fontFamily:'monospace',color:lastScan.n>lastScan.expected?'#dc2626':lastScan.n===lastScan.expected?'#16a34a':'#d97706' }}>{lastScan.n}/{lastScan.expected}</span>}
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ flex:1,overflowY:'auto',padding:'10px 10px 20px' }}>
        {visible.map(item=>{
          const cnt=counts[item.ean]||counts[item.malzemeKodu]||0;
          const status=getStatus(item); const st=ST[status];
          const pct=item.beklenen>0?Math.min(100,(cnt/item.beklenen)*100):0;
          return (
            <div key={item.ean||item.malzemeKodu} style={{ background:st.card,border:`1px solid ${st.border}`,borderRadius:14,padding:'11px 12px',marginBottom:7 }}>
              <div style={{ display:'flex',alignItems:'center',gap:9 }}>
                <div style={{ width:8,height:8,borderRadius:'50%',flexShrink:0,background:st.dot }} />
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.urunAdi||'—'}</p>
                  <p style={{ fontSize:10,color:'#94a3b8',marginTop:1,fontFamily:'monospace' }}>{item.malzemeKodu}{item.malzemeKodu?' · ':''}{item.ean}</p>
                </div>
                <span style={{ fontSize:15,fontWeight:800,fontFamily:'monospace',color:st.cnt,flexShrink:0 }}>{cnt}/{item.beklenen}</span>
              </div>
              {item.beklenen>1 && <div style={{ marginTop:7,marginLeft:17,height:3,background:'#e2e8f0',borderRadius:4,overflow:'hidden' }}><div style={{ height:'100%',borderRadius:4,transition:'width .3s',width:`${pct}%`,background:cnt>=item.beklenen?'#10b981':cnt>0?'#f59e0b':'transparent' }} /></div>}
            </div>
          );
        })}
      </div>

      {showKoli && <KoliModal onSave={koliInfo=>{setShowKoli(false);saveOrder(koliInfo);}} onClose={()=>setShowKoli(false)} />}
      {saving && <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}><div style={{ background:'#fff',borderRadius:16,padding:24,textAlign:'center' }}><p style={{ fontSize:16,fontWeight:600 }}>Kaydediliyor...</p></div></div>}
      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── MAIN PAGE ───────────────────────────────────────── */
export default function SiparisKontrol({ navigate }) {
  const [view, setView]           = useState('list'); // list | new | scan
  const [loading, setLoading]     = useState(false);
  const [loadMsg, setLoadMsg]     = useState('');
  const [items, setItems]         = useState([]);
  const [irsaliyeInfo, setIrsal]  = useState({});
  const [toast, setToast]         = useState(null);
  const [dragging, setDragging]   = useState(false);
  const toast$ = (msg,type='info') => setToast({msg,type,id:Date.now()});

  const parseFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      await parsePDF(file);
    } else if (['xlsx','xls','csv'].includes(ext)) {
      parseExcel(file);
    } else {
      toast$('PDF veya Excel dosyası seçin','error');
    }
  },[]);

  const parsePDF = async (file) => {
    setLoading(true); setLoadMsg('PDF okunuyor...');
    try {
      const base64 = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=()=>rej(new Error('Okunamadı')); r.readAsDataURL(file); });
      setLoadMsg('Claude ürünleri çıkarıyor...');
      const resp = await fetch('/api/parse-pdf', {
        method:'POST', headers:{'Content-Type':'application/json'},
       body:JSON.stringify({ base64 })
      });
      if (!resp.ok) throw new Error('API hatası '+resp.status);
      const data = await resp.json();
      const raw = data.content?.map(b=>b.text||'').join('').trim();
      const clean = raw.replace(/```json|```/g,'').trim();
      const parsed = JSON.parse(clean);
      const prods = (parsed.products||[]).filter(p=>p.beklenen>0||p.qty>0).map((p,i)=>({
        id:`p${i}`, ean:String(p.ean||'').trim(), malzemeKodu:String(p.malzemeKodu||p.code||'').trim(),
        urunAdi:String(p.urunAdi||p.desc||'').trim(), beklenen:parseInt(p.beklenen||p.qty)||0,
      })).filter(p=>p.beklenen>0);
      if (!prods.length) throw new Error('PDF\'den ürün çıkarılamadı');
      setItems(prods);
      setIrsal({ irsaliyeNo:parsed.irsaliyeNo||'', cariIsim:parsed.cariIsim||'' });
      setView('scan');
      toast$(`${prods.length} ürün yüklendi ✓`,'success');
    } catch(e) { toast$('Hata: '+e.message,'error'); }
    finally { setLoading(false); setLoadMsg(''); }
  };

  const parseExcel = (file) => {
    const reader = new FileReader();
    reader.onload = ({target:{result}}) => {
      try {
        const wb = XLSX.read(new Uint8Array(result),{type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hIdx=-1,cEan=-1,cQty=-1,cDesc=-1,cCode=-1;
        for (let r=0;r<Math.min(rows.length,30);r++) {
          const cells=rows[r].map(c=>String(c).toLowerCase().replace(/\s+/g,' ').trim());
          let eF=false,qF=false;
          cells.forEach((cell,j)=>{
            if (/ean|barkod|barcode/.test(cell)) { cEan=j; eF=true; }
            if (/miktar|adet|qty|quantity/.test(cell)) { cQty=j; qF=true; }
            if (/açıklama|aciklama|description|ürün ad/.test(cell)&&cDesc<0) cDesc=j;
            if (/(malzeme|stok|ürün|item)\s*(kodu?|code?)/.test(cell)&&cCode<0) cCode=j;
          });
          if (eF&&qF) { hIdx=r; break; }
        }
        if (hIdx<0) { toast$('EAN ve Miktar sütunları bulunamadı!','error'); return; }
        const parsed = rows.slice(hIdx+1).map((row,i)=>({
          id:`r${i}`, ean:String(row[cEan]??'').trim(),
          malzemeKodu:cCode>=0?String(row[cCode]??'').trim():'',
          urunAdi:cDesc>=0?String(row[cDesc]??'').trim():'',
          beklenen:parseInt(String(row[cQty]).replace(/\D/g,''))||0,
        })).filter(r=>r.ean&&r.beklenen>0);
        if (!parsed.length) { toast$('Geçerli ürün satırı bulunamadı!','error'); return; }
        setItems(parsed); setIrsal({});
        setView('scan');
        toast$(`${parsed.length} ürün yüklendi ✓`,'success');
      } catch(e) { toast$('Hata: '+e.message,'error'); }
    };
    reader.readAsArrayBuffer(file);
  };

  if (view==='scan') return (
    <ScanSession items={items} irsaliyeInfo={irsaliyeInfo}
      onDone={()=>setView('list')} onBack={()=>setView('list')} />
  );

  return (
    <div>
      <PageHeader title="📋 Sipariş Kontrol" />
      <div style={{ padding:'16px',maxWidth:500,margin:'0 auto' }}>
        {loading ? (
          <div style={{ textAlign:'center',padding:'60px 0' }}>
            <div style={{ fontSize:48,marginBottom:12,animation:'pulse 1.5s infinite' }}>📄</div>
            <p style={{ fontSize:16,fontWeight:600,color:'#334155' }}>{loadMsg}</p>
            <p style={{ fontSize:13,color:'#94a3b8',marginTop:4 }}>Claude irsaliyeyi analiz ediyor...</p>
          </div>
        ) : (
          <>
            <div
              onDragOver={e=>{e.preventDefault();setDragging(true)}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);parseFile(e.dataTransfer.files[0])}}
              onClick={()=>document.getElementById('siparisFi').click()}
              style={{ background:dragging?'#eff6ff':'#fff',border:`2px dashed ${dragging?'#3b82f6':'#cbd5e1'}`,borderRadius:20,padding:'40px 24px',textAlign:'center',cursor:'pointer',transition:'all .2s',marginBottom:20 }}>
              <div style={{ fontSize:44,marginBottom:12 }}>{dragging?'📂':'📋'}</div>
              <p style={{ fontWeight:600,color:'#334155',fontSize:15 }}>İrsaliye dosyasını yükle</p>
              <p style={{ color:'#94a3b8',fontSize:13,marginTop:4 }}>PDF veya Excel (.xlsx, .csv)</p>
              <input id="siparisFi" type="file" accept=".pdf,.xlsx,.xls,.csv" style={{ display:'none' }} onChange={e=>parseFile(e.target.files[0])} />
            </div>
            <div style={{ background:'#f8fafc',borderRadius:14,padding:'14px 16px',border:'1px solid #e2e8f0' }}>
              <p style={{ fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8 }}>Nasıl çalışır?</p>
              {['PDF irsaliyeyi yükle → Claude otomatik okur','Excel dosyası da desteklenir','Barkod kamerasıyla veya tabancayla okut','Tamamla → koli/palet bilgisi gir → kaydet'].map((t,i)=>(
                <p key={i} style={{ color:'#475569',fontSize:12,marginBottom:5,display:'flex',gap:8 }}><span style={{ color:'#3b82f6',fontWeight:700,flexShrink:0 }}>{i+1}.</span>{t}</p>
              ))}
            </div>
          </>
        )}
      </div>
      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
