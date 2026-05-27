import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc,
         query, where, orderBy, limit, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

/* ── Toast ─────────────────────────────────────────── */
function Toast({ msg, type, onDone }) {
  const bg = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
      background:bg[type]||'#3b82f6', color:'#fff', padding:'10px 20px', borderRadius:12,
      fontWeight:600, fontSize:14, zIndex:9999, boxShadow:'0 4px 12px rgba(0,0,0,.2)' }}>
      {msg}
    </div>
  );
}

/* ── Product Row ─────────────────────────────────── */
function ProductRow({ p, isAdmin, onAdjust }) {
  const miktar = p.miktar ?? null;
  const kritik = miktar !== null && miktar <= 0;
  const low = miktar !== null && miktar > 0 && miktar < 5;
  const dotColor = kritik ? '#ef4444' : low ? '#f59e0b' : '#10b981';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0',
      borderBottom:'1px solid #f1f5f9' }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:dotColor, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:13, fontWeight:600, color:'#1e293b', marginBottom:1,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {p.urunAdi || '—'}
        </p>
        <p style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace' }}>
          {p.malzemeKodu && <span style={{ marginRight:8 }}>{p.malzemeKodu}</span>}
          {p.ean}
        </p>
        {p.locations?.length > 0 && (
          <p style={{ fontSize:11, color:'#3b82f6', marginTop:1 }}>
            📍 {p.locations.join(' · ')}
          </p>
        )}
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <p style={{ fontSize:16, fontWeight:700,
          color: kritik ? '#ef4444' : low ? '#d97706' : '#1e293b' }}>
          {miktar !== null ? miktar : '—'}
        </p>
        <p style={{ fontSize:10, color:'#94a3b8' }}>
          {p.totalMiktar !== undefined && p.totalMiktar !== miktar
            ? `toplam: ${p.totalMiktar}` : 'adet'}
        </p>
      </div>
      {isAdmin && onAdjust && (
        <button onClick={() => onAdjust(p)}
          style={{ background:'#f1f5f9', border:'none', borderRadius:8, padding:'6px 10px',
            fontSize:12, cursor:'pointer', color:'#64748b', flexShrink:0 }}>
          ✏️
        </button>
      )}
    </div>
  );
}

/* ── MAIN ─────────────────────────────────────────── */
export default function Stok() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const TABS = isAdmin
    ? ['Raf Görünümü', 'Ürün Ara', 'Kritik Stok', 'Hareketler', 'Yönet']
    : ['Raf Görünümü', 'Ürün Ara', 'Kritik Stok'];

  const [tab, setTab] = useState('Raf Görünümü');
  const [toast, setToast] = useState(null);
  const toast$ = (msg, type = 'info') => setToast({ msg, type, id: Date.now() });

  /* ── Stats ── */
  const [stats, setStats] = useState({ cesit: 0, adet: 0, kritik: 0 });
  const loadStats = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'stock'));
      let adet = 0, kritik = 0;
      snap.docs.forEach(d => {
        const m = d.data().miktar || 0;
        adet += m;
        if (m <= 0) kritik++;
      });
      setStats({ cesit: snap.size, adet, kritik });
    } catch {}
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── RAF GÖRÜNÜMÜ ── */
  const [koridor, setKoridor] = useState('109');
  const [raf, setRaf] = useState(null);
  const [kat, setKat] = useState(null);
  const [rafProds, setRafProds] = useState([]);
  const [rafLoading, setRafLoading] = useState(false);

  const rafKod = raf && kat ? `A${koridor}S${String(raf).padStart(3,'0')}${kat}` : null;

  const loadRaf = useCallback(async () => {
    if (!rafKod) return;
    setRafLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'products'),
        where('locations','array-contains', rafKod)));
      const prods = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      const withStock = await Promise.all(prods.map(async p => {
        if (!p.ean) return { ...p, miktar:null, totalMiktar:null };
        const s = await getDoc(doc(db,'stock',p.ean));
        if (!s.exists()) return { ...p, miktar:null, totalMiktar:null };
        const data = s.data();
        // Lokasyona özgü miktar varsa onu göster, yoksa toplam
        const lokMiktar = data.byLocation?.[rafKod] ?? null;
        const totalMiktar = data.miktar ?? null;
        return { ...p, miktar: lokMiktar !== null ? lokMiktar : totalMiktar, totalMiktar };
      }));
      setRafProds(withStock.sort((a,b) => (a.urunAdi||'').localeCompare(b.urunAdi||'')));
    } catch (e) { toast$('Hata: '+e.message,'error'); }
    setRafLoading(false);
  }, [rafKod]);

  useEffect(() => { if (rafKod) loadRaf(); }, [rafKod, loadRaf]);

  /* ── ÜRÜN ARA ── */
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (searchQ.length < 2) { setSearchRes([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const snap = await getDocs(collection(db,'products'));
        const q = searchQ.toLowerCase();
        const matched = snap.docs.map(d => ({id:d.id,...d.data()}))
          .filter(p => (p.ean&&p.ean.includes(searchQ)) ||
            (p.malzemeKodu&&p.malzemeKodu.toLowerCase().includes(q)) ||
            (p.urunAdi&&p.urunAdi.toLowerCase().includes(q)))
          .slice(0,40);
        const withStock = await Promise.all(matched.map(async p => {
          if (!p.ean) return {...p,miktar:null};
          const s = await getDoc(doc(db,'stock',p.ean));
          return {...p, miktar: s.exists()?(s.data().miktar??null):null};
        }));
        setSearchRes(withStock);
      } catch {}
      setSearchLoading(false);
    }, 400);
  }, [searchQ]);

  /* ── KRİTİK STOK ── */
  const [kritikList, setKritikList] = useState([]);
  const [kritikLoading, setKritikLoading] = useState(false);

  const loadKritik = useCallback(async () => {
    setKritikLoading(true);
    try {
      const stockSnap = await getDocs(collection(db,'stock'));
      const kritik = stockSnap.docs
        .map(d => ({ean:d.id,...d.data()}))
        .filter(s => (s.miktar||0) <= 0);

      const prodSnap = await getDocs(collection(db,'products'));
      const prodMap = {};
      prodSnap.docs.forEach(d => { const p=d.data(); if(p.ean) prodMap[p.ean]=p; });

      setKritikList(kritik.map(s => ({
        ...s,
        urunAdi: prodMap[s.ean]?.urunAdi || '',
        malzemeKodu: prodMap[s.ean]?.malzemeKodu || '',
        locations: prodMap[s.ean]?.locations || [],
      })).sort((a,b) => (a.miktar||0)-(b.miktar||0)));
    } catch {}
    setKritikLoading(false);
  }, []);

  useEffect(() => { if (tab==='Kritik Stok') loadKritik(); }, [tab, loadKritik]);

  /* ── HAREKETLER ── */
  const [hareketler, setHareketler] = useState([]);
  const [hareketLoading, setHareketLoading] = useState(false);

  const loadHareketler = useCallback(async () => {
    setHareketLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'stockMovements'),
        orderBy('tarih','desc'), limit(100)));
      setHareketler(snap.docs.map(d => ({id:d.id,...d.data()})));
    } catch {}
    setHareketLoading(false);
  }, []);

  useEffect(() => { if (tab==='Hareketler') loadHareketler(); }, [tab, loadHareketler]);

  /* ── YÖNETİM: KÖK STOK ── */
  const [impLoading, setImpLoading] = useState(false);

  const importKokStok = async (file) => {
    if (!window.confirm('⚠️ Bu işlem TÜM stok verilerini sıfırlayıp yeni veriyi yazar. Emin misiniz?')) return;
    setImpLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async ({ target: { result } }) => {
        try {
          const wb = XLSX.read(new Uint8Array(result), { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

          // Header detection - esnek
          let hIdx=0, cEan=-1, cCode=-1, cMiktar=-1, cUrun=-1;
          for (let r=0; r<Math.min(rows.length,10); r++) {
            const cells = rows[r].map(c=>String(c||'').toLowerCase().replace(/\s+/g,' ').trim());
            let score=0;
            cells.forEach((cell,j) => {
              if (/ean|barkod|barcode/.test(cell) && cEan<0) { cEan=j; score++; }
              if (/(malzeme|stok|item)\s*(kodu?|code?)/.test(cell) && cCode<0) { cCode=j; score++; }
              if (/miktar|adet|qty|quantity|kullan/.test(cell) && cMiktar<0) { cMiktar=j; score++; }
              if (/açıklama|aciklama|ürün ad|description/.test(cell) && cUrun<0) cUrun=j;
            });
            if (score>=2) { hIdx=r; break; }
          }
          // Son sütunu miktar olarak dene
          if (cMiktar<0 && rows[hIdx]?.length>0) cMiktar=rows[hIdx].length-1;
          if (cMiktar<0) {
            toast$('Miktar sütunu bulunamadı','error');
            setImpLoading(false); return;
          }

          // Delete all existing stock
          const existing = await getDocs(collection(db,'stock'));
          const delBatch = writeBatch(db);
          existing.docs.forEach(d => delBatch.delete(d.ref));
          await delBatch.commit();

          // Write new stock
          const now = Timestamp.now();
          let count=0;
          const movBatch = writeBatch(db);
          const stockBatch = writeBatch(db);

          // Lokasyon sütunu var mı?
          let cLok = -1;
          if (rows[hIdx]) {
            rows[hIdx].map(c=>String(c||'').toLowerCase().trim()).forEach((cell,j) => {
              if (/lokasyon|location/.test(cell) && cLok<0) cLok=j;
            });
          }

          // Önce tüm satırları oku, EAN başına byLocation ve toplam miktar hesapla
          const eanDataMap = {};
          rows.slice(hIdx+1).forEach(row => {
            const ean = String(row[cEan]||'').trim();
            const miktar = parseInt(String(row[cMiktar]||'0').replace(/\D/g,''),10)||0;
            if (!ean || !miktar) return;
            const urunAdi = cUrun>=0?String(row[cUrun]||'').trim():'';
            const malzemeKodu = cCode>=0?String(row[cCode]||'').trim():'';
            const lokasyon = cLok>=0?String(row[cLok]||'').trim():'';

            if (!eanDataMap[ean]) {
              eanDataMap[ean] = { ean, urunAdi, malzemeKodu, miktar:0, byLocation:{} };
            }
            eanDataMap[ean].miktar += miktar;
            if (lokasyon) {
              eanDataMap[ean].byLocation[lokasyon] = (eanDataMap[ean].byLocation[lokasyon]||0) + miktar;
            }
          });

          Object.values(eanDataMap).forEach(item => {
            stockBatch.set(doc(db,'stock',item.ean), {
              ean:item.ean, miktar:item.miktar,
              urunAdi:item.urunAdi, malzemeKodu:item.malzemeKodu,
              byLocation:item.byLocation, sonGuncelleme:now
            });
            movBatch.set(doc(collection(db,'stockMovements')), {
              tarih:now, tip:'kök_stok', ean:item.ean,
              malzemeKodu:item.malzemeKodu, urunAdi:item.urunAdi,
              miktar:item.miktar, oncekiMiktar:0, sonrakiMiktar:item.miktar,
              kaynak:'excel_kök_stok', yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
            });
            count++;
          });

          await stockBatch.commit();
          await movBatch.commit();
          toast$(`${count} ürün kök stok olarak yüklendi ✓`,'success');
          loadStats();
        } catch(e) { toast$('Hata: '+e.message,'error'); }
        setImpLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch { setImpLoading(false); }
  };

  /* ── YÖNETİM: SEVKİYAT EXCEL ── */
  const importSevkiyat = async (file) => {
    setImpLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async ({ target: { result } }) => {
        try {
          const wb = XLSX.read(new Uint8Array(result), { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

          let hIdx=-1, cEan=-1, cCode=-1, cMiktar=-1, cUrun=-1;
          for (let r=0; r<Math.min(rows.length,20); r++) {
            const cells = rows[r].map(c=>String(c).toLowerCase().replace(/\s+/g,' ').trim());
            let hasKey=false, hasMiktar=false;
            cells.forEach((cell,j) => {
              if (/ean|barkod|barcode/.test(cell)) { cEan=j; hasKey=true; }
              if (/(malzeme|ürün kodu|item|stok)\s*(kodu?|code?)/.test(cell) && cCode<0) { cCode=j; hasKey=true; }
              if (/miktar|adet|qty|quantity|alinan|alınan|toplam/.test(cell) && cMiktar<0) { cMiktar=j; hasMiktar=true; }
              if (/açıklama|aciklama|ürün ad|description/.test(cell) && cUrun<0) cUrun=j;
            });
            if (hasKey && hasMiktar) { hIdx=r; break; }
          }
          if (hIdx<0) { toast$('Uygun sütunlar bulunamadı','error'); setImpLoading(false); return; }

          // Load product map for matching
          const prodSnap = await getDocs(collection(db,'products'));
          const eanByCode = {};
          prodSnap.docs.forEach(d => {
            const p = d.data();
            if (p.ean && p.malzemeKodu) eanByCode[p.malzemeKodu.trim()] = p;
          });

          const now = Timestamp.now();
          let added=0, notFound=[];
          const stockBatch = writeBatch(db);
          const movBatch = writeBatch(db);

          // Read current stock
          const stockSnap = await getDocs(collection(db,'stock'));
          const currentStock = {};
          stockSnap.docs.forEach(d => { currentStock[d.id] = d.data().miktar||0; });

          for (const row of rows.slice(hIdx+1)) {
            const rawEan = cEan>=0?String(row[cEan]||'').trim():'';
            const rawCode = cCode>=0?String(row[cCode]||'').trim():'';
            const miktar = parseInt(String(row[cMiktar]||'0').replace(/\D/g,''),10)||0;
            if (!miktar) continue;

            // Try to find EAN
            let ean = rawEan;
            let urunAdi = cUrun>=0?String(row[cUrun]||'').trim():'';
            let malzemeKodu = rawCode;

            if (!ean && rawCode) {
              // Try to match by malzeme kodu
              const extracted = rawCode.match(/(\d{7}-\d{5})/)?.[1];
              const found = extracted ? eanByCode[extracted] : null;
              if (found) { ean=found.ean; urunAdi=found.urunAdi||urunAdi; malzemeKodu=found.malzemeKodu; }
            }

            if (!ean) { notFound.push(rawCode||rawEan); continue; }

            const prev = currentStock[ean]||0;
            const next = prev + miktar;
            stockBatch.set(doc(db,'stock',ean), { ean, miktar:next, urunAdi, malzemeKodu, sonGuncelleme:now }, {merge:true});
            movBatch.set(doc(collection(db,'stockMovements')), {
              tarih:now, tip:'sevkiyat_excel', ean, malzemeKodu, urunAdi,
              miktar, oncekiMiktar:prev, sonrakiMiktar:next,
              kaynak:`sevkiyat_${file.name}`, yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
            });
            currentStock[ean] = next;
            added++;
          }

          await stockBatch.commit();
          await movBatch.commit();
          let msg = `${added} ürün stoğa eklendi ✓`;
          if (notFound.length>0) msg += ` (${notFound.length} ürün eşlenemedi)`;
          toast$(msg, notFound.length>0?'warning':'success');
          loadStats();
        } catch(e) { toast$('Hata: '+e.message,'error'); }
        setImpLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch { setImpLoading(false); }
  };

  /* ── YÖNETİM: MANUEL GİRİŞ ── */
  const [manualQuery, setManualQuery] = useState('');
  const [manualProd, setManualProd] = useState(null);
  const [manualMiktar, setManualMiktar] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  const lookupManual = async (q) => {
    if (q.length < 3) { setManualProd(null); return; }
    try {
      const snap = await getDocs(collection(db,'products'));
      const ql = q.toLowerCase();
      const found = snap.docs.map(d=>({id:d.id,...d.data()}))
        .find(p => (p.ean&&p.ean===q) || (p.malzemeKodu&&p.malzemeKodu.toLowerCase()===ql));
      if (found) {
        const s = await getDoc(doc(db,'stock',found.ean||''));
        setManualProd({...found, currentMiktar: s.exists()?(s.data().miktar||0):0});
      } else {
        setManualProd(null);
      }
    } catch {}
  };

  const addManualStock = async () => {
    if (!manualProd || !manualMiktar) return;
    const miktar = parseInt(manualMiktar)||0;
    if (miktar===0) { toast$('Geçerli bir miktar girin','error'); return; }
    setManualLoading(true);
    try {
      const now = Timestamp.now();
      const prev = manualProd.currentMiktar||0;
      const next = prev + miktar;
      await setDoc(doc(db,'stock',manualProd.ean), {
        ean:manualProd.ean, miktar:next,
        urunAdi:manualProd.urunAdi||'', malzemeKodu:manualProd.malzemeKodu||'',
        sonGuncelleme:now
      }, {merge:true});
      await addDoc(collection(db,'stockMovements'), {
        tarih:now, tip:'sevkiyat_manuel', ean:manualProd.ean,
        malzemeKodu:manualProd.malzemeKodu||'', urunAdi:manualProd.urunAdi||'',
        miktar, oncekiMiktar:prev, sonrakiMiktar:next,
        kaynak:'manuel', yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
      });
      toast$(`${manualProd.urunAdi||manualProd.ean}: ${prev} → ${next} ✓`,'success');
      setManualProd({...manualProd, currentMiktar:next});
      setManualMiktar('');
      loadStats();
    } catch(e) { toast$('Hata: '+e.message,'error'); }
    setManualLoading(false);
  };

  /* ── ADJUST ── */
  const [adjustProd, setAdjustProd] = useState(null);
  const [adjustMiktar, setAdjustMiktar] = useState('');

  const saveAdjust = async () => {
    if (!adjustProd) return;
    const yeni = parseInt(adjustMiktar);
    if (isNaN(yeni)) { toast$('Geçerli miktar girin','error'); return; }
    try {
      const now = Timestamp.now();
      const prev = adjustProd.miktar||0;
      await setDoc(doc(db,'stock',adjustProd.ean), {
        ean:adjustProd.ean, miktar:yeni, sonGuncelleme:now
      }, {merge:true});
      await addDoc(collection(db,'stockMovements'), {
        tarih:now, tip:'duzeltme', ean:adjustProd.ean,
        malzemeKodu:adjustProd.malzemeKodu||'', urunAdi:adjustProd.urunAdi||'',
        miktar:yeni-prev, oncekiMiktar:prev, sonrakiMiktar:yeni,
        kaynak:'manuel_duzeltme', yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
      });
      toast$('Stok güncellendi ✓','success');
      setAdjustProd(null);
      if (tab==='Raf Görünümü') loadRaf();
      if (tab==='Kritik Stok') loadKritik();
      if (tab==='Ürün Ara') { /* refresh search */ }
      loadStats();
    } catch(e) { toast$('Hata: '+e.message,'error'); }
  };

  /* ── RENDER ─────────────────────────────────────── */
  const S = {
    page:{ padding:'16px', maxWidth:700, margin:'0 auto' },
    tab:{ border:'none', background:'none', padding:'8px 14px', fontSize:13,
      fontWeight:600, cursor:'pointer', borderRadius:8, transition:'all .15s' },
    card:{ background:'#fff', borderRadius:14, padding:'16px', border:'1px solid #e2e8f0', marginBottom:12 },
    btn:{ border:'none', borderRadius:10, padding:'10px 16px', fontSize:13,
      fontWeight:600, cursor:'pointer' },
    input:{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e8f0',
      fontSize:14, outline:'none', boxSizing:'border-box' },
  };

  const tipLabel = { kök_stok:'📥 Kök Stok', sevkiyat_excel:'📦 Sevkiyat', sevkiyat_manuel:'✍️ Manuel',
    irsaliye_cikis:'📤 İrsaliye', duzeltme:'✏️ Düzeltme' };
  const tipColor = { kök_stok:'#3b82f6', sevkiyat_excel:'#10b981', sevkiyat_manuel:'#8b5cf6',
    irsaliye_cikis:'#f59e0b', duzeltme:'#64748b' };

  return (
    <div>
      {/* Header */}
      <div style={{ background:'#0f172a', padding:'12px 16px', display:'flex',
        alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ color:'#fff', fontWeight:700, fontSize:16 }}>📦 Stok Yönetimi</p>
        <div style={{ display:'flex', gap:16 }}>
          <div style={{ textAlign:'center' }}>
            <p style={{ color:'#94a3b8', fontSize:10 }}>ÇEŞİT</p>
            <p style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{stats.cesit}</p>
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ color:'#94a3b8', fontSize:10 }}>TOPLAM</p>
            <p style={{ color:'#10b981', fontWeight:700, fontSize:15 }}>{stats.adet.toLocaleString()}</p>
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ color:'#94a3b8', fontSize:10 }}>KRİTİK</p>
            <p style={{ color: stats.kritik>0?'#ef4444':'#10b981', fontWeight:700, fontSize:15 }}>{stats.kritik}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:'12px 16px', background:'#f8fafc',
        borderBottom:'1px solid #e2e8f0', overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t} style={{ ...S.tab,
            background: tab===t?'#1e40af':'transparent',
            color: tab===t?'#fff':'#64748b' }}
            onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div style={S.page}>

        {/* ── RAF GÖRÜNÜMÜ ── */}
        {tab==='Raf Görünümü' && (
          <>
            {/* Koridor */}
            <div style={S.card}>
              <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10,
                textTransform:'uppercase', letterSpacing:1 }}>Koridor</p>
              <div style={{ display:'flex', gap:10 }}>
                {['109','110'].map(k => (
                  <button key={k} onClick={() => { setKoridor(k); setRaf(null); setKat(null); }}
                    style={{ ...S.btn, flex:1, fontSize:15,
                      background: koridor===k?'#1e40af':'#f1f5f9',
                      color: koridor===k?'#fff':'#475569' }}>
                    Koridor {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Raf picker */}
            <div style={S.card}>
              <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10,
                textTransform:'uppercase', letterSpacing:1 }}>
                Raf {raf ? `— Seçili: ${raf}` : ''}
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:5,
                maxHeight:200, overflowY:'auto' }}>
                {Array.from({length:114}, (_,i)=>i+1).map(n => (
                  <button key={n} onClick={() => setRaf(n)}
                    style={{ padding:'6px 0', border:'none', borderRadius:6, fontSize:12,
                      fontWeight:600, cursor:'pointer',
                      background: raf===n?'#1e40af':'#f1f5f9',
                      color: raf===n?'#fff':'#475569' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Kat picker */}
            {raf && (
              <div style={S.card}>
                <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10,
                  textTransform:'uppercase', letterSpacing:1 }}>Kat</p>
                <div style={{ display:'flex', gap:10 }}>
                  {['A','B','C','D','E','F'].map(k => (
                    <button key={k} onClick={() => setKat(k)}
                      style={{ ...S.btn, flex:1, fontSize:15,
                        background: kat===k?'#1e40af':'#f1f5f9',
                        color: kat===k?'#fff':'#475569' }}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {rafKod && (
              <div style={S.card}>
                <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:2,
                  textTransform:'uppercase', letterSpacing:1 }}>
                  📍 {rafKod}
                </p>
                {rafLoading ? (
                  <p style={{ color:'#94a3b8', fontSize:13, padding:'20px 0', textAlign:'center' }}>
                    Yükleniyor...
                  </p>
                ) : rafProds.length === 0 ? (
                  <p style={{ color:'#94a3b8', fontSize:13, padding:'20px 0', textAlign:'center' }}>
                    Bu rafta ürün bulunamadı
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>
                      {rafProds.length} ürün
                    </p>
                    {rafProds.map((p,i) => (
                      <ProductRow key={i} p={p} isAdmin={isAdmin}
                        onAdjust={isAdmin ? (p) => { setAdjustProd(p); setAdjustMiktar(String(p.miktar??'')); } : null} />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ── ÜRÜN ARA ── */}
        {tab==='Ürün Ara' && (
          <div style={S.card}>
            <input style={S.input} placeholder="EAN, malzeme kodu veya ürün adı..."
              value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus />
            <div style={{ marginTop:12 }}>
              {searchLoading && <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center' }}>Aranıyor...</p>}
              {!searchLoading && searchQ.length>=2 && searchRes.length===0 && (
                <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'16px 0' }}>Sonuç bulunamadı</p>
              )}
              {searchRes.map((p,i) => (
                <ProductRow key={i} p={p} isAdmin={isAdmin}
                  onAdjust={isAdmin ? (p) => { setAdjustProd(p); setAdjustMiktar(String(p.miktar??'')); } : null} />
              ))}
            </div>
          </div>
        )}

        {/* ── KRİTİK STOK ── */}
        {tab==='Kritik Stok' && (
          <div style={S.card}>
            <p style={{ fontSize:12, fontWeight:700, color:'#ef4444', marginBottom:12,
              textTransform:'uppercase', letterSpacing:1 }}>
              ⚠️ Kritik Stok — {kritikList.length} Ürün
            </p>
            {kritikLoading ? (
              <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'20px 0' }}>Yükleniyor...</p>
            ) : kritikList.length===0 ? (
              <p style={{ color:'#10b981', fontSize:13, textAlign:'center', padding:'20px 0' }}>✅ Kritik stok yok</p>
            ) : (
              kritikList.map((p,i) => (
                <ProductRow key={i} p={p} isAdmin={isAdmin}
                  onAdjust={isAdmin ? (p) => { setAdjustProd(p); setAdjustMiktar(String(p.miktar??'')); } : null} />
              ))
            )}
          </div>
        )}

        {/* ── HAREKETLER ── */}
        {tab==='Hareketler' && (
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:1 }}>
                Son 100 Hareket
              </p>
              <button onClick={loadHareketler} style={{ ...S.btn, padding:'6px 12px',
                background:'#f1f5f9', color:'#64748b', fontSize:12 }}>↻ Yenile</button>
            </div>
            {hareketLoading ? (
              <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'20px 0' }}>Yükleniyor...</p>
            ) : hareketler.length===0 ? (
              <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'20px 0' }}>Henüz hareket yok</p>
            ) : (
              hareketler.map((h,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ background: tipColor[h.tip]||'#94a3b8',
                    color:'#fff', borderRadius:6, padding:'2px 8px', fontSize:11,
                    fontWeight:700, flexShrink:0, whiteSpace:'nowrap' }}>
                    {tipLabel[h.tip]||h.tip}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:600, color:'#1e293b',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {h.urunAdi||h.ean}
                    </p>
                    <p style={{ fontSize:10, color:'#94a3b8' }}>
                      {h.yapan} · {h.tarih?.toDate?.()?.toLocaleDateString('tr-TR')}
                      {h.kaynak && <span style={{ marginLeft:6 }}>· {h.kaynak.replace('irsaliye:','İrsaliye: ')}</span>}
                    </p>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:13, fontWeight:700,
                      color: (h.miktar||0)>=0?'#10b981':'#ef4444' }}>
                      {(h.miktar||0)>0?'+':''}{h.miktar}
                    </p>
                    <p style={{ fontSize:10, color:'#94a3b8' }}>{h.oncekiMiktar}→{h.sonrakiMiktar}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── YÖNET (admin) ── */}
        {tab==='Yönet' && isAdmin && (
          <>
            {/* Kök Stok */}
            <div style={S.card}>
              <p style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:4 }}>
                📥 Kök Stok Yükle
              </p>
              <p style={{ fontSize:12, color:'#ef4444', marginBottom:10 }}>
                ⚠️ Tüm stok verisi sıfırlanır ve yenisiyle değiştirilir
              </p>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>
                Format: EAN Kodu, Malzeme Kodu, Ürün Adı, Miktar (veya Kullanılabilir Miktar)
              </p>
              <label style={{ ...S.btn, background:'#1e40af', color:'#fff',
                display:'inline-block', cursor:'pointer', opacity:impLoading?0.6:1 }}>
                {impLoading ? 'Yükleniyor...' : '📂 Excel Seç'}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }}
                  disabled={impLoading}
                  onChange={e => { if(e.target.files[0]) importKokStok(e.target.files[0]); e.target.value=''; }} />
              </label>
            </div>

            {/* Sevkiyat Excel */}
            <div style={S.card}>
              <p style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:4 }}>
                📦 Sevkiyat Ekle (Excel)
              </p>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>
                Mevcut stoğun üstüne eklenir. EAN veya Malzeme Kodu ile eşleştirme yapılır.
              </p>
              <label style={{ ...S.btn, background:'#10b981', color:'#fff',
                display:'inline-block', cursor:'pointer', opacity:impLoading?0.6:1 }}>
                {impLoading ? 'Yükleniyor...' : '📂 Excel Seç'}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }}
                  disabled={impLoading}
                  onChange={e => { if(e.target.files[0]) importSevkiyat(e.target.files[0]); e.target.value=''; }} />
              </label>
            </div>

            {/* Manuel */}
            <div style={S.card}>
              <p style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:10 }}>
                ✍️ Manuel Stok Girişi
              </p>
              <input style={{ ...S.input, marginBottom:10 }}
                placeholder="EAN veya malzeme kodu (tam girin)"
                value={manualQuery}
                onChange={e => { setManualQuery(e.target.value); lookupManual(e.target.value); }} />
              {manualProd && (
                <div style={{ background:'#f8fafc', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'#1e293b' }}>{manualProd.urunAdi}</p>
                  <p style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace' }}>
                    {manualProd.malzemeKodu} · {manualProd.ean}
                  </p>
                  <p style={{ fontSize:12, color:'#64748b', marginTop:4 }}>
                    Mevcut stok: <strong>{manualProd.currentMiktar}</strong> adet
                  </p>
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <input type="number" style={{ ...S.input, flex:1 }}
                      placeholder="Eklenecek miktar"
                      value={manualMiktar}
                      onChange={e => setManualMiktar(e.target.value)} />
                    <button onClick={addManualStock} disabled={manualLoading}
                      style={{ ...S.btn, background:'#10b981', color:'#fff',
                        opacity:manualLoading?0.6:1, flexShrink:0 }}>
                      {manualLoading ? '...' : 'Ekle'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* Adjust Modal */}
      {adjustProd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24,
            width:'calc(100% - 48px)', maxWidth:360 }}>
            <p style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Stok Düzelt</p>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>
              {adjustProd.urunAdi||adjustProd.ean}
            </p>
            <input type="number" style={{ ...S.input, marginBottom:12 }}
              placeholder="Yeni stok miktarı"
              value={adjustMiktar}
              onChange={e => setAdjustMiktar(e.target.value)} autoFocus />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setAdjustProd(null)}
                style={{ ...S.btn, flex:1, background:'#f1f5f9', color:'#64748b' }}>
                İptal
              </button>
              <button onClick={saveAdjust}
                style={{ ...S.btn, flex:1, background:'#1e40af', color:'#fff' }}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}
