import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function normalizeText(text) {
  return String(text || '')
    .replace(/\uFFFE/g, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function extractIrsaliyeNo(text) {
  const match =
    text.match(/İrsaliye\s*No\s*:?\s*([A-Z0-9]+)/i) ||
    text.match(/Irsaliye\s*No\s*:?\s*([A-Z0-9]+)/i);

  return match ? match[1].trim() : '';
}

function extractCariIsim(text) {
  const match = text.match(/SAYIN\s*\n\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function addProduct(map, ean, qty) {
  ean = String(ean || '').trim();
  qty = parseInt(qty, 10);

  if (!/^\d{13}$/.test(ean)) return;
  if (!qty || qty <= 0 || qty > 10000) return;

  if (map.has(ean)) {
    const existing = map.get(ean);
    existing.beklenen += qty;
    map.set(ean, existing);
  } else {
    map.set(ean, {
      ean,
      beklenen: qty,
      malzemeKodu: '',
      urunAdi: '',
    });
  }
}

function extractProducts(text) {
  const map = new Map();

  /*
    1. yöntem:
    Standart yapı:
    4064666846736 12 Adet
  */
  const p1 = /(\d{13})\s+(\d{1,5})\s+Adet\b/gi;

  let m;

  while ((m = p1.exec(text)) !== null) {
    addProduct(map, m[1], m[2]);
  }

  /*
    2. yöntem:
    Bazı PDF parse çıktılarında EAN ile miktar arasında boşluk bozulabilir:
    406466684673612 Adet
    Bu durumda 13 haneli EAN + miktar yakalanır.
  */
  const p2 = /(\d{13})(\d{1,5})\s+Adet\b/gi;

  while ((m = p2.exec(text)) !== null) {
    addProduct(map, m[1], m[2]);
  }

  /*
    3. yöntem:
    En agresif fallback.
    Her 13 haneli EAN'den sonra gelen 40 karakter içinde ilk miktar + Adet yapısını arar.
  */
  const eans = [...text.matchAll(/\d{13}/g)];

  for (const e of eans) {
    const ean = e[0];
    const after = text.slice(e.index + 13, e.index + 80);
    const qtyMatch = after.match(/^\s*(\d{1,5})\s*Adet\b/i) || after.match(/(\d{1,5})\s*Adet\b/i);

    if (qtyMatch) {
      addProduct(map, ean, qtyMatch[1]);
    }
  }

  return Array.from(map.values());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { base64 } = req.body || {};

  if (!base64) {
    return res.status(400).json({ error: 'base64 gerekli' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);

    const text = normalizeText(data.text);

    if (!text) {
      return res.status(422).json({
        error: 'PDF metni okunamadı. Dosya görsel/tarama PDF olabilir.',
      });
    }

    const irsaliyeNo = extractIrsaliyeNo(text);
    const cariIsim = extractCariIsim(text);
    const products = extractProducts(text);

    const payload = {
      irsaliyeNo,
      cariIsim,
      products,
      productCount: products.length,

      /*
        Debug için bırakıyorum.
        Network response içinde bunu görürsen parser'ın PDF'ten ne okuduğunu anlayabiliriz.
      */
      debug: {
        textLength: text.length,
        eanCount: [...text.matchAll(/\d{13}/g)].length,
        preview: text.slice(0, 8000),
      },
    };

    return res.status(200).json({
      ...payload,
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload),
        },
      ],
    });
  } catch (err) {
    console.error('PDF parse error:', err);

    return res.status(500).json({
      error: err.message || 'PDF okunurken hata oluştu',
    });
  }
}
