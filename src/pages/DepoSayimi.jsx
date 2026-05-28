import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as XLSX from 'xlsx';

function Toast({ msg, type, onDone }) {
  const bg = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: bg[type] || '#334155',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: 16,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 9999,
        maxWidth: '90vw',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,.2)',
      }}
    >
      {msg}
    </div>
  );
}

const RAF_LIMITS = {
  '109': { start: 13, end: 117 },
  '110': { start: 14, end: 117 },
};

const S = {
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: '14px 16px',
    border: '1px solid #e2e8f0',
    marginBottom: 12,
  },
  btn: {
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

const norm = (v) => String(v ?? '').trim();
const normUpper = (v) => norm(v).toUpperCase();
const safeNumber = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
const productKey = (ean) => norm(ean);
const diffClass = (expected, counted, unexpected = false) => {
  if (unexpected) return { label: 'Beklenmeyen', bg: '#fee2e2', color: '#dc2626' };
  if (counted === 0 && expected > 0) return { label: 'Okutulmadı', bg: '#fef3c7', color: '#d97706' };
  if (counted < expected) return { label: 'Eksik', bg: '#fef3c7', color: '#d97706' };
  if (counted > expected) return { label: 'Fazla', bg: '#fee2e2', color: '#dc2626' };
  return { label: 'Tamam', bg: '#dcfce7', color: '#15803d' };
};

const getRafRange = (koridor) => RAF_LIMITS[koridor] || RAF_LIMITS['109'];
const getRafList = (koridor) => {
  const { start, end } = getRafRange(koridor);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};
const isValidRaf = (koridor, rafNo) => {
  const { start, end } = getRafRange(koridor);
  return rafNo >= start && rafNo <= end;
};
const isValidLokasyon = (value) => {
  const m = normUpper(value).match(/^A?(109|110)S?(\d{2,3})([A-F])$/);
  if (!m) return false;
  return isValidRaf(m[1], parseInt(m[2], 10));
};
const normalizeLokasyon = (value) => {
  const m = normUpper(value).match(/^A?(109|110)S?(\d{2,3})([A-F])$/);
  if (!m) return '';
  const rafNo = parseInt(m[2], 10);
  if (!isValidRaf(m[1], rafNo)) return '';
  return `A${m[1]}S${String(rafNo).padStart(3, '0')}${m[3]}`;
};

/* ── LOKASYON SEÇİCİ ── */
function LokPicker({ onSelect, currentLok, allowedLokasyonlar = null }) {
  const [search, setSearch] = useState('');
  const [kor, setKor] = useState(currentLok ? currentLok.slice(1, 4) : '109');
  const [raf, setRaf] = useState(currentLok ? parseInt(currentLok.slice(5, 8), 10) : null);
  const [kat, setKat] = useState(currentLok ? currentLok.slice(8) : null);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detRef = useRef(null);
  const rafAnimRef = useRef(null);

  const KATS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const curLok = raf && kat ? `A${kor}S${String(raf).padStart(3, '0')}${kat}` : null;
  const allowedSet = allowedLokasyonlar ? new Set(allowedLokasyonlar) : null;
  const allowedForCurrent = !curLok || !allowedSet || allowedSet.has(curLok);

  const stopCam = useCallback(() => {
    if (rafAnimRef.current) cancelAnimationFrame(rafAnimRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  const scanLok = useCallback(() => {
    if (!videoRef.current || !detRef.current) return;
    detRef.current
      .detect(videoRef.current)
      .then((res) => {
        if (res.length > 0) {
          const lok = normalizeLokasyon(res[0].rawValue);
          if (lok && (!allowedSet || allowedSet.has(lok))) {
            setKor(lok.slice(1, 4));
            setRaf(parseInt(lok.slice(5, 8), 10));
            setKat(lok.slice(8));
            stopCam();
          }
        }
        rafAnimRef.current = requestAnimationFrame(scanLok);
      })
      .catch(() => {
        rafAnimRef.current = requestAnimationFrame(scanLok);
      });
  }, [allowedSet, stopCam]);

  const startCam = async () => {
    try {
      if (!('BarcodeDetector' in window)) {
        alert('Bu tarayıcı kamera barkod okumayı desteklemiyor.');
        return;
      }
      if (!detRef.current) {
        detRef.current = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'qr_code', 'ean_13'],
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
      rafAnimRef.current = requestAnimationFrame(scanLok);
    } catch (e) {
      alert('Kamera açılamadı');
    }
  };

  useEffect(() => () => stopCam(), [stopCam]);

  const navigate = (dir) => {
    if (!raf || !kat) return;
    const katIdx = KATS.indexOf(kat);
    if (dir === 'up' && katIdx < KATS.length - 1) setKat(KATS[katIdx + 1]);
    else if (dir === 'down' && katIdx > 0) setKat(KATS[katIdx - 1]);
    else if (dir === 'right' && raf < getRafRange(kor).end) setRaf(raf + 1);
    else if (dir === 'left' && raf > getRafRange(kor).start) setRaf(raf - 1);
  };

  const handleSearch = (val) => {
    setSearch(val);
    const lok = normalizeLokasyon(val);
    if (lok) {
      setKor(lok.slice(1, 4));
      setRaf(parseInt(lok.slice(5, 8), 10));
      setKat(lok.slice(8));
    }
  };

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Kod yaz (örn: A109S013B)"
          style={{
            flex: 1,
            padding: '9px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={() => (camOn ? stopCam() : startCam())}
          style={{
            background: camOn ? '#ef4444' : '#1e40af',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            padding: '9px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {camOn ? '⏹ Durdur' : '📷 Tara'}
        </button>
      </div>

      {camOn && (
        <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', background: '#000', maxHeight: 180 }}>
          <video ref={videoRef} style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} playsInline muted />
        </div>
      )}

      {allowedLokasyonlar && allowedLokasyonlar.length > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>
            Referans dosyasındaki lokasyonlar
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 90, overflowY: 'auto' }}>
            {allowedLokasyonlar.map((l) => (
              <button
                key={l}
                onClick={() => {
                  setKor(l.slice(1, 4));
                  setRaf(parseInt(l.slice(5, 8), 10));
                  setKat(l.slice(8));
                }}
                style={{
                  border: 'none',
                  borderRadius: 7,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  background: curLok === l ? '#1e40af' : '#eef2ff',
                  color: curLok === l ? '#fff' : '#3730a3',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {curLok && (
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: '#1d4ed8', marginBottom: 8, fontWeight: 600 }}>HIZ NAVİGASYONU</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['left', '← Sol Raf'],
              ['right', 'Sağ Raf →'],
              ['down', '↓ Alt Kat'],
              ['up', '↑ Üst Kat'],
            ].map(([d, l]) => (
              <button
                key={d}
                onClick={() => navigate(d)}
                style={{
                  background: '#fff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  padding: '7px 0',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#1e40af',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Koridor
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['109', '110'].map((k) => (
          <button
            key={k}
            onClick={() => {
              setKor(k);
              setRaf(null);
              setKat(null);
            }}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 10,
              padding: '10px 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: kor === k ? '#1e40af' : '#f1f5f9',
              color: kor === k ? '#fff' : '#475569',
            }}
          >
            {k}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Raf {raf ? `— ${raf}` : `(${getRafRange(kor).start}-${getRafRange(kor).end})`}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 14 }}>
        {getRafList(kor).map((n) => (
          <button
            key={n}
            onClick={() => {
              setRaf(n);
              setKat(null);
            }}
            style={{
              padding: '6px 0',
              border: 'none',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              background: raf === n ? '#1e40af' : '#f1f5f9',
              color: raf === n ? '#fff' : '#475569',
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {raf && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Kat
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {KATS.map((k) => (
              <button
                key={k}
                onClick={() => setKat(k)}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: kat === k ? '#1e40af' : '#f1f5f9',
                  color: kat === k ? '#fff' : '#475569',
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </>
      )}

      {curLok && !allowedForCurrent && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <p style={{ color: '#c2410c', fontSize: 12, fontWeight: 700 }}>
            Bu lokasyon referans dosyasında bulunmuyor.
          </p>
        </div>
      )}

      {curLok && (
        <button
          onClick={() => allowedForCurrent && onSelect(curLok)}
          disabled={!allowedForCurrent}
          style={{
            width: '100%',
            background: allowedForCurrent ? '#1e40af' : '#cbd5e1',
            border: 'none',
            borderRadius: 12,
            padding: '13px 0',
            fontSize: 15,
            fontWeight: 700,
            cursor: allowedForCurrent ? 'pointer' : 'not-allowed',
            color: '#fff',
          }}
        >
          📍 {curLok} — Sayıma Başla →
        </button>
      )}
    </div>
  );
}

/* ── SAYIM EKRANI ── */
function SayimEkrani({
  lokasyon,
  session,
  products,
  expectedItems,
  existingEntry,
  onSave,
  onBack,
}) {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState(() => {
    const m = {};
    (existingEntry?.items || []).forEach((i) => {
      if (i.ean) m[String(i.ean)] = i.adet || 0;
    });
    return m;
  });
  const [hasarlilar, setHasarlilar] = useState(() => {
    const m = {};
    (existingEntry?.items || []).forEach((i) => {
      if (i.ean && i.hasarliAdet) m[String(i.ean)] = i.hasarliAdet || 0;
    });
    return m;
  });
  const [barInput, setBarInput] = useState('');
  const [mode, setMode] = useState('text');
  const [camOn, setCamOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHasar, setShowHasar] = useState(false);
  const [lastScans, setLastScans] = useState([]);
  const [toast, setToast] = useState(null);
  const toast$ = (msg, type = 'info') => setToast({ msg, type, id: Date.now() });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detRef = useRef(null);
  const rafRef = useRef(null);
  const lastBcRef = useRef({ code: '', ts: 0 });

  const expectedMap = useMemo(() => {
    const m = {};
    expectedItems.forEach((item) => {
      if (!item.ean) return;
      m[item.ean] = item;
    });
    return m;
  }, [expectedItems]);

  const expectedKeys = new Set(Object.keys(expectedMap));

  const stopCam = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  const addScan = useCallback((rawCode) => {
    const ean = norm(rawCode);
    if (!ean) return;

    const product = products[ean];

    if (!product) {
      toast$(`Ürün havuzunda bulunamadı: ${ean}`, 'error');
      return;
    }

    setEntries((prev) => ({ ...prev, [ean]: (prev[ean] || 0) + 1 }));
    setLastScans((prev) => [...prev, ean].slice(-50));

    if (!expectedMap[ean]) {
      toast$(`Beklenmeyen ürün: ${product.urunAdi || ean}`, 'warning');
    } else {
      toast$(product.urunAdi || ean, 'success');
    }
  }, [products, expectedMap]);

  const scan = useCallback(() => {
    if (!videoRef.current || !detRef.current) return;
    detRef.current
      .detect(videoRef.current)
      .then((res) => {
        if (res.length > 0) {
          const code = res[0].rawValue;
          const now = Date.now();
          if (code !== lastBcRef.current.code || now - lastBcRef.current.ts > 2000) {
            lastBcRef.current = { code, ts: now };
            addScan(code);
          }
        }
        rafRef.current = requestAnimationFrame(scan);
      })
      .catch(() => {
        rafRef.current = requestAnimationFrame(scan);
      });
  }, [addScan]);

  const startCam = useCallback(async () => {
    try {
      if (!('BarcodeDetector' in window)) {
        toast$('Kamera desteklenmiyor', 'error');
        return;
      }
      if (!detRef.current) {
        detRef.current = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'],
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
      rafRef.current = requestAnimationFrame(scan);
    } catch (e) {
      toast$('Kamera hatası', 'error');
    }
  }, [scan]);

  useEffect(() => () => stopCam(), [stopCam]);

  const handleText = (e) => {
    if (e.key !== 'Enter') return;
    const ean = barInput.trim();
    if (!ean) return;
    addScan(ean);
    setBarInput('');
  };

  const undoLast = () => {
    const last = lastScans[lastScans.length - 1];
    if (!last) {
      toast$('Geri alınacak okutma yok', 'warning');
      return;
    }

    setEntries((prev) => ({ ...prev, [last]: Math.max(0, (prev[last] || 0) - 1) }));
    setLastScans((prev) => prev.slice(0, -1));
    toast$('Son okutma geri alındı', 'info');
  };

  const buildItems = () => {
    const allEans = new Set([...Object.keys(expectedMap), ...Object.keys(entries)]);
    return Array.from(allEans).map((ean) => {
      const p = products[ean] || expectedMap[ean] || {};
      const expected = expectedMap[ean]?.beklenenAdet || 0;
      const counted = entries[ean] || 0;
      return {
        ean,
        malzemeKodu: p.malzemeKodu || '',
        urunAdi: p.urunAdi || expectedMap[ean]?.urunAdi || ean,
        beklenenAdet: expected,
        adet: counted,
        fark: counted - expected,
        hasarliAdet: hasarlilar[ean] || 0,
        beklenmeyen: !expectedKeys.has(ean) && counted > 0,
      };
    });
  };

  const handleSubmit = async () => {
    const countedTotal = Object.values(entries).reduce((a, b) => a + b, 0);
    if (countedTotal <= 0 && expectedItems.length === 0) {
      toast$('Bu lokasyonda kaydedilecek ürün yok', 'error');
      return;
    }

    setSaving(true);
    try {
      const items = buildItems();
      await onSave({
        lokasyon,
        items,
        countedEntries: entries,
        expectedItems,
        durum: 'tamamlandi',
        kullanici: profile?.name || user?.email || '',
        kullaniciId: user?.uid || '',
      });
      toast$(`${lokasyon} kaydedildi ✓`, 'success');
    } catch (e) {
      toast$('Hata: ' + e.message, 'error');
    }
    setSaving(false);
  };

  const rows = buildItems();
  const visibleRows = rows.filter((r) => r.beklenenAdet > 0 || r.adet > 0);
  const countedTotal = visibleRows.reduce((a, i) => a + (i.adet || 0), 0);
  const expectedTotal = visibleRows.reduce((a, i) => a + (i.beklenenAdet || 0), 0);
  const totalHasar = Object.values(hasarlilar).reduce((a, b) => a + b, 0);
  const issueCount = visibleRows.filter((r) => r.beklenmeyen || r.fark !== 0).length;

  return (
    <div>
      <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,.1)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📍 {lokasyon}</p>
          <p style={{ color: '#94a3b8', fontSize: 11 }}>
            Beklenen {expectedTotal} · Sayılan {countedTotal}
            {issueCount > 0 ? ` · ⚠️ ${issueCount} fark` : ''}
            {totalHasar > 0 ? ` · ⚠️ ${totalHasar} hasarlı` : ''}
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            background: '#10b981',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            padding: '8px 14px',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '...' : 'Lokasyonu Tamamla ✓'}
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        {[
          ['text', '⌨️ Metin'],
          ['cam', '📷 Kamera'],
        ].map(([m, l]) => (
          <button
            key={m}
            onClick={() => {
              if (m === 'cam' && !camOn) startCam();
              if (m !== 'cam') stopCam();
              setMode(m);
            }}
            style={{
              flex: 1,
              border: 'none',
              padding: '11px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === m ? '#0f172a' : '#f8fafc',
              color: mode === m ? '#fff' : '#64748b',
            }}
          >
            {l}
          </button>
        ))}
        <button
          onClick={undoLast}
          style={{
            border: 'none',
            padding: '11px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            background: '#f8fafc',
            color: '#64748b',
          }}
        >
          ↩️ Geri Al
        </button>
        <button
          onClick={() => setShowHasar(!showHasar)}
          style={{
            border: 'none',
            padding: '11px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            background: showHasar ? '#fef3c7' : '#f8fafc',
            color: showHasar ? '#d97706' : '#64748b',
          }}
        >
          ⚠️ Hasarlı{totalHasar > 0 ? ` (${totalHasar})` : ''}
        </button>
      </div>

      {mode === 'cam' && (
        <div style={{ background: '#000', maxHeight: 220, overflow: 'hidden', position: 'relative' }}>
          <video ref={videoRef} style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} playsInline muted />
          {!camOn && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={startCam}
                style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}
              >
                Kamerayı Başlat
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'text' && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={barInput}
              onChange={(e) => setBarInput(e.target.value)}
              onKeyDown={handleText}
              placeholder="Barkod okutun → Enter"
              autoFocus
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleText({ key: 'Enter' })}
              style={{ background: '#1e40af', border: 'none', borderRadius: 10, color: '#fff', padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}
            >
              Tara
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px 80px' }}>
        {showHasar && visibleRows.some((r) => r.adet > 0) && (
          <div style={{ background: '#fef3c7', borderRadius: 10, padding: '10px 12px', marginBottom: 10, border: '1px solid #fde68a' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>⚠️ Hasarlı Ürün Girişi</p>
            {visibleRows.filter((r) => r.adet > 0).map((item) => (
              <div key={item.ean} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <p style={{ flex: 1, fontSize: 12, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.urunAdi || item.ean}
                </p>
                <input
                  type="number"
                  min="0"
                  max={item.adet}
                  value={hasarlilar[item.ean] || 0}
                  onChange={(e) =>
                    setHasarlilar((prev) => ({
                      ...prev,
                      [item.ean]: Math.min(item.adet, Math.max(0, parseInt(e.target.value, 10) || 0)),
                    }))
                  }
                  style={{
                    width: 52,
                    textAlign: 'center',
                    border: '1px solid #fde68a',
                    borderRadius: 7,
                    padding: '4px',
                    fontSize: 13,
                    fontWeight: 700,
                    background: '#fff',
                  }}
                />
                <span style={{ fontSize: 11, color: '#92400e' }}>/ {item.adet}</span>
              </div>
            ))}
          </div>
        )}

        {visibleRows.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Bu lokasyonda sistemde ürün görünmüyor. Ürün okutursan beklenmeyen ürün olarak işaretlenir.
          </p>
        )}

        {visibleRows.map((item) => {
          const status = diffClass(item.beklenenAdet, item.adet, item.beklenmeyen);
          const hasar = hasarlilar[item.ean] || 0;
          return (
            <div
              key={item.ean}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.urunAdi || item.ean}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                  {item.malzemeKodu || item.ean}
                  {hasar > 0 && <span style={{ color: '#d97706', marginLeft: 8 }}>⚠️ {hasar} hasarlı</span>}
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#64748b' }}>
                    Beklenen: <b>{item.beklenenAdet}</b>
                  </span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>
                    Sayılan: <b>{item.adet}</b>
                  </span>
                  <span style={{ fontSize: 10, color: status.color, background: status.bg, borderRadius: 6, padding: '2px 6px', fontWeight: 800 }}>
                    {status.label}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <button
                  onClick={() => setEntries((prev) => ({ ...prev, [item.ean]: Math.max(0, (prev[item.ean] || 0) - 1) }))}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}
                >
                  −
                </button>
                <input
                  type="number"
                  value={entries[item.ean] || 0}
                  onChange={(e) => setEntries((prev) => ({ ...prev, [item.ean]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  style={{ width: 42, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 0', fontSize: 13, fontWeight: 700 }}
                />
                <button
                  onClick={() => setEntries((prev) => ({ ...prev, [item.ean]: (prev[item.ean] || 0) + 1 }))}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

/* ── ANA COMPONENT ── */
export default function DepoSayimi() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [view, setView] = useState('list');
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [selectedLok, setSelectedLok] = useState(null);
  const [allEntries, setAllEntries] = useState([]);
  const [products, setProducts] = useState({});
  const [stockRows, setStockRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  const [pendingRefItems, setPendingRefItems] = useState([]);
  const [pendingRefErrors, setPendingRefErrors] = useState([]);

  const toast$ = (msg, type = 'info') => setToast({ msg, type, id: Date.now() });

  const sessionTypeLabel = (tip) => (tip === 'referansli_sayim' ? '📋 Referanslı Sayım' : '📦 Manuel Sayım');
  const isReferenceSession = activeSession?.tip === 'referansli_sayim';

  const loadProductsAndStock = useCallback(async () => {
    const productSnap = await getDocs(collection(db, 'products'));
    const productMap = {};
    productSnap.docs.forEach((d) => {
      const p = d.data();
      const ean = norm(p.ean);
      if (ean) productMap[ean] = { id: d.id, ...p, ean };
    });
    setProducts(productMap);

    const stockSnap = await getDocs(collection(db, 'stock'));
    const rows = stockSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setStockRows(rows);
  }, []);

  useEffect(() => {
    loadProductsAndStock();
  }, [loadProductsAndStock]);

  const loadSessions = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'countSessions'), orderBy('baslangic', 'desc')));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.tip === 'manuel_sayim' || s.tip === 'referansli_sayim' || s.tip === 'genel');
      setSessions(list);
    } catch (e) {
      toast$('Sayım oturumları yüklenemedi', 'error');
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadEntries = useCallback(async (sessionId) => {
    const snap = await getDocs(query(collection(db, 'countEntries'), where('sessionId', '==', sessionId)));
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setAllEntries(entries);
    return entries;
  }, []);

  const getExpectedForLocation = useCallback((lokasyon, session = activeSession) => {
    if (!lokasyon) return [];

    if (session?.tip === 'referansli_sayim') {
      const ref = session.referenceItems || [];
      return ref
        .filter((i) => i.lokasyon === lokasyon)
        .map((i) => ({
          ean: norm(i.ean),
          malzemeKodu: i.malzemeKodu || products[norm(i.ean)]?.malzemeKodu || '',
          urunAdi: i.urunAdi || products[norm(i.ean)]?.urunAdi || norm(i.ean),
          beklenenAdet: i.beklenenAdet || 0,
        }));
    }

    const expected = [];
    stockRows.forEach((s) => {
      const byLocation = s.byLocation || {};
      const qty = byLocation[lokasyon] || 0;
      const ean = norm(s.ean || s.id);
      if (qty > 0 && ean) {
        expected.push({
          ean,
          malzemeKodu: s.malzemeKodu || products[ean]?.malzemeKodu || '',
          urunAdi: s.urunAdi || products[ean]?.urunAdi || ean,
          beklenenAdet: qty,
        });
      }
    });

    return expected;
  }, [activeSession, stockRows, products]);

  const getExistingEntryForLok = useCallback((lokasyon) => {
    return allEntries.find((e) => e.lokasyon === lokasyon && e.kullaniciId === user?.uid) ||
      allEntries.find((e) => e.lokasyon === lokasyon) ||
      null;
  }, [allEntries, user?.uid]);

  const buildReport = useCallback((entries, session = activeSession, includeUncounted = false) => {
    const lokMap = {};
    const completedLokasyonlar = [];

    entries.forEach((entry) => {
      if (!entry.lokasyon) return;
      lokMap[entry.lokasyon] = entry;
      completedLokasyonlar.push(entry.lokasyon);
    });

    const allLocations = new Set(Object.keys(lokMap));

    // Aktif sayım sırasında henüz sayılmamış tüm depo lokasyonlarını
    // sorunlu göstermemek için varsayılan olarak sadece sayılmış lokasyonlar rapora alınır.
    // Sayım finalinde includeUncounted=true gönderilirse referans/stokta olup hiç sayılmayan
    // lokasyonlar da eksik olarak rapora dahil edilir.
    if (includeUncounted && session?.tip === 'referansli_sayim') {
      (session.referenceItems || []).forEach((r) => allLocations.add(r.lokasyon));
    }

    if (includeUncounted && (session?.tip === 'manuel_sayim' || session?.tip === 'genel')) {
      stockRows.forEach((s) => {
        Object.keys(s.byLocation || {}).forEach((lok) => allLocations.add(lok));
      });
    }

    const lokasyonOzetleri = [];
    const farkliUrunler = [];
    const beklenmeyenUrunler = [];

    Array.from(allLocations).sort().forEach((lokasyon) => {
      const entry = lokMap[lokasyon] || null;
      const expectedItems = getExpectedForLocation(lokasyon, session);
      const expectedMap = {};
      expectedItems.forEach((i) => {
        if (i.ean) expectedMap[i.ean] = i;
      });

      const countedMap = {};
      (entry?.items || []).forEach((i) => {
        if (i.ean) countedMap[i.ean] = i;
      });

      const allEans = new Set([...Object.keys(expectedMap), ...Object.keys(countedMap)]);
      let eksikKalem = 0;
      let fazlaKalem = 0;
      let beklenmeyenKalem = 0;
      let farkKalem = 0;

      Array.from(allEans).forEach((ean) => {
        const expected = expectedMap[ean]?.beklenenAdet || 0;
        const counted = countedMap[ean]?.adet || 0;
        const fark = counted - expected;
        const isUnexpected = !expectedMap[ean] && counted > 0;

        if (isUnexpected) beklenmeyenKalem += 1;
        if (fark < 0) eksikKalem += 1;
        if (fark > 0) fazlaKalem += 1;
        if (fark !== 0 || isUnexpected) {
          farkKalem += 1;
          const row = {
            lokasyon,
            ean,
            malzemeKodu: countedMap[ean]?.malzemeKodu || expectedMap[ean]?.malzemeKodu || products[ean]?.malzemeKodu || '',
            urunAdi: countedMap[ean]?.urunAdi || expectedMap[ean]?.urunAdi || products[ean]?.urunAdi || ean,
            beklenenAdet: expected,
            sayilanAdet: counted,
            fark,
            durum: isUnexpected ? 'referans_disi_beklenmeyen' : fark < 0 ? 'eksik' : 'fazla',
          };

          if (isUnexpected) beklenmeyenUrunler.push(row);
          farkliUrunler.push(row);
        }
      });

      lokasyonOzetleri.push({
        lokasyon,
        durum: farkKalem > 0 ? 'sorunlu' : 'tamam',
        farkKalem,
        eksikKalem,
        fazlaKalem,
        beklenmeyenKalem,
        sayildiMi: Boolean(entry),
      });
    });

    return {
      lokasyonOzetleri,
      farkliUrunler,
      beklenmeyenUrunler,
      tamamlananLokasyonlar: Array.from(new Set(completedLokasyonlar)).sort(),
    };
  }, [activeSession, getExpectedForLocation, products, stockRows]);

  const startManualSession = async () => {
    setLoading(true);
    try {
      const ref = await addDoc(collection(db, 'countSessions'), {
        tip: 'manuel_sayim',
        sayimTuru: 'manuel',
        durum: 'aktif',
        baslatan: profile?.name || user?.email || '',
        baslatanId: user?.uid || '',
        baslangic: Timestamp.now(),
      });
      const s = {
        id: ref.id,
        tip: 'manuel_sayim',
        sayimTuru: 'manuel',
        durum: 'aktif',
        baslatan: profile?.name || user?.email || '',
        baslatanId: user?.uid || '',
        baslangic: Timestamp.now(),
      };
      setActiveSession(s);
      setAllEntries([]);
      setSessions((prev) => [s, ...prev]);
      setView('lokasyon');
    } catch (e) {
      toast$('Hata: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const deleteSession = async (session) => {
    const label = sessionTypeLabel(session.tip);
    if (!window.confirm(`"${label}" oturumu silinecek.

Oturum silinse bile daha önce kaydedilmiş sayım girişleri korunur.

Emin misiniz?`)) return;

    try {
      await deleteDoc(doc(db, 'countSessions', session.id));
      setSessions((prev) => prev.filter((s) => s.id !== session.id));

      if (activeSession?.id === session.id) {
        setActiveSession(null);
        setSelectedLok(null);
        setAllEntries([]);
        setView('list');
      }

      toast$('Oturum silindi', 'success');
    } catch (e) {
      toast$('Hata: ' + e.message, 'error');
    }
  };


  const parseReferenceFile = (file) => {
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => {
      try {
        const wb = XLSX.read(new Uint8Array(result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        let headerIndex = -1;
        let cLok = -1;
        let cEan = -1;
        let cKod = -1;
        let cUrun = -1;
        let cAdet = -1;

        for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
          const cells = rows[r].map((c) => String(c || '').toLowerCase().replace(/\s+/g, ' ').trim());
          cells.forEach((cell, j) => {
            if (/(lokasyon|location|raf|adres)/.test(cell)) cLok = j;
            if (/(ean|barkod|barcode)/.test(cell)) cEan = j;
            if (/(malzeme|ürün kodu|urun kodu|item|sku)/.test(cell)) cKod = j;
            if (/(ürün adı|urun adı|ürün ismi|urun ismi|sistem|product)/.test(cell)) cUrun = j;
            if (/(beklenen|miktar|adet|qty|stok|toplam)/.test(cell)) cAdet = j;
          });

          if (cLok >= 0 && cEan >= 0 && cAdet >= 0) {
            headerIndex = r;
            break;
          }
        }

        if (headerIndex < 0) {
          toast$('Referans dosyasında Lokasyon, EAN ve Beklenen Adet kolonları bulunamadı.', 'error');
          return;
        }

        const grouped = {};
        const errors = [];

        rows.slice(headerIndex + 1).forEach((row, idx) => {
          const rowNo = headerIndex + idx + 2;
          const lokasyon = normalizeLokasyon(row[cLok]);
          const ean = norm(row[cEan]);
          const adet = safeNumber(row[cAdet]);

          if (!lokasyon && !ean && !adet) return;

          if (!lokasyon) {
            errors.push({ rowNo, reason: 'Lokasyon boş veya geçersiz' });
            return;
          }
          if (!ean) {
            errors.push({ rowNo, reason: 'EAN boş' });
            return;
          }
          if (adet <= 0) {
            errors.push({ rowNo, reason: 'Beklenen adet 0 veya geçersiz' });
            return;
          }

          const p = products[ean] || {};
          const key = `${lokasyon}__${ean}`;
          if (!grouped[key]) {
            grouped[key] = {
              lokasyon,
              ean,
              malzemeKodu: cKod >= 0 ? norm(row[cKod]) : p.malzemeKodu || '',
              urunAdi: cUrun >= 0 ? norm(row[cUrun]) : p.urunAdi || '',
              beklenenAdet: 0,
            };
          }
          grouped[key].beklenenAdet += adet;
        });

        const refItems = Object.values(grouped).sort((a, b) => `${a.lokasyon}${a.ean}`.localeCompare(`${b.lokasyon}${b.ean}`));
        setPendingRefItems(refItems);
        setPendingRefErrors(errors);

        if (refItems.length === 0) {
          toast$('Geçerli referans satırı bulunamadı.', 'error');
        } else if (errors.length > 0) {
          toast$(`${refItems.length} kalem hazırlandı, ${errors.length} satır atlandı.`, 'warning');
        } else {
          toast$(`${refItems.length} kalem referans hazırlandı.`, 'success');
        }
      } catch (e) {
        toast$('Dosya hatası: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const startReferenceSession = async () => {
    if (pendingRefItems.length === 0) {
      toast$('Önce referans dosyası yükleyin', 'error');
      return;
    }

    setLoading(true);
    try {
      const locations = Array.from(new Set(pendingRefItems.map((i) => i.lokasyon))).sort();
      const totalExpected = pendingRefItems.reduce((a, i) => a + (i.beklenenAdet || 0), 0);

      const ref = await addDoc(collection(db, 'countSessions'), {
        tip: 'referansli_sayim',
        sayimTuru: 'referansli',
        durum: 'aktif',
        baslatan: profile?.name || user?.email || '',
        baslatanId: user?.uid || '',
        baslangic: Timestamp.now(),
        referenceItems: pendingRefItems,
        referenceSummary: {
          kalemSayisi: pendingRefItems.length,
          lokasyonSayisi: locations.length,
          toplamBeklenenAdet: totalExpected,
        },
      });

      const s = {
        id: ref.id,
        tip: 'referansli_sayim',
        sayimTuru: 'referansli',
        durum: 'aktif',
        baslatan: profile?.name || user?.email || '',
        baslatanId: user?.uid || '',
        baslangic: Timestamp.now(),
        referenceItems: pendingRefItems,
        referenceSummary: {
          kalemSayisi: pendingRefItems.length,
          lokasyonSayisi: locations.length,
          toplamBeklenenAdet: totalExpected,
        },
      };

      setActiveSession(s);
      setAllEntries([]);
      setSessions((prev) => [s, ...prev]);
      setPendingRefItems([]);
      setPendingRefErrors([]);
      setView('lokasyon');
    } catch (e) {
      toast$('Hata: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const saveLocationEntry = async ({ lokasyon, items, expectedItems, durum, kullanici, kullaniciId }) => {
    if (!activeSession) return;

    const now = Timestamp.now();
    const existing = getExistingEntryForLok(lokasyon);
    const countedTotal = items.reduce((a, i) => a + (i.adet || 0), 0);
    const expectedTotal = expectedItems.reduce((a, i) => a + (i.beklenenAdet || 0), 0);
    const farkliUrunler = items.filter((i) => i.beklenmeyen || i.fark !== 0);

    const payload = {
      sessionId: activeSession.id,
      sayimTuru: activeSession.tip === 'referansli_sayim' ? 'referansli' : 'manuel',
      lokasyon,
      tip: activeSession.tip,
      kullanici,
      kullaniciId,
      items,
      expectedItems,
      countedTotal,
      expectedTotal,
      farkliUrunler,
      beklenmeyenUrunler: items.filter((i) => i.beklenmeyen),
      tarih: existing?.tarih || now,
      sonGuncelleme: now,
      durum,
    };

    if (existing?.id) {
      await updateDoc(doc(db, 'countEntries', existing.id), payload);
    } else {
      await addDoc(collection(db, 'countEntries'), payload);
    }

    const latestEntries = await loadEntries(activeSession.id);
    const mergedEntries = existing?.id
      ? latestEntries.map((e) => (e.id === existing.id ? { ...e, ...payload, id: existing.id } : e))
      : latestEntries;

    const report = buildReport(mergedEntries, activeSession, false);
    await updateDoc(doc(db, 'countSessions', activeSession.id), {
      lokasyonOzetleri: report.lokasyonOzetleri,
      farkliUrunler: report.farkliUrunler,
      beklenmeyenUrunler: report.beklenmeyenUrunler,
      tamamlananLokasyonlar: report.tamamlananLokasyonlar,
      sonGuncelleme: now,
    });

    await loadEntries(activeSession.id);
    await loadSessions();
    setSelectedLok(null);
    setView('lokasyon');
  };

  const finalizeSession = async () => {
    if (!activeSession) return;
    const entries = await loadEntries(activeSession.id);
    const report = buildReport(entries, activeSession, true);

    await updateDoc(doc(db, 'countSessions', activeSession.id), {
      durum: 'tamamlandi',
      bitis: Timestamp.now(),
      lokasyonOzetleri: report.lokasyonOzetleri,
      farkliUrunler: report.farkliUrunler,
      beklenmeyenUrunler: report.beklenmeyenUrunler,
      tamamlananLokasyonlar: report.tamamlananLokasyonlar,
    });

    toast$('Sayım tamamlandı ve rapor kaydedildi ✓', 'success');
    setActiveSession(null);
    setAllEntries([]);
    setView('list');
    loadSessions();
  };

  const exportSayim = async (session) => {
    const snap = await getDocs(query(collection(db, 'countEntries'), where('sessionId', '==', session.id)));
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const rows = [
      ['Lokasyon', 'EAN', 'Malzeme Kodu', 'Ürün Adı', 'Beklenen Adet', 'Sayılan Adet', 'Fark', 'Durum', 'Hasarlı Adet'],
    ];

    entries.forEach((entry) => {
      (entry.items || []).forEach((item) => {
        rows.push([
          entry.lokasyon || '',
          item.ean || '',
          item.malzemeKodu || '',
          item.urunAdi || '',
          item.beklenenAdet || 0,
          item.adet || 0,
          item.fark || 0,
          item.beklenmeyen ? 'Beklenmeyen / Referans Dışı' : item.fark === 0 ? 'Tamam' : item.fark < 0 ? 'Eksik' : 'Fazla',
          item.hasarliAdet || 0,
        ]);
      });
    });

    const report = buildReport(entries, session, true);
    const summaryRows = [
      ['Lokasyon', 'Durum', 'Fark Kalem', 'Eksik Kalem', 'Fazla Kalem', 'Beklenmeyen Kalem', 'Sayıldı mı'],
      ...report.lokasyonOzetleri.map((l) => [
        l.lokasyon,
        l.durum,
        l.farkKalem,
        l.eksikKalem,
        l.fazlaKalem,
        l.beklenmeyenKalem,
        l.sayildiMi ? 'Evet' : 'Hayır',
      ]),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Lokasyon Ozeti');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Urun Detay');
    XLSX.writeFile(wb, `${session.tip === 'referansli_sayim' ? 'referansli' : 'manuel'}_depo_sayimi.xlsx`);
  };

  const continueSession = async (s) => {
    setActiveSession(s);
    await loadEntries(s.id);
    setView('lokasyon');
  };

  /* ── SAYIM EKRANI ── */
  if (view === 'sayim' && selectedLok && activeSession) {
    const expectedItems = getExpectedForLocation(selectedLok, activeSession);
    const existingEntry = getExistingEntryForLok(selectedLok);

    return (
      <SayimEkrani
        lokasyon={selectedLok}
        session={activeSession}
        products={products}
        expectedItems={expectedItems}
        existingEntry={existingEntry}
        onSave={saveLocationEntry}
        onBack={() => {
          setSelectedLok(null);
          setView('lokasyon');
        }}
      />
    );
  }

  /* ── REFERANSLI SAYIM DOSYA YÜKLE ── */
  if (view === 'referans_yukle') {
    const lokasyonSayisi = new Set(pendingRefItems.map((i) => i.lokasyon)).size;
    const toplamAdet = pendingRefItems.reduce((a, i) => a + (i.beklenenAdet || 0), 0);

    return (
      <div>
        <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setView('list')}
            style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}
          >
            ←
          </button>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📋 Referanslı Sayım</p>
        </div>

        <div style={{ padding: 16 }}>
          <div style={S.card}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>Referans Dosyası Formatı</p>
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              Zorunlu kolonlar: <b>Lokasyon</b>, <b>EAN</b>, <b>Beklenen Adet</b>. Yardımcı kolonlar: Malzeme Kodu, Ürün Adı.
            </p>
            <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
              Lokasyon | EAN | Malzeme Kodu | Ürün Adı | Beklenen Adet
            </div>
          </div>

          <div style={S.card}>
            <label
              style={{
                ...S.btn,
                background: '#1e40af',
                color: '#fff',
                display: 'inline-block',
                cursor: 'pointer',
                marginBottom: 10,
              }}
            >
              📂 Referans Dosyası Seç
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files[0]) parseReferenceFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>

            {pendingRefItems.length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 10 }}>
                <p style={{ fontSize: 12, color: '#15803d', fontWeight: 800 }}>✅ Dosya hazır</p>
                <p style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
                  {pendingRefItems.length} kalem · {lokasyonSayisi} lokasyon · {toplamAdet.toLocaleString('tr-TR')} beklenen adet
                </p>
              </div>
            )}

            {pendingRefErrors.length > 0 && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 10, marginTop: 10 }}>
                <p style={{ fontSize: 12, color: '#c2410c', fontWeight: 800 }}>
                  ⚠️ {pendingRefErrors.length} satır atlandı
                </p>
                <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 6 }}>
                  {pendingRefErrors.slice(0, 20).map((e, i) => (
                    <p key={i} style={{ fontSize: 11, color: '#9a3412' }}>
                      Satır {e.rowNo}: {e.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={startReferenceSession}
            disabled={pendingRefItems.length === 0 || loading}
            style={{
              ...S.btn,
              width: '100%',
              background: '#7c3aed',
              color: '#fff',
              opacity: pendingRefItems.length === 0 || loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Başlatılıyor...' : 'Referanslı Sayımı Başlat →'}
          </button>
        </div>
        {toast && <Toast {...toast} onDone={() => setToast(null)} />}
      </div>
    );
  }

  /* ── LOKASYON SEÇİMİ ── */
  if (view === 'lokasyon' && activeSession) {
    const completed = Array.from(new Set(allEntries.map((e) => e.lokasyon))).sort();
    const refLocations = activeSession.tip === 'referansli_sayim'
      ? Array.from(new Set((activeSession.referenceItems || []).map((i) => i.lokasyon))).sort()
      : null;

    const report = buildReport(allEntries, activeSession);
    const sorunlu = report.lokasyonOzetleri.filter((l) => l.durum === 'sorunlu' && l.sayildiMi);

    return (
      <div>
        <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => {
              setView('list');
              setActiveSession(null);
              setSelectedLok(null);
            }}
            style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}
          >
            ←
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{sessionTypeLabel(activeSession.tip)}</p>
            <p style={{ color: '#94a3b8', fontSize: 11 }}>
              {completed.length} lokasyon tamamlandı
              {sorunlu.length > 0 ? ` · ⚠️ ${sorunlu.length} sorunlu lokasyon` : ''}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setView('rapor')}
              style={{ ...S.btn, background: '#3b82f6', color: '#fff', padding: '7px 12px', fontSize: 12 }}
            >
              Rapor
            </button>
          )}
        </div>

        {completed.length > 0 && (
          <div style={{ padding: '10px 16px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 6 }}>✅ Tamamlanan lokasyonlar</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {completed.map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setSelectedLok(l);
                    setView('sayim');
                  }}
                  style={{
                    background: '#dcfce7',
                    color: '#15803d',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {l} · Düzenle
                </button>
              ))}
            </div>
          </div>
        )}

        {sorunlu.length > 0 && (
          <div style={{ padding: '10px 16px', background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#c2410c', marginBottom: 6 }}>⚠️ Sorunlu lokasyonlar</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {sorunlu.slice(0, 30).map((l) => (
                <button
                  key={l.lokasyon}
                  onClick={() => {
                    setSelectedLok(l.lokasyon);
                    setView('sayim');
                  }}
                  style={{
                    background: '#fed7aa',
                    color: '#9a3412',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {l.lokasyon} · {l.farkKalem} fark
                </button>
              ))}
            </div>
          </div>
        )}

        <LokPicker
          onSelect={(lok) => {
            setSelectedLok(lok);
            setView('sayim');
          }}
          currentLok={completed[completed.length - 1]}
          allowedLokasyonlar={refLocations}
        />
      </div>
    );
  }

  /* ── RAPOR ── */
  if (view === 'rapor' && activeSession) {
    const report = buildReport(allEntries, activeSession);
    const sorunlu = report.lokasyonOzetleri.filter((l) => l.durum === 'sorunlu' && l.sayildiMi);
    const tamam = report.lokasyonOzetleri.filter((l) => l.durum === 'tamam');

    return (
      <div>
        <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setView('lokasyon')}
            style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}
          >
            ←
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Sayım Raporu</p>
            <p style={{ color: '#94a3b8', fontSize: 11 }}>
              {report.lokasyonOzetleri.length} lokasyon · {sorunlu.length} sorunlu · {tamam.length} tamam
            </p>
          </div>
          <button
            onClick={() => exportSayim(activeSession)}
            style={{ ...S.btn, background: '#10b981', color: '#fff', padding: '7px 12px', fontSize: 12 }}
          >
            ⬇️ Excel
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ ...S.card, marginBottom: 0, background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <p style={{ fontSize: 11, color: '#c2410c', fontWeight: 800 }}>SORUNLU</p>
              <p style={{ fontSize: 24, color: '#9a3412', fontWeight: 900 }}>{sorunlu.length}</p>
            </div>
            <div style={{ ...S.card, marginBottom: 0, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: 11, color: '#15803d', fontWeight: 800 }}>TAMAM</p>
              <p style={{ fontSize: 24, color: '#166534', fontWeight: 900 }}>{tamam.length}</p>
            </div>
          </div>

          {sorunlu.length > 0 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Sorunlu Lokasyonlar
              </p>
              {sorunlu.map((lok) => {
                const details = report.farkliUrunler.filter((i) => i.lokasyon === lok.lokasyon);
                return (
                  <div key={lok.lokasyon} style={{ ...S.card, border: '1px solid #fed7aa', background: '#fff7ed' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <button
                        onClick={() => {
                          setSelectedLok(lok.lokasyon);
                          setView('sayim');
                        }}
                        style={{ ...S.btn, background: '#ea580c', color: '#fff', padding: '6px 10px', fontSize: 12 }}
                      >
                        {lok.lokasyon} Düzenle
                      </button>
                      <p style={{ fontSize: 12, color: '#9a3412', fontWeight: 800 }}>
                        {lok.eksikKalem} eksik · {lok.fazlaKalem} fazla · {lok.beklenmeyenKalem} beklenmeyen
                      </p>
                    </div>
                    {details.slice(0, 8).map((d, i) => (
                      <div key={`${d.ean}_${i}`} style={{ padding: '5px 0', borderTop: i === 0 ? 'none' : '1px solid #fed7aa' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{d.urunAdi || d.ean}</p>
                        <p style={{ fontSize: 11, color: '#9a3412', fontFamily: 'monospace' }}>
                          {d.ean} · Beklenen {d.beklenenAdet} / Sayılan {d.sayilanAdet} · Fark {d.fark}
                        </p>
                      </div>
                    ))}
                    {details.length > 8 && (
                      <p style={{ fontSize: 11, color: '#9a3412', marginTop: 6 }}>+ {details.length - 8} detay daha Excel raporunda</p>
                    )}
                  </div>
                );
              })}
            </>
          )}

          <button
            onClick={finalizeSession}
            disabled={!isAdmin}
            style={{
              ...S.btn,
              width: '100%',
              background: '#0f172a',
              color: '#fff',
              marginTop: 10,
              opacity: !isAdmin ? 0.5 : 1,
            }}
          >
            ✅ Sayımı Tamamla ve Raporu Kaydet
          </button>
        </div>
        {toast && <Toast {...toast} onDone={() => setToast(null)} />}
      </div>
    );
  }

  /* ── LİSTE ── */
  const aktifler = sessions.filter((s) => s.durum === 'aktif');
  const bitmisler = sessions.filter((s) => s.durum !== 'aktif');

  return (
    <div>
      <div style={{ background: '#0f172a', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>🔢 Depo Sayımı</p>
      </div>

      <div style={{ padding: 16 }}>
        {isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <button
              onClick={startManualSession}
              disabled={loading}
              style={{ ...S.btn, background: '#1e40af', color: '#fff', minHeight: 54 }}
            >
              📦 Manuel Sayım Başlat
            </button>
            <button
              onClick={() => {
                setPendingRefItems([]);
                setPendingRefErrors([]);
                setView('referans_yukle');
              }}
              disabled={loading}
              style={{ ...S.btn, background: '#7c3aed', color: '#fff', minHeight: 54 }}
            >
              📋 Referanslı Sayım Başlat
            </button>
          </div>
        )}

        {aktifler.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Aktif Oturumlar
            </p>
            {aktifler.map((s) => (
              <div key={s.id} style={{ ...S.card, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{sessionTypeLabel(s.tip)}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>
                      {s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR') || ''}
                      {s.referenceSummary ? ` · ${s.referenceSummary.lokasyonSayisi} lokasyon` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => continueSession(s)}
                    style={{ ...S.btn, background: '#1e40af', color: '#fff', padding: '8px 14px', fontSize: 12 }}
                  >
                    Devam →
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => deleteSession(s)}
                      title="Oturumu sil"
                      style={{ ...S.btn, background: '#fee2e2', color: '#ef4444', padding: '8px 10px', fontSize: 13 }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {bitmisler.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 }}>
              Tamamlanan
            </p>
            {bitmisler.slice(0, 10).map((s) => (
              <div key={s.id} style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{sessionTypeLabel(s.tip)}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>
                      {s.baslatan} · {s.baslangic?.toDate?.()?.toLocaleDateString('tr-TR') || ''}
                      {s.lokasyonOzetleri ? ` · ${s.lokasyonOzetleri.filter((l) => l.durum === 'sorunlu').length} sorunlu lokasyon` : ''}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => exportSayim(s)}
                      style={{ ...S.btn, background: '#f1f5f9', color: '#475569', padding: '6px 10px', fontSize: 11 }}
                    >
                      ⬇️ Excel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {sessions.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🔢</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Henüz depo sayımı yok</p>
          </div>
        )}
      </div>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}
