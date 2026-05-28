import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

function Toast({ msg, type, onDone }) {
  const bg = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  setTimeout(onDone, 3500);
  return (
    <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:700,zIndex:9999,maxWidth:'90vw',textAlign:'center',boxShadow:'0 4px 16px rgba(0,0,0,.2)'}}>
      {msg}
    </div>
  );
}

const FORMAT_TYPES = {
  urun: {
    title: 'Ürün Listesi Formatla',
    desc: 'Yönetici Paneli > Ürünler için uygun ürün import dosyası oluşturur.',
    fileName: 'urun-import-formatli.xlsx',
    columns: ['EAN Kodu', 'Malzeme Kodu', 'Ürün Adı', 'Birim', 'Lokasyon'],
    required: ['ean', 'malzemeKodu', 'urunAdi'],
  },
  kokStok: {
    title: 'Kök Stok Formatla',
    desc: 'Stok > Yönet > Kök Stok Yükle için uygun stok dosyası oluşturur.',
    fileName: 'kok-stok-formatli.xlsx',
    columns: ['EAN Kodu', 'Malzeme Kodu', 'Ürün Adı', 'Miktar', 'Lokasyon'],
    required: ['ean', 'miktar'],
  },
  malKabul: {
    title: 'Mal Kabul Referansı Formatla',
    desc: 'Mal Kabul > Referanslı sayım için uygun referans dosyası oluşturur.',
    fileName: 'mal-kabul-referans-formatli.xlsx',
    columns: ['Malzeme Kodu', 'EAN', 'Ürün Adı', 'Adet'],
    required: ['adet'],
  },
  depoSayim: {
    title: 'Depo Sayımı Referansı Formatla',
    desc: 'Sayım > Referanslı Sayım için lokasyon bazlı referans dosyası oluşturur.',
    fileName: 'depo-sayimi-referans-formatli.xlsx',
    columns: ['Lokasyon', 'EAN', 'Malzeme Kodu', 'Ürün Adı', 'Beklenen Adet'],
    required: ['lokasyon', 'ean', 'adet'],
  },
  kargoTakip: {
    title: 'Kargo Takip Listesi Formatla',
    desc: 'Yurtiçi Kargo takip listesini Raporlar tarafında kullanılabilecek temiz formata çevirir.',
    fileName: 'kargo-takip-formatli.xlsx',
    columns: ['Sipariş No', 'Kargo Takip No', 'Kargo Firması', 'Tarih'],
    required: ['takipNo'],
  },
};

const ALIASES = {
  ean: ['ean', 'ean kodu', 'barkod', 'barcode', 'barkod no', 'ürün barkodu', 'urun barkodu'],
  malzemeKodu: ['malzeme kodu', 'malzeme', 'stok kodu', 'ürün kodu', 'urun kodu', 'item code', 'item', 'sku', 'elis kodu', 'kod'],
  urunAdi: ['ürün adı', 'urun adi', 'ürün ad', 'urun ad', 'açıklama', 'aciklama', 'description', 'sistem tanımı', 'sistem tanimi', 'ürün açıklaması', 'urun aciklamasi'],
  birim: ['birim', 'unit'],
  lokasyon: ['lokasyon', 'location', 'raf', 'adres', 'stok yeri', 'depo lokasyon'],
  miktar: ['miktar', 'adet', 'qty', 'quantity', 'kullanılabilir miktar', 'kullanilabilir miktar', 'stok miktarı', 'stok miktari', 'mevcut'],
  adet: ['adet', 'miktar', 'qty', 'quantity', 'toplam', 'beklenen adet', 'sipariş miktarı', 'siparis miktari'],
  siparisNo: ['sipariş no', 'siparis no', 'sipariş numarası', 'siparis numarasi', 'order no', 'order id', 'referans no', 'alıcı referans no', 'alici referans no', 'müşteri referans no', 'musteri referans no', 'irsaliye no', 'fatura no'],
  takipNo: ['kargo takip no', 'takip no', 'takip numarası', 'takip numarasi', 'gönderi kodu', 'gonderi kodu', 'gönderi no', 'gonderi no', 'barkod no', 'kargo barkod', 'tracking no', 'tracking number'],
  kargoFirmasi: ['kargo firması', 'kargo firmasi', 'firma', 'taşıyıcı', 'tasiyici', 'carrier'],
  tarih: ['tarih', 'çıkış tarihi', 'cikis tarihi', 'gönderi tarihi', 'gonderi tarihi', 'date'],
};

const normalizeHeader = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[ı]/g, 'i')
  .replace(/[İ]/g, 'i')
  .replace(/[ğ]/g, 'g')
  .replace(/[ü]/g, 'u')
  .replace(/[ş]/g, 's')
  .replace(/[ö]/g, 'o')
  .replace(/[ç]/g, 'c')
  .replace(/\s+/g, ' ')
  .trim();

const clean = (value) => String(value ?? '').trim();
const cleanUpper = (value) => clean(value).toUpperCase();
const digitsOnly = (value) => clean(value).replace(/\.0$/, '').replace(/\s+/g, '');
const toInt = (value) => {
  if (typeof value === 'number') return Math.round(value) || 0;
  const s = clean(value).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

function findHeader(rows) {
  let best = { idx: 0, score: 0, map: {} };
  const keys = Object.keys(ALIASES);

  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const map = {};
    let score = 0;
    const cells = rows[r].map(normalizeHeader);

    cells.forEach((cell, colIdx) => {
      keys.forEach(key => {
        if (map[key] !== undefined) return;
        const aliases = ALIASES[key].map(normalizeHeader);
        if (aliases.some(a => cell === a || cell.includes(a))) {
          map[key] = colIdx;
          score += 1;
        }
      });
    });

    if (score > best.score) best = { idx: r, score, map };
  }

  return best;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => {
      try {
        const wb = XLSX.read(new Uint8Array(result), { type:'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
        resolve(rows);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function buildOutput(type, rows) {
  const header = findHeader(rows);
  const map = header.map;
  const valid = [];
  const errors = [];
  const grouped = new Map();

  const addError = (rowNo, reason, rawRow) => {
    errors.push({ Satır: rowNo, Hata: reason, Veri: rawRow.map(v => clean(v)).join(' | ') });
  };

  const get = (row, key) => map[key] !== undefined ? row[map[key]] : '';

  rows.slice(header.idx + 1).forEach((row, index) => {
    const rowNo = header.idx + index + 2;
    const nonEmpty = row.some(cell => clean(cell));
    if (!nonEmpty) return;

    if (type === 'urun') {
      const ean = digitsOnly(get(row, 'ean'));
      const malzemeKodu = clean(get(row, 'malzemeKodu'));
      const urunAdi = clean(get(row, 'urunAdi'));
      const birim = clean(get(row, 'birim')) || 'Adet';
      const lokasyon = cleanUpper(get(row, 'lokasyon')) || 'BELIRLENECEK';
      const missing = [];
      if (!ean) missing.push('EAN');
      if (!malzemeKodu) missing.push('Malzeme Kodu');
      if (!urunAdi) missing.push('Ürün Adı');
      if (missing.length) return addError(rowNo, `Eksik alan: ${missing.join(', ')}`, row);
      valid.push([ean, malzemeKodu, urunAdi, birim, lokasyon]);
      return;
    }

    if (type === 'kokStok') {
      const ean = digitsOnly(get(row, 'ean'));
      const malzemeKodu = clean(get(row, 'malzemeKodu'));
      const urunAdi = clean(get(row, 'urunAdi'));
      const miktar = toInt(get(row, 'miktar'));
      const lokasyon = cleanUpper(get(row, 'lokasyon'));
      const missing = [];
      if (!ean) missing.push('EAN');
      if (miktar <= 0) missing.push('Miktar');
      if (missing.length) return addError(rowNo, `Eksik/geçersiz alan: ${missing.join(', ')}`, row);

      const key = `${ean}__${lokasyon || ''}`;
      const prev = grouped.get(key) || { ean, malzemeKodu, urunAdi, miktar:0, lokasyon };
      prev.miktar += miktar;
      if (!prev.malzemeKodu && malzemeKodu) prev.malzemeKodu = malzemeKodu;
      if (!prev.urunAdi && urunAdi) prev.urunAdi = urunAdi;
      grouped.set(key, prev);
      return;
    }

    if (type === 'malKabul') {
      const malzemeKodu = clean(get(row, 'malzemeKodu'));
      const ean = digitsOnly(get(row, 'ean'));
      const urunAdi = clean(get(row, 'urunAdi'));
      const adet = toInt(get(row, 'adet'));
      if (!ean && !malzemeKodu) return addError(rowNo, 'EAN veya Malzeme Kodu zorunlu', row);
      if (adet <= 0) return addError(rowNo, 'Adet eksik/geçersiz', row);

      const key = ean || malzemeKodu;
      const prev = grouped.get(key) || { malzemeKodu, ean, urunAdi, adet:0 };
      prev.adet += adet;
      if (!prev.malzemeKodu && malzemeKodu) prev.malzemeKodu = malzemeKodu;
      if (!prev.ean && ean) prev.ean = ean;
      if (!prev.urunAdi && urunAdi) prev.urunAdi = urunAdi;
      grouped.set(key, prev);
      return;
    }

    if (type === 'depoSayim') {
      const lokasyon = cleanUpper(get(row, 'lokasyon'));
      const ean = digitsOnly(get(row, 'ean'));
      const malzemeKodu = clean(get(row, 'malzemeKodu'));
      const urunAdi = clean(get(row, 'urunAdi'));
      const adet = toInt(get(row, 'adet'));
      const missing = [];
      if (!lokasyon) missing.push('Lokasyon');
      if (!ean) missing.push('EAN');
      if (adet <= 0) missing.push('Beklenen Adet');
      if (missing.length) return addError(rowNo, `Eksik/geçersiz alan: ${missing.join(', ')}`, row);

      const key = `${lokasyon}__${ean}`;
      const prev = grouped.get(key) || { lokasyon, ean, malzemeKodu, urunAdi, adet:0 };
      prev.adet += adet;
      if (!prev.malzemeKodu && malzemeKodu) prev.malzemeKodu = malzemeKodu;
      if (!prev.urunAdi && urunAdi) prev.urunAdi = urunAdi;
      grouped.set(key, prev);
      return;
    }

    if (type === 'kargoTakip') {
      const siparisNo = clean(get(row, 'siparisNo'));
      const takipNo = clean(get(row, 'takipNo'));
      const kargoFirmasi = clean(get(row, 'kargoFirmasi')) || 'Yurtiçi Kargo';
      const tarih = clean(get(row, 'tarih'));
      if (!takipNo) return addError(rowNo, 'Kargo Takip No eksik', row);
      valid.push([siparisNo, takipNo, kargoFirmasi, tarih]);
      return;
    }
  });

  if (type === 'kokStok') {
    grouped.forEach(item => valid.push([item.ean, item.malzemeKodu, item.urunAdi, item.miktar, item.lokasyon]));
  }
  if (type === 'malKabul') {
    grouped.forEach(item => valid.push([item.malzemeKodu, item.ean, item.urunAdi, item.adet]));
  }
  if (type === 'depoSayim') {
    grouped.forEach(item => valid.push([item.lokasyon, item.ean, item.malzemeKodu, item.urunAdi, item.adet]));
  }

  return { valid, errors, headerInfo: header };
}

function downloadWorkbook(type, valid, errors) {
  const cfg = FORMAT_TYPES[type];
  const wb = XLSX.utils.book_new();
  const readySheet = XLSX.utils.aoa_to_sheet([cfg.columns, ...valid]);
  XLSX.utils.book_append_sheet(wb, readySheet, 'Hazır Format');

  const errorRows = errors.length
    ? errors.map(e => [e.Satır, e.Hata, e.Veri])
    : [['', 'Hata yok', '']];
  const errorSheet = XLSX.utils.aoa_to_sheet([['Satır', 'Hata', 'Orijinal Veri'], ...errorRows]);
  XLSX.utils.book_append_sheet(wb, errorSheet, 'Hatalı Satırlar');

  const infoSheet = XLSX.utils.aoa_to_sheet([
    ['Format Türü', cfg.title],
    ['Oluşturma Notu', 'Bu dosya Depo Kontrol uygulamasına yüklenebilir formata çevrilmiştir.'],
    ['Hatalı satırlar', errors.length],
    ['Hazır satırlar', valid.length],
  ]);
  XLSX.utils.book_append_sheet(wb, infoSheet, 'Özet');
  XLSX.writeFile(wb, cfg.fileName);
}

export default function DosyaAraclari() {
  const [type, setType] = useState('urun');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast$ = (msg, type = 'info') => setToast({ msg, type, id: Date.now() });

  const cfg = FORMAT_TYPES[type];
  const formatList = useMemo(() => Object.entries(FORMAT_TYPES), []);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setLoading(true);
    try {
      const rows = await readFile(file);
      const output = buildOutput(type, rows);
      setResult(output);
      toast$(`${output.valid.length} satır hazırlandı, ${output.errors.length} hatalı satır bulundu`, output.errors.length ? 'warning' : 'success');
    } catch (e) {
      toast$('Dosya okunamadı: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const S = {
    card:{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid #e2e8f0',marginBottom:12},
    btn:{border:'none',borderRadius:10,padding:'10px 16px',fontSize:13,fontWeight:700,cursor:'pointer'},
    input:{width:'100%',padding:'10px 14px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,outline:'none',boxSizing:'border-box'},
  };

  return (
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <p style={{color:'#fff',fontWeight:800,fontSize:16}}>🧩 Dosya Araçları</p>
      </div>

      <div style={{padding:16,maxWidth:860,margin:'0 auto'}}>
        <div style={S.card}>
          <p style={{fontSize:14,fontWeight:800,color:'#0f172a',marginBottom:6}}>Format türü seç</p>
          <p style={{fontSize:12,color:'#64748b',marginBottom:12}}>Dosyanı yükle, sistem uygun kolonları bulup temiz Excel çıktısı oluştursun.</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8}}>
            {formatList.map(([key, item]) => (
              <button key={key} onClick={()=>{setType(key);setResult(null);setFileName('');}}
                style={{textAlign:'left',border:'1px solid '+(type===key?'#3b82f6':'#e2e8f0'),borderRadius:12,padding:'12px',background:type===key?'#eff6ff':'#fff',cursor:'pointer'}}>
                <p style={{fontSize:13,fontWeight:800,color:type===key?'#1d4ed8':'#1e293b'}}>{item.title}</p>
                <p style={{fontSize:11,color:'#64748b',marginTop:3,lineHeight:1.35}}>{item.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div style={S.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:12}}>
            <div>
              <p style={{fontSize:14,fontWeight:800,color:'#0f172a'}}>{cfg.title}</p>
              <p style={{fontSize:12,color:'#64748b',marginTop:4}}>Çıktı kolonları: <b>{cfg.columns.join(' · ')}</b></p>
            </div>
            <label style={{...S.btn,background:'#1e40af',color:'#fff',display:'inline-block',whiteSpace:'nowrap'}}>
              📂 Dosya Seç
              <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{handleFile(e.target.files?.[0]); e.target.value='';}} />
            </label>
          </div>
          {fileName && <p style={{fontSize:12,color:'#64748b',marginBottom:8}}>Seçilen dosya: <b>{fileName}</b></p>}
          {loading && <p style={{fontSize:13,color:'#3b82f6',fontWeight:700}}>Dosya işleniyor...</p>}
        </div>

        {result && (
          <>
            <div style={{...S.card,background:result.errors.length?'#fffbeb':'#f0fdf4',border:'1px solid '+(result.errors.length?'#fde68a':'#bbf7d0')}}>
              <p style={{fontSize:13,fontWeight:800,color:result.errors.length?'#92400e':'#15803d'}}>Özet</p>
              <p style={{fontSize:12,color:result.errors.length?'#92400e':'#166534',marginTop:5}}>
                Hazır satır: <b>{result.valid.length}</b> · Hatalı satır: <b>{result.errors.length}</b>
              </p>
              {result.valid.length===0 && result.errors.length>0 && (
                <p style={{fontSize:11,color:'#92400e',marginTop:6}}>
                  Hazır satır oluşmadı ama dosyayı indirebilirsin. Hatalar Excel içindeki “Hatalı Satırlar” sheet’inde yer alır.
                </p>
              )}
              <button onClick={()=>downloadWorkbook(type, result.valid, result.errors)}
                style={{...S.btn,marginTop:12,background:'#10b981',color:'#fff'}}>
                ⬇️ Formatlı Excel İndir
              </button>
            </div>

            {result.valid.length>0 && (
              <div style={S.card}>
                <p style={{fontSize:13,fontWeight:800,color:'#0f172a',marginBottom:8}}>Önizleme</p>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr>{cfg.columns.map(c=><th key={c} style={{textAlign:'left',padding:'8px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',color:'#475569'}}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {result.valid.slice(0,8).map((row,i)=>(
                        <tr key={i}>{row.map((cell,j)=><td key={j} style={{padding:'8px',borderBottom:'1px solid #f1f5f9',color:'#1e293b'}}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  {result.valid.length>8 && <p style={{fontSize:11,color:'#94a3b8',paddingTop:8}}>İlk 8 satır gösteriliyor.</p>}
                </div>
              </div>
            )}

            {result.errors.length>0 && (
              <div style={S.card}>
                <p style={{fontSize:13,fontWeight:800,color:'#b45309',marginBottom:8}}>Hatalı Satırlar</p>
                {result.errors.slice(0,8).map((err,i)=>(
                  <div key={i} style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 10px',marginBottom:6}}>
                    <p style={{fontSize:12,fontWeight:800,color:'#92400e'}}>Satır {err.Satır}: {err.Hata}</p>
                    <p style={{fontSize:10,color:'#92400e',fontFamily:'monospace',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{err.Veri}</p>
                  </div>
                ))}
                {result.errors.length>8 && <p style={{fontSize:11,color:'#94a3b8'}}>Tüm hatalar indirilen Excel'deki “Hatalı Satırlar” sheet'inde yer alır.</p>}
              </div>
            )}
          </>
        )}
      </div>

      {toast && <Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}
