import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
         query, where, orderBy, limit, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useDepo, stokDocId } from '../contexts/DepoContext.jsx';
import * as XLSX from 'xlsx';

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

const RAF_LIMITS = {
  '109': { start: 13, end: 117 },
  '110': { start: 14, end: 117 }
};
const getRafRange = (koridor) => RAF_LIMITS[koridor] || RAF_LIMITS['109'];
const getRafList = (koridor) => {
  const { start, end } = getRafRange(koridor);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

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

export default function Stok() {
  const { user, profile } = useAuth();
  const { selectedDepo, depoInfo } = useDepo();
  const isFull = depoInfo.full;

  /* Depo bazlı stok sorgulama yardımcısı */
  const getStockDocs = useCallback(async () => {
    if (isMainDepo(selectedDepo)) {
      const snap = await getDocs(collection(db, 'stock'));
      return snap.docs.filter(d => !d.id.includes('_')); // Tuzla: plain EAN ID'ler
    }
    const snap = await getDocs(query(collection(db, 'stock'), where('depoId', '==', selectedDepo)));
    return snap.docs;
  }, [selectedDepo]);
  const isAdmin = profile?.role === 'admin';

  const TABS = isFull
    ? (isAdmin ? ['Raf Görünümü', 'Ürün Ara', 'Hareketler', 'Yönet'] : ['Raf Görünümü', 'Ürün Ara', 'Hareketler'])
    : (isAdmin ? ['Ürün Ara', 'Hareketler', 'Yönet'] : ['Ürün Ara', 'Hareketler']);

  const [tab, setTab] = useState(isFull ? 'Raf Görünümü' : 'Ürün Ara');
  const [toast, setToast] = useState(null);
  const toast$ = (msg, type = 'info') => setToast({ msg, type, id: Date.now() });

  /* ── Stats ── */
  const [stats, setStats] = useState({ cesit: 0, adet: 0 });
  const loadStats = useCallback(async () => {
    try {
      const docs = await getStockDocs();
      let adet = 0;
      docs.forEach(d => { adet += d.data().miktar || 0; });
      setStats({ cesit: docs.length, adet });
    } catch {}
  }, [getStockDocs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── Export ── */
  const exportStok = async () => {
    try {
      toast$('Stok dışa aktarılıyor...', 'info');
      const [stockDocs, prodSnap] = await Promise.all([
        getStockDocs(),
        getDocs(collection(db, 'products')),
      ]);
      const prodMap = {};
      prodSnap.docs.forEach(d => { const p = d.data(); if (p.ean) prodMap[p.ean] = p; });
      const stockData = stockDocs
        .map(d => ({ ean: isMainDepo(selectedDepo) ? d.id : (d.data().ean || d.id.split('_').slice(1).join('_')), ...d.data() }))
        .sort((a, b) => (a.urunAdi || '').localeCompare(b.urunAdi || ''));

      // Sayfa 1: Özet
      const ozet = [['EAN Kodu', 'Malzeme Kodu', 'Ürün Adı', 'Toplam Miktar']];
      stockData.forEach(s => {
        const p = prodMap[s.ean] || {};
        ozet.push([s.ean || '', s.malzemeKodu || p.malzemeKodu || '',
          s.urunAdi || p.urunAdi || '', s.miktar || 0]);
      });

      // Sayfa 2: Lokasyon Detay
      const lokDetay = [['EAN Kodu', 'Malzeme Kodu', 'Ürün Adı', 'Lokasyon', 'Miktar']];
      stockData.forEach(s => {
        const p = prodMap[s.ean] || {};
        const byLok = s.byLocation || {};
        if (Object.keys(byLok).length > 0) {
          Object.entries(byLok).forEach(([lok, m]) => {
            if (m !== 0) lokDetay.push([s.ean || '', s.malzemeKodu || p.malzemeKodu || '',
              s.urunAdi || p.urunAdi || '', lok, m]);
          });
        } else {
          lokDetay.push([s.ean || '', s.malzemeKodu || p.malzemeKodu || '',
            s.urunAdi || p.urunAdi || '', '', s.miktar || 0]);
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ozet), 'Stok Özet');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lokDetay), 'Lokasyon Detay');
      XLSX.writeFile(wb, `stok_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast$('Stok Excel indirildi ✓', 'success');
    } catch (e) { toast$('Hata: ' + e.message, 'error'); }
  };

  /* ── RAF GÖRÜNÜMÜ ── */
  const [koridor, setKoridor] = useState('109');
  const [raf, setRaf] = useState(null);
  const [kat, setKat] = useState(null);
  const [rafProds, setRafProds] = useState([]);
  const [rafLoading, setRafLoading] = useState(false);
  const [hvzMode, setHvzMode] = useState(false);
  const [hvzProds, setHvzProds] = useState([]);
  const [hvzLoading, setHvzLoading] = useState(false);
  const [hvzTransfer, setHvzTransfer] = useState(null); // {ean,urunAdi,malzemeKodu,miktar}
  const [hvzTargetLok, setHvzTargetLok] = useState('');
  const [hvzTransferAdet, setHvzTransferAdet] = useState('');

  const rafKod = raf && kat ? `A${koridor}S${String(raf).padStart(3,'0')}${kat}` : null;

  const loadHvz = useCallback(async () => {
    setHvzLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'stock'),where('depoId','==',selectedDepo)));
      const items = snap.docs
        .map(d => ({ ean:d.id, ...d.data() }))
        .filter(s => (s.byLocation?.HVZ ?? 0) > 0)
        .map(s => ({ ean:s.ean, urunAdi:s.urunAdi||'', malzemeKodu:s.malzemeKodu||'', miktar:s.byLocation.HVZ, totalMiktar:s.miktar||0 }));
      setHvzProds(items.sort((a,b) => (a.urunAdi||'').localeCompare(b.urunAdi||'')));
    } catch (e) { toast$('Hata: '+e.message,'error'); }
    setHvzLoading(false);
  }, []);

  /* HVZ → gerçek lokasyona taşı */
  const hvzLokasyonaTasi = async () => {
    if (!hvzTransfer) return;
    const hedef = hvzTargetLok.trim().toUpperCase();
    const adet = parseInt(hvzTransferAdet) || 0;
    if (!hedef) { toast$('Hedef lokasyon girin', 'error'); return; }
    if (hedef === 'HVZ') { toast$('Hedef HVZ olamaz', 'error'); return; }
    if (adet <= 0 || adet > hvzTransfer.miktar) { toast$(`Geçerli adet girin (1-${hvzTransfer.miktar})`, 'error'); return; }
    try {
      const now = Timestamp.now();
      const sRef = doc(db,'stock',stokDocId(selectedDepo,hvzTransfer.ean));
      const sSnap = await getDoc(sRef);
      const data = sSnap.exists() ? sSnap.data() : { byLocation:{}, miktar:0 };
      const byLok = { ...(data.byLocation||{}) };
      byLok.HVZ = (byLok.HVZ||0) - adet;
      if (byLok.HVZ <= 0) delete byLok.HVZ;
      byLok[hedef] = (byLok[hedef]||0) + adet;
      await setDoc(sRef, { byLocation: byLok, sonGuncelleme: now }, { merge:true });
      // products.locations'a hedefi ekle (yeni lokasyonsa görünür olsun)
      try {
        const pSnap = await getDocs(query(collection(db,'products'), where('ean','==',hvzTransfer.ean)));
        if (!pSnap.empty) {
          const pdoc = pSnap.docs[0];
          const locs = pdoc.data().locations || [];
          if (!locs.includes(hedef)) await updateDoc(doc(db,'products',pdoc.id), { locations:[...locs.filter(l=>l!=='BELIRLENECEK'), hedef] });
        }
      } catch {}
      await addDoc(collection(db,'stockMovements'), {
        tarih:now, tip:'hvz_transfer', ean:hvzTransfer.ean,
        malzemeKodu:hvzTransfer.malzemeKodu||'', urunAdi:hvzTransfer.urunAdi||'',
        miktar:adet, lokasyon:hedef, kaynakLokasyon:'HVZ',
        kaynak:'hvz_transfer', yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
      });
      toast$(`${adet} adet ${hedef} lokasyonuna taşındı ✓`, 'success');
      setHvzTransfer(null); setHvzTargetLok(''); setHvzTransferAdet('');
      loadHvz();
    } catch (e) { toast$('Hata: '+e.message, 'error'); }
  };

  const loadRaf = useCallback(async () => {
    if (!rafKod) return;
    setRafLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'products'),
        where('locations','array-contains', rafKod)));
      const prods = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      const withStock = await Promise.all(prods.map(async p => {
        if (!p.ean) return { ...p, miktar:null, totalMiktar:null };
        const s = await getDoc(doc(db,'stock',stokDocId(selectedDepo,p.ean)));
        if (!s.exists()) return { ...p, miktar:null, totalMiktar:null };
        const data = s.data();
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
  const [searchCamOn, setSearchCamOn] = useState(false);
  const [searchCamMsg, setSearchCamMsg] = useState('');
  const searchVideoRef = useRef(null);
  const searchStreamRef = useRef(null);
  const searchDetectorRef = useRef(null);
  const searchRafRef = useRef(null);
  const searchLastRef = useRef({ code:'', emptySince:0 });

  const stopSearchCam = useCallback(() => {
    if (searchRafRef.current) cancelAnimationFrame(searchRafRef.current);
    searchRafRef.current = null;
    if (searchStreamRef.current) searchStreamRef.current.getTracks().forEach(t => t.stop());
    searchStreamRef.current = null;
    if (searchVideoRef.current) searchVideoRef.current.srcObject = null;
    searchLastRef.current = { code:'', emptySince:0 };
    setSearchCamMsg('');
    setSearchCamOn(false);
  }, []);

  const scanSearchBarcode = useCallback(() => {
    if (!searchVideoRef.current || !searchDetectorRef.current) return;
    if (searchVideoRef.current.readyState < 2) {
      searchRafRef.current = requestAnimationFrame(scanSearchBarcode);
      return;
    }
    searchDetectorRef.current.detect(searchVideoRef.current).then(res => {
      const now = Date.now();
      if (!res.length) {
        const last = searchLastRef.current;
        searchLastRef.current = { ...last, emptySince: last.emptySince || now };
        if (now - searchLastRef.current.emptySince > 900) {
          searchLastRef.current = { code:'', emptySince: searchLastRef.current.emptySince };
        }
      } else {
        const code = String(res[0].rawValue || '').trim();
        searchLastRef.current.emptySince = 0;
        if (code && code !== searchLastRef.current.code) {
          searchLastRef.current = { code, emptySince:0 };
          setSearchQ(code);
          toast$('Barkod okundu: ' + code, 'success');
          stopSearchCam();
          return;
        }
      }
      searchRafRef.current = requestAnimationFrame(scanSearchBarcode);
    }).catch(() => {
      searchRafRef.current = requestAnimationFrame(scanSearchBarcode);
    });
  }, [stopSearchCam]);

  const startSearchCam = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast$('Bu cihazda kamera erişimi desteklenmiyor', 'warning'); return;
      }
      if (!('BarcodeDetector' in window)) {
        toast$('Bu tarayıcı barkod taramayı desteklemiyor.', 'warning'); return;
      }
      if (!searchDetectorRef.current) {
        searchDetectorRef.current = new window.BarcodeDetector({
          formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e','qr_code'] });
      }
      setSearchCamOn(true);
      setSearchCamMsg('Kamera açılıyor...');
      await new Promise(resolve => setTimeout(resolve, 120));
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio:false,
          video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:true });
      }
      searchStreamRef.current = stream;
      if (!searchVideoRef.current) throw new Error('Video alanı hazırlanamadı');
      const video = searchVideoRef.current;
      video.srcObject = stream; video.muted = true;
      video.setAttribute('playsinline','true'); video.setAttribute('webkit-playsinline','true');
      await new Promise(resolve => { video.onloadedmetadata = resolve; setTimeout(resolve, 900); });
      await video.play();
      setSearchCamMsg('Barkodu kameraya gösterin');
      searchRafRef.current = requestAnimationFrame(scanSearchBarcode);
    } catch (e) {
      toast$('Kamera açılamadı: ' + e.message, 'error');
      stopSearchCam();
    }
  }, [scanSearchBarcode, stopSearchCam]);

  useEffect(() => () => stopSearchCam(), [stopSearchCam]);

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
          const s = await getDoc(doc(db,'stock',stokDocId(selectedDepo,p.ean)));
          return {...p, miktar: s.exists()?(s.data().miktar??null):null};
        }));
        setSearchRes(withStock);
      } catch {}
      setSearchLoading(false);
    }, 400);
  }, [searchQ]);



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
          if (cMiktar<0 && rows[hIdx]?.length>0) cMiktar=rows[hIdx].length-1;
          if (cMiktar<0) { toast$('Miktar sütunu bulunamadı','error'); setImpLoading(false); return; }

          const existing = await getDocs(query(collection(db,'stock'),where('depoId','==',selectedDepo)));
          const delBatch = writeBatch(db);
          existing.docs.forEach(d => delBatch.delete(d.ref));
          await delBatch.commit();

          const now = Timestamp.now();
          let count=0;
          const movBatch = writeBatch(db);
          const stockBatch = writeBatch(db);
          let cLok = -1;
          if (rows[hIdx]) {
            rows[hIdx].map(c=>String(c||'').toLowerCase().trim()).forEach((cell,j) => {
              if (/lokasyon|location/.test(cell) && cLok<0) cLok=j;
            });
          }
          const eanDataMap = {};
          rows.slice(hIdx+1).forEach(row => {
            const ean = String(row[cEan]||'').trim();
            const miktar = parseInt(String(row[cMiktar]||'0').replace(/\D/g,''),10)||0;
            if (!ean || !miktar) return;
            const urunAdi = cUrun>=0?String(row[cUrun]||'').trim():'';
            const malzemeKodu = cCode>=0?String(row[cCode]||'').trim():'';
            const lokasyon = cLok>=0?String(row[cLok]||'').trim():'';
            if (!eanDataMap[ean]) eanDataMap[ean] = { ean, urunAdi, malzemeKodu, miktar:0, byLocation:{} };
            eanDataMap[ean].miktar += miktar;
            if (lokasyon) eanDataMap[ean].byLocation[lokasyon] = (eanDataMap[ean].byLocation[lokasyon]||0)+miktar;
          });

          Object.values(eanDataMap).forEach(item => {
            stockBatch.set(doc(db,'stock',stokDocId(selectedDepo,item.ean)), {
              ean:item.ean, miktar:item.miktar, urunAdi:item.urunAdi,
              malzemeKodu:item.malzemeKodu, byLocation:item.byLocation, sonGuncelleme:now
            });
            movBatch.set(doc(collection(db,'stockMovements')), {
              tarih:now, tip:'kök_stok', ean:item.ean, malzemeKodu:item.malzemeKodu,
              urunAdi:item.urunAdi, miktar:item.miktar, oncekiMiktar:0, sonrakiMiktar:item.miktar,
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

  /* ── SEVKİYAT EXCEL ── */
  const [sevkiyatPreview, setSevkiyatPreview] = useState(null);

  const importSevkiyat = async (file) => {
    setImpLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async ({ target: { result } }) => {
        try {
          const wb = XLSX.read(new Uint8Array(result), { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
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
          if (cMiktar<0 && rows[hIdx]?.length>0) cMiktar=rows[hIdx].length-1;
          if (cMiktar<0) { toast$('Miktar sütunu bulunamadı','error'); setImpLoading(false); return; }

          // EAN lookup
          const prodSnap = await getDocs(collection(db,'products'));
          const eanByCode = {};
          prodSnap.docs.forEach(d => {
            const p = d.data();
            if (p.malzemeKodu) eanByCode[p.malzemeKodu] = p;
            if (p.ean) eanByCode[p.ean] = p;
          });
          const stockSnap = await getDocs(query(collection(db,'stock'),where('depoId','==',selectedDepo)));
          const stockMap = {};
          stockSnap.docs.forEach(d => { stockMap[d.id] = d.data(); });

          const currentStock = {};
          const previewItems = [];
          rows.slice(hIdx+1).forEach(row => {
            const rawEan = cEan>=0?String(row[cEan]||'').trim():'';
            const rawCode = cCode>=0?String(row[cCode]||'').trim():'';
            const miktar = parseInt(String(row[cMiktar]||'0').replace(/\D/g,''),10)||0;
            if (miktar<=0) return;
            const prod = eanByCode[rawEan]||eanByCode[rawCode]||{};
            const ean = prod.ean||rawEan;
            if (!ean) return;
            currentStock[ean] = (currentStock[ean]||0)+miktar;
            const urunAdi = cUrun>=0?String(row[cUrun]||'').trim():prod.urunAdi||'';
            const malzemeKodu = rawCode||prod.malzemeKodu||'';
            previewItems.push({ ean, malzemeKodu, urunAdi, miktar });
          });

          setSevkiyatPreview({ items: previewItems, lokasyonlar: {} });
          toast$(`${previewItems.length} ürün bulundu — lokasyon girin`, 'info');
        } catch(e) { toast$('Hata: '+e.message,'error'); }
        setImpLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch { setImpLoading(false); }
  };

  const saveSevkiyatWithLok = async () => {
    if (!sevkiyatPreview) return;
    const { items, lokasyonlar } = sevkiyatPreview;
    const missingLok = items.find(i => !lokasyonlar[i.ean]);
    if (missingLok) { toast$(`${missingLok.urunAdi||missingLok.ean} için lokasyon giriniz`, 'error'); return; }
    setImpLoading(true);
    try {
      const now = Timestamp.now();
      const stockSnap = await getDocs(query(collection(db,'stock'),where('depoId','==',selectedDepo)));
      const stockMap = {};
      stockSnap.docs.forEach(d => { stockMap[d.id] = d.data(); });
      const batch = writeBatch(db);
      const movBatch = writeBatch(db);
      items.forEach(item => {
        const prev = stockMap[item.ean]?.miktar || 0;
        const next = prev + item.miktar;
        const lok = lokasyonlar[item.ean];
        const prevByLok = stockMap[item.ean]?.byLocation || {};
        const newByLok = { ...prevByLok, [lok]: (prevByLok[lok]||0) + item.miktar };
        batch.set(doc(db,'stock',stokDocId(selectedDepo,item.ean)), {
          ean:item.ean, depoId:selectedDepo, miktar:next, urunAdi:item.urunAdi||'',
          malzemeKodu:item.malzemeKodu||'', byLocation:newByLok, sonGuncelleme:now
        }, {merge:true});
        movBatch.set(doc(collection(db,'stockMovements')), {
          tarih:now, tip:'sevkiyat_excel', ean:item.ean,
          malzemeKodu:item.malzemeKodu||'', urunAdi:item.urunAdi||'',
          miktar:item.miktar, oncekiMiktar:prev, sonrakiMiktar:next,
          lokasyon:lok, kaynak:'sevkiyat_excel',
          yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
        });
      });
      await batch.commit();
      await movBatch.commit();
      setSevkiyatPreview(null);
      toast$(`${items.length} ürün lokasyonlarıyla stoğa eklendi ✓`, 'success');
      loadStats();
    } catch(e) { toast$('Hata: '+e.message, 'error'); }
    setImpLoading(false);
  };

  /* ── YÖNETİM: MANUEL GİRİŞ ── */
  const [manualQuery, setManualQuery] = useState('');
  const [manualProd, setManualProd] = useState(null);
  const [manualMiktar, setManualMiktar] = useState('');
  const [manualLok, setManualLok] = useState('');
  const [manualTip, setManualTip] = useState('giris');
  const [manualLoading, setManualLoading] = useState(false);
  const [lokKoridor, setLokKoridor] = useState('109');
  const [lokRaf, setLokRaf] = useState(null);
  const [lokKat, setLokKat] = useState(null);
  const [showLokPicker, setShowLokPicker] = useState(false);

  const lookupManual = async (q) => {
    if (q.length < 3) { setManualProd(null); return; }
    try {
      const snap = await getDocs(collection(db,'products'));
      const ql = q.toLowerCase();
      const found = snap.docs.map(d=>({id:d.id,...d.data()}))
        .find(p => (p.ean&&p.ean===q) || (p.malzemeKodu&&p.malzemeKodu.toLowerCase()===ql));
      if (found) {
        const s = await getDoc(doc(db,'stock',stokDocId(selectedDepo,found.ean||'')));
        const stockData = s.exists() ? s.data() : {};
        setManualProd({...found, currentMiktar: stockData.miktar||0, byLocation: stockData.byLocation||{}});
      } else { setManualProd(null); }
    } catch {}
  };

  const addManualStock = async () => {
    if (!manualProd || !manualMiktar) return;
    const miktar = parseInt(manualMiktar)||0;
    if (miktar===0) { toast$('Geçerli bir miktar girin','error'); return; }
    if (!manualLok.trim()) { toast$('Lokasyon seçiniz','error'); return; }
    const lok = manualLok.trim().toUpperCase();
    const prevByLok = manualProd.byLocation || {};
    const prevLokMiktar = prevByLok[lok] || 0;
    if (manualTip==='cikis' && prevLokMiktar < miktar) {
      toast$(`⛔ ${lok} lokasyonunda yalnızca ${prevLokMiktar} adet var. Çıkış yapılamaz.`, 'error');
      return;
    }
    if (manualTip==='cikis' && (manualProd.currentMiktar||0) < miktar) {
      toast$(`⛔ Toplam stok yetersiz (${manualProd.currentMiktar} adet). Çıkış yapılamaz.`, 'error');
      return;
    }
    setManualLoading(true);
    try {
      const now = Timestamp.now();
      const prev = manualProd.currentMiktar||0;
      const isGiris = manualTip === 'giris';
      const delta = isGiris ? miktar : -miktar;
      const next = prev + delta;
      const newLokMiktar = prevLokMiktar + delta;
      const newByLok = { ...prevByLok, [lok]: newLokMiktar };
      await setDoc(doc(db,'stock',stokDocId(selectedDepo,manualProd.ean)), {
        ean:manualProd.ean, depoId:selectedDepo, miktar:next,
        urunAdi:manualProd.urunAdi||'', malzemeKodu:manualProd.malzemeKodu||'',
        byLocation:newByLok, sonGuncelleme:now
      }, {merge:true});
      await addDoc(collection(db,'stockMovements'), {
        tarih:now, tip: isGiris ? 'sevkiyat_manuel' : 'cikis_manuel',
        ean:manualProd.ean, malzemeKodu:manualProd.malzemeKodu||'', urunAdi:manualProd.urunAdi||'',
        miktar:delta, oncekiMiktar:prev, sonrakiMiktar:next,
        lokasyon:lok, kaynak:'manuel', depoId:selectedDepo,
        yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
      });
      toast$(`${isGiris?'Giriş':'Çıkış'}: ${manualProd.urunAdi||manualProd.ean} ${prev} → ${next} ✓`,'success');
      setManualProd({...manualProd, currentMiktar:next, byLocation:newByLok});
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
      // byLocation içindeki negatif kayıtları temizle
      const stockSnap = await getDoc(doc(db,'stock',stokDocId(selectedDepo,adjustProd.ean)));
      const byLok = stockSnap.exists() ? (stockSnap.data().byLocation||{}) : {};
      const cleanByLok = Object.fromEntries(
        Object.entries(byLok).filter(([,m]) => m > 0)
      );
      await setDoc(doc(db,'stock',stokDocId(selectedDepo,adjustProd.ean)), {
        ean:adjustProd.ean, depoId:selectedDepo, miktar:yeni,
        byLocation: cleanByLok,
        sonGuncelleme:now
      }, {merge:true});
      await addDoc(collection(db,'stockMovements'), {
        tarih:now, tip:'duzeltme', ean:adjustProd.ean, depoId:selectedDepo,
        malzemeKodu:adjustProd.malzemeKodu||'', urunAdi:adjustProd.urunAdi||'',
        miktar:yeni-prev, oncekiMiktar:prev, sonrakiMiktar:yeni,
        kaynak:'manuel_duzeltme', yapan:profile?.name||user?.email||'', yapanId:user?.uid||''
      });
      toast$('Stok düzeltildi — negatif lokasyonlar temizlendi ✓','success');
      setAdjustProd(null);
      if (tab==='Raf Görünümü') loadRaf();
      loadStats();
    } catch(e) { toast$('Hata: '+e.message,'error'); }
  };

  /* ── RENDER ── */
  const S = {
    page:{ padding:'16px', maxWidth:700, margin:'0 auto' },
    tab:{ border:'none', background:'none', padding:'8px 14px', fontSize:13,
      fontWeight:600, cursor:'pointer', borderRadius:8, transition:'all .15s' },
    card:{ background:'#fff', borderRadius:14, padding:'16px', border:'1px solid #e2e8f0', marginBottom:12 },
    btn:{ border:'none', borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
    input:{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid #e2e8f0',
      fontSize:14, outline:'none', boxSizing:'border-box' },
  };

  const tipLabel = { kök_stok:'📥 Kök Stok', sevkiyat_excel:'📦 Sevkiyat', sevkiyat_manuel:'✍️ Manuel',
    cikis_manuel:'📤 Çıkış', irsaliye_cikis:'📤 İrsaliye', duzeltme:'✏️ Düzeltme',
    mal_kabul:'📥 Mal Kabul', vas_lokasyon:'🏷️ VAS' };
  const tipColor = { kök_stok:'#3b82f6', sevkiyat_excel:'#10b981', sevkiyat_manuel:'#8b5cf6',
    cikis_manuel:'#ef4444', irsaliye_cikis:'#f59e0b', duzeltme:'#64748b',
    mal_kabul:'#10b981', vas_lokasyon:'#7c3aed' };

  return (
    <div>
      {/* Header */}
      <div style={{ background:'#0f172a', padding:'12px 16px', display:'flex',
        alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ color:'#fff', fontWeight:700, fontSize:16 }}>{depoInfo.icon} Stok — {depoInfo.short}</p>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={exportStok}
            style={{ background:'#10b981', border:'none', borderRadius:8, color:'#fff',
              padding:'7px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            ⬇️ Excel
          </button>
          <div style={{ textAlign:'center' }}>
            <p style={{ color:'#94a3b8', fontSize:10 }}>ÇEŞİT</p>
            <p style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{stats.cesit}</p>
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ color:'#94a3b8', fontSize:10 }}>TOPLAM</p>
            <p style={{ color:'#10b981', fontWeight:700, fontSize:15 }}>{stats.adet.toLocaleString()}</p>
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
            {/* HVZ Havuz toggle */}
            <button onClick={() => { const n=!hvzMode; setHvzMode(n); if(n){setRaf(null);setKat(null);loadHvz();} }}
              style={{ ...S.btn, width:'100%', marginBottom:12, fontSize:14,
                background: hvzMode?'#c2410c':'#fff7ed', color: hvzMode?'#fff':'#c2410c',
                border: hvzMode?'none':'1px solid #fed7aa' }}>
              📦 HVZ Havuz {hvzMode?'(Açık)':''}
            </button>

            {hvzMode ? (
              <div style={S.card}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:'#c2410c', textTransform:'uppercase', letterSpacing:1 }}>📦 Havuzdaki Ürünler</p>
                  <button onClick={loadHvz} style={{ background:'#f1f5f9', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer' }}>↻</button>
                </div>
                {hvzLoading ? (
                  <p style={{ color:'#94a3b8', fontSize:13, padding:'20px 0', textAlign:'center' }}>Yükleniyor...</p>
                ) : hvzProds.length === 0 ? (
                  <p style={{ color:'#94a3b8', fontSize:13, padding:'20px 0', textAlign:'center' }}>Havuzda bekleyen ürün yok</p>
                ) : (
                  <>
                    <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>{hvzProds.length} ürün havuzda bekliyor</p>
                    {hvzProds.map((p,i) => (
                      <div key={i} style={{ padding:'9px 0', borderBottom:i<hvzProds.length-1?'1px solid #f1f5f9':'none' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.urunAdi||'—'}</p>
                            <p style={{ fontSize:10, color:'#94a3b8', fontFamily:'monospace' }}>{p.malzemeKodu}{p.malzemeKodu&&p.ean?' · ':''}{p.ean}</p>
                          </div>
                          <span style={{ fontSize:13, fontWeight:800, color:'#c2410c', flexShrink:0 }}>{p.miktar} adet</span>
                          {isAdmin && (
                            <button onClick={() => { setHvzTransfer(p); setHvzTargetLok(''); setHvzTransferAdet(String(p.miktar)); }}
                              style={{ background:'#1e40af', border:'none', borderRadius:8, color:'#fff', padding:'6px 11px', fontSize:11, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                              → Lokasyona Taşı
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
            <>
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
            <div style={S.card}>
              <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10,
                textTransform:'uppercase', letterSpacing:1 }}>
                Raf {raf ? `— Seçili: ${raf}` : `(${getRafRange(koridor).start}-${getRafRange(koridor).end})`}
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:5,
                maxHeight:200, overflowY:'auto' }}>
                {getRafList(koridor).map(n => (
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
            {rafKod && (
              <div style={S.card}>
                <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:2,
                  textTransform:'uppercase', letterSpacing:1 }}>📍 {rafKod}</p>
                {rafLoading ? (
                  <p style={{ color:'#94a3b8', fontSize:13, padding:'20px 0', textAlign:'center' }}>Yükleniyor...</p>
                ) : rafProds.length === 0 ? (
                  <p style={{ color:'#94a3b8', fontSize:13, padding:'20px 0', textAlign:'center' }}>Bu rafta ürün bulunamadı</p>
                ) : (
                  <>
                    <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>{rafProds.length} ürün</p>
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
          </>
        )}

        {/* ── ÜRÜN ARA ── */}
        {tab==='Ürün Ara' && (
          <div style={S.card}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input style={{ ...S.input, flex:1 }} placeholder="EAN, malzeme kodu veya ürün adı..."
                value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus />
              <button onClick={() => searchCamOn ? stopSearchCam() : startSearchCam()}
                style={{ ...S.btn, background:searchCamOn?'#ef4444':'#1e40af', color:'#fff', whiteSpace:'nowrap', padding:'10px 12px' }}>
                {searchCamOn ? 'Durdur' : '📷 Tara'}
              </button>
            </div>
            {searchCamOn && (
              <div style={{ marginTop:10, borderRadius:12, overflow:'hidden', background:'#000', position:'relative' }}>
                <video ref={searchVideoRef}
                  style={{ width:'100%', height:'min(42vh,260px)', objectFit:'cover', display:'block', background:'#000' }}
                  playsInline muted autoPlay />
                {searchCamMsg && (
                  <div style={{ position:'absolute', left:10, top:10, background:'rgba(15,23,42,.75)', color:'#fff', borderRadius:8, padding:'5px 8px', fontSize:11, fontWeight:700 }}>
                    {searchCamMsg}
                  </div>
                )}
                <p style={{ fontSize:11, color:'#64748b', background:'#f8fafc', padding:'7px 10px' }}>
                  Barkod okutulunca arama otomatik yapılır.
                </p>
              </div>
            )}
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

        {/* ── HAREKETLER ── */}
        {tab==='Hareketler' && (
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:1 }}>
                Son 100 Hareket
              </p>
              <button onClick={loadHareketler} style={{ ...S.btn, padding:'6px 12px', background:'#f1f5f9', color:'#64748b', fontSize:12 }}>↻ Yenile</button>
            </div>
            {hareketLoading ? (
              <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'20px 0' }}>Yükleniyor...</p>
            ) : hareketler.length===0 ? (
              <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'20px 0' }}>Henüz hareket yok</p>
            ) : (
              hareketler.map((h,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ background: tipColor[h.tip]||'#94a3b8', color:'#fff', borderRadius:6,
                    padding:'2px 8px', fontSize:11, fontWeight:700, flexShrink:0, whiteSpace:'nowrap' }}>
                    {tipLabel[h.tip]||h.tip}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:600, color:'#1e293b',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {h.urunAdi||h.ean}
                    </p>
                    <p style={{ fontSize:10, color:'#94a3b8' }}>
                      {h.yapan} · {h.tarih?.toDate?.()?.toLocaleDateString('tr-TR')}
                      {h.lokasyon && <span style={{ marginLeft:6, color:'#3b82f6', fontWeight:600 }}>📍{h.lokasyon}</span>}
                      {h.kaynak && <span style={{ marginLeft:6 }}>· {h.kaynak.replace('irsaliye:','İrsaliye: ')}</span>}
                    </p>
                    {h.malzemeKodu && (
                      <p style={{ fontSize:10, color:'#cbd5e1', fontFamily:'monospace' }}>{h.malzemeKodu}</p>
                    )}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, color: (h.miktar||0)>=0?'#10b981':'#ef4444' }}>
                      {(h.miktar||0)>0?'+':''}{h.miktar}
                    </p>
                    <p style={{ fontSize:10, color:'#94a3b8' }}>{h.oncekiMiktar}→{h.sonrakiMiktar}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── YÖNET ── */}
        {tab==='Yönet' && isAdmin && (
          <>
            {/* Kök Stok */}
            <div style={S.card}>
              <p style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:4 }}>📥 Kök Stok Yükle</p>
              <p style={{ fontSize:12, color:'#ef4444', marginBottom:6 }}>⚠️ Tüm stok verisi sıfırlanır</p>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>
                Format: EAN Kodu, Malzeme Kodu, Ürün Adı, Miktar, Lokasyon (opsiyonel)
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
              <p style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:4 }}>📦 Sevkiyat Ekle (Excel)</p>
              <p style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>Mevcut stoğun üstüne eklenir.</p>
              {!sevkiyatPreview ? (
                <label style={{ ...S.btn, background:'#10b981', color:'#fff',
                  display:'inline-block', cursor:'pointer', opacity:impLoading?0.6:1 }}>
                  {impLoading ? 'Yükleniyor...' : '📂 Excel Seç'}
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }}
                    disabled={impLoading}
                    onChange={e => { if(e.target.files[0]) importSevkiyat(e.target.files[0]); e.target.value=''; }} />
                </label>
              ) : (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <p style={{ fontSize:12, fontWeight:700, color:'#10b981' }}>✅ {sevkiyatPreview.items.length} ürün</p>
                    <button onClick={() => setSevkiyatPreview(null)}
                      style={{ ...S.btn, padding:'5px 10px', fontSize:12, background:'#fee2e2', color:'#ef4444' }}>İptal</button>
                  </div>
                  <div style={{ background:'#f0fdf4', borderRadius:10, padding:'10px 12px', marginBottom:10, border:'1px solid #bbf7d0' }}>
                    <p style={{ fontSize:11, fontWeight:700, color:'#15803d', marginBottom:6 }}>Tümüne aynı lokasyon:</p>
                    <input placeholder="Örn: A109S013B" style={{ ...S.input, fontFamily:'monospace' }}
                      onChange={e => {
                        const lok = e.target.value.trim().toUpperCase();
                        if (!lok) return;
                        setSevkiyatPreview(prev => ({
                          ...prev,
                          lokasyonlar: Object.fromEntries(prev.items.map(i => [i.ean, lok]))
                        }));
                      }} />
                  </div>
                  {sevkiyatPreview.items.map((item, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:12, fontWeight:600, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {item.urunAdi||item.ean}
                        </p>
                        <p style={{ fontSize:10, color:'#94a3b8' }}>{item.miktar} adet eklenecek</p>
                      </div>
                      <input placeholder="Lokasyon"
                        value={sevkiyatPreview.lokasyonlar[item.ean]||''}
                        onChange={e => setSevkiyatPreview(prev => ({
                          ...prev,
                          lokasyonlar: { ...prev.lokasyonlar, [item.ean]: e.target.value.trim().toUpperCase() }
                        }))}
                        style={{ width:110, padding:'5px 8px', border:'1px solid #e2e8f0',
                          borderRadius:7, fontSize:11, fontFamily:'monospace', outline:'none',
                          background: sevkiyatPreview.lokasyonlar[item.ean]?'#f0fdf4':'#fff' }} />
                    </div>
                  ))}
                  <button onClick={saveSevkiyatWithLok} disabled={impLoading}
                    style={{ ...S.btn, width:'100%', marginTop:10, background:'#10b981', color:'#fff', opacity:impLoading?0.6:1 }}>
                    {impLoading ? 'Kaydediliyor...' : '✅ Lokasyonlarla Kaydet'}
                  </button>
                </div>
              )}
            </div>

            {/* Manuel */}
            <div style={S.card}>
              <p style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:10 }}>✍️ Manuel Stok Hareketi</p>
              <div style={{ display:'flex', gap:6, marginBottom:12, background:'#f1f5f9', borderRadius:10, padding:4 }}>
                {[['giris','📥 Giriş','#10b981'],['cikis','📤 Çıkış','#ef4444']].map(([tip,lbl,clr])=>(
                  <button key={tip} onClick={()=>setManualTip(tip)}
                    style={{ flex:1, border:'none', borderRadius:8, padding:'8px 0', fontSize:13,
                      fontWeight:700, cursor:'pointer',
                      background: manualTip===tip ? clr : 'transparent',
                      color: manualTip===tip ? '#fff' : '#64748b' }}>
                    {lbl}
                  </button>
                ))}
              </div>
              <input style={{ ...S.input, marginBottom:10 }}
                placeholder="EAN veya malzeme kodu (tam girin)"
                value={manualQuery}
                onChange={e => { setManualQuery(e.target.value); lookupManual(e.target.value); }} />
              {manualProd && (
                <div style={{ background:'#f8fafc', borderRadius:10, padding:'10px 12px' }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'#1e293b' }}>{manualProd.urunAdi}</p>
                  <p style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace', marginBottom:4 }}>
                    {manualProd.malzemeKodu} · {manualProd.ean}
                  </p>
                  <p style={{ fontSize:12, color:'#64748b', marginBottom:10 }}>
                    Toplam stok: <strong>{manualProd.currentMiktar}</strong> adet
                  </p>
                  <p style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Lokasyon</p>
                  <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                    <div style={{ flex:1, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 12px',
                      fontSize:13, fontFamily:'monospace', color: manualLok ? '#1e293b' : '#94a3b8', fontWeight:600 }}>
                      {manualLok || 'Lokasyon seçilmedi'}
                    </div>
                    <button onClick={()=>setShowLokPicker(p=>!p)}
                      style={{ ...S.btn, padding:'8px 12px', fontSize:12, background:'#e2e8f0', color:'#475569' }}>
                      {showLokPicker ? '▲ Kapat' : '▼ Seç'}
                    </button>
                    {manualLok && (
                      <button onClick={()=>setManualLok('')}
                        style={{ ...S.btn, padding:'8px 10px', fontSize:12, background:'#fee2e2', color:'#ef4444' }}>✕</button>
                    )}
                  </div>
                  {showLokPicker && (
                    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:12, marginBottom:10 }}>
                      <p style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>KORİDOR</p>
                      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                        {['109','110'].map(k=>(
                          <button key={k} onClick={()=>{ setLokKoridor(k); setLokRaf(null); setLokKat(null); setManualLok(''); }}
                            style={{ flex:1, border:'none', borderRadius:8, padding:'7px 0', fontSize:13,
                              fontWeight:700, cursor:'pointer',
                              background: lokKoridor===k?'#1e40af':'#f1f5f9',
                              color: lokKoridor===k?'#fff':'#475569' }}>
                            {k}
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>
                        RAF {lokRaf?`— ${lokRaf}`:`(${getRafRange(lokKoridor).start}-${getRafRange(lokKoridor).end})`}
                      </p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:4, maxHeight:160, overflowY:'auto', marginBottom:10 }}>
                        {getRafList(lokKoridor).map(n=>(
                          <button key={n} onClick={()=>{ setLokRaf(n); setLokKat(null); setManualLok(''); }}
                            style={{ padding:'5px 0', border:'none', borderRadius:5, fontSize:11,
                              fontWeight:600, cursor:'pointer',
                              background: lokRaf===n?'#1e40af':'#f1f5f9',
                              color: lokRaf===n?'#fff':'#475569' }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      {lokRaf && (
                        <>
                          <p style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>KAT</p>
                          <div style={{ display:'flex', gap:6 }}>
                            {['A','B','C','D','E','F'].map(k=>(
                              <button key={k} onClick={()=>{
                                setLokKat(k);
                                const kod = `A${lokKoridor}S${String(lokRaf).padStart(3,'0')}${k}`;
                                setManualLok(kod); setShowLokPicker(false);
                              }}
                                style={{ flex:1, border:'none', borderRadius:8, padding:'7px 0', fontSize:13,
                                  fontWeight:700, cursor:'pointer',
                                  background: lokKat===k?'#1e40af':'#f1f5f9',
                                  color: lokKat===k?'#fff':'#475569' }}>
                                {k}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {manualProd.byLocation && Object.keys(manualProd.byLocation).length>0 && (
                    <div style={{ marginBottom:10, fontSize:11, color:'#64748b', background:'#fff',
                      borderRadius:8, padding:'6px 10px', border:'1px solid #e2e8f0' }}>
                      {Object.entries(manualProd.byLocation).filter(([,m])=>m>0).map(([l,m])=>(
                        <span key={l} style={{ marginRight:10, cursor:'pointer',
                          color: manualLok===l?'#1e40af':'#64748b',
                          fontWeight: manualLok===l?700:400 }}
                          onClick={()=>{ setManualLok(l); setShowLokPicker(false); }}>
                          📍{l}: {m}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <input type="number" style={{ ...S.input, flex:1 }}
                      placeholder={manualTip==='giris'?'Eklenecek miktar':'Çıkarılacak miktar'}
                      value={manualMiktar} onChange={e => setManualMiktar(e.target.value)} />
                    <button onClick={addManualStock} disabled={manualLoading}
                      style={{ ...S.btn, flexShrink:0,
                        background: manualTip==='giris'?'#10b981':'#ef4444',
                        color:'#fff', opacity:manualLoading?0.6:1 }}>
                      {manualLoading ? '...' : manualTip==='giris' ? 'Ekle' : 'Çıkar'}
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
            <p style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>{adjustProd.urunAdi||adjustProd.ean}</p>
            <input type="number" style={{ ...S.input, marginBottom:12 }}
              placeholder="Yeni stok miktarı" value={adjustMiktar}
              onChange={e => setAdjustMiktar(e.target.value)} autoFocus />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setAdjustProd(null)}
                style={{ ...S.btn, flex:1, background:'#f1f5f9', color:'#64748b' }}>İptal</button>
              <button onClick={saveAdjust}
                style={{ ...S.btn, flex:1, background:'#1e40af', color:'#fff' }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {hvzTransfer && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24,
            width:'calc(100% - 48px)', maxWidth:380 }}>
            <p style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>📦 HVZ → Lokasyona Taşı</p>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>{hvzTransfer.urunAdi||hvzTransfer.ean}</p>
            <p style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace', marginBottom:16 }}>Havuzda: {hvzTransfer.miktar} adet</p>
            <p style={{ fontSize:11, fontWeight:600, color:'#475569', marginBottom:5 }}>Taşınacak adet</p>
            <input type="number" style={{ ...S.input, marginBottom:12 }}
              placeholder={`Max ${hvzTransfer.miktar}`} value={hvzTransferAdet}
              onChange={e => setHvzTransferAdet(e.target.value)} />
            <p style={{ fontSize:11, fontWeight:600, color:'#475569', marginBottom:5 }}>Hedef lokasyon</p>
            <input style={{ ...S.input, marginBottom:16, fontFamily:'monospace' }}
              placeholder="A109S013B" value={hvzTargetLok}
              onChange={e => setHvzTargetLok(e.target.value.toUpperCase())} autoFocus />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setHvzTransfer(null)}
                style={{ ...S.btn, flex:1, background:'#f1f5f9', color:'#64748b' }}>İptal</button>
              <button onClick={hvzLokasyonaTasi}
                style={{ ...S.btn, flex:1, background:'#1e40af', color:'#fff' }}>Taşı →</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}
