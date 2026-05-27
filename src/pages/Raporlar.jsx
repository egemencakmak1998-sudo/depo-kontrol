import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, orderBy, query, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';

function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'88vw',textAlign:'center'}}>{msg}</div>;
}

/* ── KARGO MODAL ─────────────────────────────────────── */
function KargoModal({ order, onSave, onClose }) {
  const [takipNo, setTakipNo] = useState(order.kargoTakipNo || '');
  const [firma, setFirma] = useState(order.kargoFirmasi || 'Yurtiçi Kargo');

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}}>
      <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:500}}>
        <h3 style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:8}}>Kargo Bilgisi Düzenle</h3>
        <p style={{fontSize:13,color:'#64748b',marginBottom:16}}>{order.irsaliyeNo||'—'} · {order.cariIsim||'—'}</p>

        <label style={{fontSize:12,fontWeight:700,color:'#64748b',display:'block',marginBottom:6}}>KARGO FİRMASI</label>
        <input value={firma} onChange={e=>setFirma(e.target.value)} placeholder="Kargo firması" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:14,outline:'none',marginBottom:12}} onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />

        <label style={{fontSize:12,fontWeight:700,color:'#64748b',display:'block',marginBottom:6}}>KARGO TAKİP NO</label>
        <input value={takipNo} onChange={e=>setTakipNo(e.target.value)} placeholder="Yurtiçi Kargo takip numarası" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:14,outline:'none',marginBottom:16,fontFamily:'monospace'}} onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:'12px',borderRadius:12,border:'2px solid #e2e8f0',background:'#fff',color:'#64748b',fontWeight:600,cursor:'pointer'}}>İptal</button>
          <button onClick={()=>onSave({takipNo,firma})} style={{flex:2,padding:'12px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',fontWeight:700,cursor:'pointer'}}>Güncelle</button>
        </div>
      </div>
    </div>
  );
}

/* ── KOLİ MODAL ─────────────────────────────────────── */
function KoliModal({ order, onSave, onClose }) {
  const current = order.koliInfo || {};
  const [tur, setTur] = useState(current.tur || 'koli');
  const [koli, setKoli] = useState(String(current.koli || ''));
  const [palet, setPalet] = useState(String(current.palet || '1'));
  const [koliP, setKoliP] = useState(String(current.koli || ''));

  const save = () => {
    if (tur === 'koli') {
      const koliNum = parseInt(koli, 10) || 0;
      onSave({ tur:'koli', koli:koliNum, label:koliNum ? `${koliNum} Koli` : '' });
      return;
    }

    const paletNum = parseFloat(palet) || 0;
    const koliNum = parseInt(koliP, 10) || 0;
    onSave({ tur:'palet', palet:paletNum, koli:koliNum, label:`${paletNum} Palet + ${koliNum} Koli` });
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}}>
      <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:500}}>
        <h3 style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:8}}>Koli / Palet Bilgisi Düzenle</h3>
        <p style={{fontSize:13,color:'#64748b',marginBottom:16}}>{order.irsaliyeNo||'—'} · {order.cariIsim||'—'}</p>

        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[{v:'koli',l:'Sadece Koli'},{v:'palet',l:'Palet + Koli'}].map(({v,l})=>(
            <button key={v} onClick={()=>setTur(v)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${tur===v?'#3b82f6':'#e2e8f0'}`,background:tur===v?'#eff6ff':'#fff',color:tur===v?'#2563eb':'#64748b',fontWeight:600,cursor:'pointer',fontSize:13}}>{l}</button>
          ))}
        </div>

        {tur==='koli' ? (
          <div>
            <label style={{fontSize:12,fontWeight:700,color:'#64748b',display:'block',marginBottom:6}}>KOLİ ADEDİ</label>
            <input type="number" value={koli} onChange={e=>setKoli(e.target.value)} placeholder="örn: 12" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:16,outline:'none'}} />
          </div>
        ) : (
          <div style={{display:'flex',gap:12}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:700,color:'#64748b',display:'block',marginBottom:6}}>PALET</label>
              <select value={palet} onChange={e=>setPalet(e.target.value)} style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:15,outline:'none',background:'#fff'}}>
                <option value="1">1 Palet (Tam)</option>
                <option value="0.5">0.5 Palet (Yarım)</option>
                <option value="0">Palet Yok</option>
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:12,fontWeight:700,color:'#64748b',display:'block',marginBottom:6}}>KOLİ ADEDİ</label>
              <input type="number" value={koliP} onChange={e=>setKoliP(e.target.value)} placeholder="örn: 30" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'12px',fontSize:16,outline:'none'}} />
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:20}}>
          <button onClick={onClose} style={{flex:1,padding:'12px',borderRadius:12,border:'2px solid #e2e8f0',background:'#fff',color:'#64748b',fontWeight:600,cursor:'pointer'}}>İptal</button>
          <button onClick={save} style={{flex:2,padding:'12px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',fontWeight:700,cursor:'pointer'}}>Güncelle</button>
        </div>
      </div>
    </div>
  );
}

/* ── KARGO IMPORT MODAL ──────────────────────────────── */
function KargoImportModal({ onDone, onClose }) {
  const [rows, setRows]     = useState([]);
  const [matched, setM]     = useState([]);
  const [orders, setOrders] = useState([]);
  const [toast, setToast]   = useState(null);
  const toast$ = (msg,type)=>setToast({msg,type,id:Date.now()});

  useEffect(()=>{
    getDocs(query(collection(db,'orders'),orderBy('tarih','desc'),limit(200)))
      .then(snap=>{
      const all = snap.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.durum==='tamamlandi');
      // Aynı irsaliye numarasından sadece en yeniyi göster
      const seen = new Map();
      all.forEach(o => {
        const key = o.irsaliyeNo || o.id;
        if (!seen.has(key) || (o.tarih?.toDate?.() > seen.get(key).tarih?.toDate?.())) {
          seen.set(key, o);
        }
      });
      setOrders([...seen.values()]);
    });
  },[]);

  const parseKargoFile = (file) => {
    const ext=file.name.split('.').pop().toLowerCase();
    if (ext==='pdf') { toast$('PDF kargo listesi için Claude API kullanılıyor...','info'); parsePDF(file); return; }
    const reader=new FileReader();
    reader.onload=({target:{result}})=>{
      try {
        const wb=XLSX.read(new Uint8Array(result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const data=XLSX.utils.sheet_to_json(ws,{defval:''});
        setRows(data);
        autoMatch(data);
        toast$(`${data.length} satır yüklendi`,'success');
      }catch(e){toast$('Hata: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  const parsePDF = async (file) => {
    try {
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=()=>rej(new Error('Okunamadı'));r.readAsDataURL(file);});
      const resp=await fetch('/api/parse-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64,prompt:'Bu kargo listesinden tüm satırları çıkar. SADECE JSON formatında: {"rows":[{"irsaliyeNo":"","cariIsim":"","takipNo":"","tarih":""}]} Boş alanlar için boş string.'})});
      if(!resp.ok) throw new Error('API '+resp.status);
      const data=await resp.json();
      const raw=data.content?.map(b=>b.text||'').join('').trim().replace(/```json|```/g,'').trim();
      const parsed=JSON.parse(raw);
      setRows(parsed.rows||[]);
      autoMatch(parsed.rows||[]);
      toast$(`${(parsed.rows||[]).length} satır çıkarıldı`,'success');
    }catch(e){toast$('Hata: '+e.message,'error');}
  };

  const autoMatch = (kargoRows) => {
    const result = kargoRows.map(kRow=>{
      const irsNo=String(kRow.irsaliyeNo||kRow['İrsaliye No']||kRow['irsaliye_no']||'').trim();
      const cari=String(kRow.cariIsim||kRow['Cari']||kRow['Müşteri']||'').trim().toLowerCase();
      const takip=String(kRow.takipNo||kRow['Takip No']||kRow['takip_no']||kRow['Kargo No']||'').trim();
      const order=orders.find(o=>(irsNo&&o.irsaliyeNo===irsNo)||(cari&&o.cariIsim?.toLowerCase().includes(cari)));
      return { ...kRow, _takipNo:takip, _orderId:order?.id||null, _matched:!!order, _orderInfo:order?`${order.irsaliyeNo||''} · ${order.cariIsim||''}`:'' };
    });
    setM(result);
  };

  const saveMatches = async () => {
    const toSave=matched.filter(r=>r._matched&&r._takipNo);
    let saved=0;
    for (const r of toSave) {
      try { await updateDoc(doc(db,'orders',r._orderId),{kargoTakipNo:r._takipNo,kargoFirmasi:'Yurtiçi Kargo'}); saved++; } catch {}
    }
    toast$(`${saved} sipariş güncellendi`,'success');
    setTimeout(()=>onDone(),1500);
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}}>
      <div style={{background:'#fff',borderRadius:20,padding:24,width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:16,fontWeight:700}}>Kargo Takip Listesi Yükle</h3>
          <button onClick={onClose} style={{background:'#f1f5f9',border:'none',width:32,height:32,borderRadius:8,cursor:'pointer',fontSize:16}}>×</button>
        </div>
        <div onClick={()=>document.getElementById('kargoFi').click()} style={{border:'2px dashed #cbd5e1',borderRadius:12,padding:'20px',textAlign:'center',cursor:'pointer',marginBottom:16}}>
          <p style={{fontSize:13,color:'#475569'}}>PDF veya Excel kargo listesini yükle</p>
          <input id="kargoFi" type="file" accept=".pdf,.xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>parseKargoFile(e.target.files[0])} />
        </div>
        {matched.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:600,color:'#64748b',marginBottom:8}}>{matched.filter(r=>r._matched).length}/{matched.length} eşleşti</p>
            <div style={{maxHeight:240,overflowY:'auto',marginBottom:16}}>
              {matched.map((r,i)=>(
                <div key={i} style={{padding:'8px 12px',borderRadius:10,border:`1px solid ${r._matched?'#86efac':'#fecaca'}`,background:r._matched?'#f0fdf4':'#fef2f2',marginBottom:6,display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:16}}>{r._matched?'✅':'❌'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r._orderInfo||String(r.irsaliyeNo||r['İrsaliye No']||'Eşleşmedi')}</p>
                    <p style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace'}}>{r._takipNo||'Takip no yok'}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={saveMatches} style={{width:'100%',background:'linear-gradient(135deg,#3b82f6,#6366f1)',border:'none',color:'#fff',padding:'13px',borderRadius:12,fontWeight:700,cursor:'pointer'}}>
              {matched.filter(r=>r._matched&&r._takipNo).length} Eşleşeni Kaydet
            </button>
          </>
        )}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── MAIN ────────────────────────────────────────────── */
export default function Raporlar({ profile }) {
  const [tab, setTab]           = useState('siparisler');
  const [orders, setOrders]     = useState([]);
  const [returns, setReturns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editKargo, setEK]      = useState(null);
  const [editKoli, setEditKoli] = useState(null);
  const [showImport, setImport] = useState(false);
  const [toast, setToast]       = useState(null);
  const isAdmin = profile?.role==='admin';
  const toast$ = (msg,type='info')=>setToast({msg,type,id:Date.now()});

  const loadData = useCallback(async()=>{
    setLoading(true);
    try {
      const [oSnap,rSnap]=await Promise.all([
        getDocs(query(collection(db,'orders'),orderBy('tarih','desc'),limit(100))),
        getDocs(query(collection(db,'returns'),orderBy('tarih','desc'),limit(100))),
      ]);
      const allOrders = oSnap.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.durum==='tamamlandi');
      const seenIrs = new Map();
      allOrders.forEach(o => {
        const key = o.irsaliyeNo || o.id;
        if (!seenIrs.has(key) || (o.tarih?.toDate?.() > seenIrs.get(key).tarih?.toDate?.())) {
          seenIrs.set(key, o);
        }
      });
      setOrders([...seenIrs.values()]);
      setReturns(rSnap.docs.map(d=>({id:d.id,...d.data()})));
    }catch{}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadData();},[loadData]);

  const saveKargoNo = async ({ takipNo, firma }) => {
    try {
      await updateDoc(doc(db,'orders',editKargo.id),{kargoTakipNo:takipNo||'',kargoFirmasi:firma||''});
      setOrders(prev=>prev.map(o=>o.id===editKargo.id?{...o,kargoTakipNo:takipNo||'',kargoFirmasi:firma||''}:o));
      toast$('Kargo bilgisi güncellendi ✓','success');
    }catch(e){toast$('Hata: '+e.message,'error');}
    setEK(null);
  };

  const saveKoliInfo = async (koliInfo) => {
    try {
      await updateDoc(doc(db,'orders',editKoli.id),{koliInfo});
      setOrders(prev=>prev.map(o=>o.id===editKoli.id?{...o,koliInfo}:o));
      toast$('Koli / palet bilgisi güncellendi ✓','success');
    }catch(e){toast$('Hata: '+e.message,'error');}
    setEditKoli(null);
  };

  const exportOrders = () => {
    const rows = orders.map(o=>({
      'Tarih': o.tarih?.toDate?.().toLocaleDateString('tr-TR')||'',
      'İrsaliye No': o.irsaliyeNo||'',
      'Cari İsim': o.cariIsim||'',
      'Operatör': o.operator||'',
      'Tamam': o.tamam||0,
      'Eksik': o.eksik||0,
      'Fazla': o.fazla||0,
      'Taranmadı': o.taranmadi||0,
      'Toplam Kalem': o.toplamKalem||0,
      'Koli Bilgisi': o.koliInfo?.label||'',
      'Kargo Takip No': o.kargoTakipNo||'',
      'Kargo Firması': o.kargoFirmasi||'',
      'Süre (dk)': o.sure||0,
    }));
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Sipariş Raporları');
    XLSX.writeFile(wb,`siparis_rapor_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportReturns = () => {
    const rows = returns.map(r=>({
      'Tarih': r.tarih?.toDate?.().toLocaleDateString('tr-TR')||'',
      'Cari İsim': r.cariIsim||'',
      'Operatör': r.operator||'',
      'İade Nedeni': r.neden||'',
      'Toplam Adet': r.toplamAdet||0,
      'Durum': r.durum==='onaylandi'?'Onaylandı':'Onay Bekliyor',
    }));
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'İade Raporları');
    XLSX.writeFile(wb,`iade_rapor_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div>
      <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <h2 style={{color:'#f8fafc',fontSize:15,fontWeight:700}}>📊 Raporlar & Geçmiş</h2>
        {isAdmin&&tab==='siparisler'&&<button onClick={()=>setImport(true)} style={{background:'rgba(59,130,246,.3)',border:'none',color:'#93c5fd',padding:'7px 12px',borderRadius:10,fontWeight:600,fontSize:12,cursor:'pointer'}}>🚚 Kargo Eşleştir</button>}
      </div>

      {/* Tabs */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',display:'flex'}}>
        {[{id:'siparisler',lbl:'📋 Siparişler'},{id:'iadeler',lbl:'↩️ İadeler'}].map(({id,lbl})=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'12px',fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:'transparent',color:tab===id?'#2563eb':'#64748b',borderBottom:`3px solid ${tab===id?'#3b82f6':'transparent'}`}}>{lbl}</button>
        ))}
      </div>

      <div style={{padding:'12px',maxWidth:700,margin:'0 auto'}}>
        {/* Export + count */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <p style={{fontSize:13,color:'#64748b'}}>{tab==='siparisler'?orders.length:returns.length} kayıt</p>
          <button onClick={tab==='siparisler'?exportOrders:exportReturns} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'8px 14px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer'}}>⬇️ Excel İndir</button>
        </div>

        {loading?(
          <div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:13}}>Yükleniyor...</p></div>
        ):tab==='siparisler'?(
          orders.length===0?(
            <div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:36,marginBottom:8}}>📋</p><p style={{fontSize:14}}>Henüz sipariş kaydı yok</p></div>
          ):orders.map(o=>{
            const d=o.tarih?.toDate?.();
            const tamam=o.tamam||0,toplam=o.toplamKalem||0;
            return (
              <div key={o.id} style={{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:10,border:'1px solid #e2e8f0'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                  <div style={{width:42,height:42,borderRadius:12,background:tamam===toplam?'#dcfce7':'#fef3c7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                    {tamam===toplam?'✅':'⚠️'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <p style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{o.cariIsim||'—'}</p>
                        <p style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace'}}>{o.irsaliyeNo||'İrsaliye no yok'}</p>
                      </div>
                      <p style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>{d?.toLocaleDateString('tr-TR')||'—'}</p>
                    </div>
                    <div style={{display:'flex',gap:10,marginTop:8,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:'#64748b'}}>👤 {o.operator||'—'}</span>
                      <span style={{fontSize:11,color:'#16a34a'}}>✅ {tamam}/{toplam}</span>
                      {o.eksik>0&&<span style={{fontSize:11,color:'#d97706'}}>⚠️ {o.eksik}</span>}
                      {o.fazla>0&&<span style={{fontSize:11,color:'#dc2626'}}>❌ {o.fazla}</span>}
                      {o.koliInfo?.label&&<span style={{fontSize:11,color:'#6366f1'}}>📦 {o.koliInfo.label}</span>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,flexWrap:'wrap'}}>
                      {o.kargoTakipNo?(
                        <span style={{fontSize:11,color:'#16a34a',fontFamily:'monospace',background:'#dcfce7',padding:'3px 8px',borderRadius:6}}>🚚 {o.kargoTakipNo}</span>
                      ):(
                        <span style={{fontSize:11,color:'#94a3b8'}}>Takip no yok</span>
                      )}
                      {isAdmin&&(
                        <>
                          <button onClick={()=>setEditKoli(o)} style={{fontSize:11,color:'#6366f1',background:'none',border:'1px solid #c7d2fe',borderRadius:6,padding:'3px 8px',cursor:'pointer'}}>✏️ Koli</button>
                          <button onClick={()=>setEK(o)} style={{fontSize:11,color:'#3b82f6',background:'none',border:'1px solid #bfdbfe',borderRadius:6,padding:'3px 8px',cursor:'pointer'}}>✏️ Kargo</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ):(
          returns.length===0?(
            <div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:36,marginBottom:8}}>↩️</p><p style={{fontSize:14}}>Henüz iade kaydı yok</p></div>
          ):returns.map(r=>{
            const d=r.tarih?.toDate?.();
            return (
              <div key={r.id} style={{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:10,border:`1px solid ${r.durum==='onaylandi'?'#86efac':'#fde68a'}`}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:42,height:42,borderRadius:12,background:r.durum==='onaylandi'?'#dcfce7':'#fef3c7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                    {r.durum==='onaylandi'?'✅':'⏳'}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <p style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{r.cariIsim||'—'}</p>
                      <p style={{fontSize:11,color:'#94a3b8'}}>{d?.toLocaleDateString('tr-TR')||'—'}</p>
                    </div>
                    <p style={{fontSize:11,color:'#64748b',marginTop:3}}>{r.neden||'Neden belirtilmemiş'} · {r.toplamAdet||0} adet</p>
                    <p style={{fontSize:11,color:r.durum==='onaylandi'?'#16a34a':'#d97706',marginTop:2}}>{r.durum==='onaylandi'?'✓ Onaylandı - Stoğa Eklendi':'Onay Bekliyor'}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editKargo&&<KargoModal order={editKargo} onSave={saveKargoNo} onClose={()=>setEK(null)} />}
      {editKoli&&<KoliModal order={editKoli} onSave={saveKoliInfo} onClose={()=>setEditKoli(null)} />}
      {showImport&&<KargoImportModal onDone={()=>{setImport(false);loadData();}} onClose={()=>setImport(false)} />}
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
