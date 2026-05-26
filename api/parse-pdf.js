import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function validateEAN13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;
  const d = ean.split('').map(Number);
  const sum = d.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

function normalizeText(text = '') {
  return String(text)
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function extractIrsaliyeNo(text) {
  const patterns = [
    /(?:İrsaliye|Irsaliye)\s*No\s*:?\s*([A-Z0-9-]+)/iu,
    /(?:E-?İrsaliye|E-?Irsaliye).*?No\s*:?\s*([A-Z0-9-]+)/iu,
    /\b([A-Z]{2,5}\d{10,16})\b/u,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function extractCariIsim(text) {
  const patterns = [
    /SAYIN\s*\n\s*([^\n]+)/iu,
    /SAYIN\s+([^\n]+?)(?:\n|Vergi|VKN|TCKN|Adres)/iu,
    /(?:Cari\s*(?:İsim|Isim|Ünvan|Unvan)|Müşteri|Musteri)\s*:?\s*([^\n]+)/iu,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const value = m?.[1]?.replace(/\s{2,}/g, ' ').trim();
    if (value && !/^(vergi|vkn|tckn|adres)$/iu.test(value)) return value;
  }
  return '';
}

function toQty(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : 0;
}

function addToMap(map, ean, qty) {
  if (!ean || !qty) return;
  map.set(ean, (map.get(ean) || 0) + qty);
}

function extractProducts(text) {
  const eanMap = new Map();
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  for (const line of lines) {
    // Örnek: 4064666900681 60 Adet
    for (const m of line.matchAll(/\b(\d{13})\b\s+(\d{1,4})(?:[,.]\d+)?\s*(?:Adet|ADET|adet)\b/gu)) {
      if (validateEAN13(m[1])) addToMap(eanMap, m[1], toQty(m[2]));
    }

    // Örnek: 406466690068160 Adet  → EAN + adet bitişik gelirse
    for (const m of line.matchAll(/\b(\d{14,17})\b\s*(?:Adet|ADET|adet)\b/gu)) {
      const digits = m[1];
      for (let qtyLen = 1; qtyLen <= Math.min(4, digits.length - 13); qtyLen++) {
        const ean = digits.slice(0, 13);
        const qty = toQty(digits.slice(13, 13 + qtyLen));
        if (validateEAN13(ean) && qty && !eanMap.has(ean)) {
          addToMap(eanMap, ean, qty);
          break;
        }
      }
    }

    // Daha dağınık PDF satırları: EAN görünüyor ama adet birkaç hücre sonra geliyor.
    // Satırda EAN'den sonra ve "Adet"ten önceki son küçük sayı adet kabul edilir.
    const eanMatches = [...line.matchAll(/\b\d{13}\b/gu)].map(m => ({ ean: m[0], index: m.index || 0 }));
    for (const { ean, index } of eanMatches) {
      if (!validateEAN13(ean) || eanMap.has(ean)) continue;
      const after = line.slice(index + 13);
      const adetIndex = after.search(/\b(?:Adet|ADET|adet)\b/u);
      const scope = adetIndex >= 0 ? after.slice(0, adetIndex) : after;
      const nums = [...scope.matchAll(/\b\d{1,4}(?:[,.]\d+)?\b/gu)].map(m => m[0]);
      const qty = toQty(nums.at(-1));
      if (qty) addToMap(eanMap, ean, qty);
    }

    // WLA gibi EAN olmayan kodlar için eski destek
    for (const m of line.matchAll(/\b(WLA[A-Z0-9]{3,12})\b\s*(\d{1,4})\s*(?:Adet|ADET|adet)\b/gu)) {
      addToMap(eanMap, m[1], toQty(m[2]));
    }
  }

  return [...eanMap.entries()]
    .map(([ean, beklenen]) => ({ ean, beklenen }))
    .sort((a, b) => a.ean.localeCompare(b.ean));
}

function parseKargoRows(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  for (const line of lines) {
    const irsaliyeNo = line.match(/\b[A-Z]{2,5}\d{10,16}\b/u)?.[0] || '';
    const takipNo = line.match(/\b\d{10,20}\b/u)?.[0] || '';
    if (irsaliyeNo || takipNo) rows.push({ irsaliyeNo, cariIsim: '', takipNo, tarih: '' });
  }

  return rows;
}

function buildClaudeCompatiblePayload(payload) {
  return {
    ...payload,
    // Eski ön yüz kodun kırılmasın diye content formatını koruyoruz.
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { base64, prompt } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'base64 gerekli' });

  try {
    const cleanBase64 = String(base64).replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const data = await pdfParse(buffer);
    const text = normalizeText(data.text || '');

    if (!text) {
      return res.status(422).json({ error: 'PDF metni okunamadı. Dosya tarama/görsel PDF olabilir.' });
    }

    const wantsKargoRows = /kargo|takipNo|takip no|rows/i.test(String(prompt || ''));

    if (wantsKargoRows) {
      const payload = { rows: parseKargoRows(text), rawText: text.slice(0, 3000) };
      return res.status(200).json(buildClaudeCompatiblePayload(payload));
    }

    const payload = {
      irsaliyeNo: extractIrsaliyeNo(text),
      cariIsim: extractCariIsim(text),
      products: extractProducts(text),
      rawText: text.slice(0, 3000), // Debug için kısa metin; istersen sonra kaldırılabilir.
    };

    if (!payload.products.length) {
      return res.status(422).json({
        error: 'PDF içinden ürün/EAN/adet bilgisi çıkarılamadı.',
        rawText: payload.rawText,
      });
    }

    return res.status(200).json(buildClaudeCompatiblePayload(payload));
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'PDF parse hatası' });
  }
}
