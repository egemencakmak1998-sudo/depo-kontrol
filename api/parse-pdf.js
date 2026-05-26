import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function validateEAN13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;

  const d = ean.split('').map(Number);
  const sum = d
    .slice(0, 12)
    .reduce((s, x, i) => s + x * (i % 2 === 0 ? 1 : 3), 0);

  return (10 - (sum % 10)) % 10 === d[12];
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\uFFFE/g, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cleanName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s+/, '')
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

function mergeProduct(map, product) {
  const ean = String(product.ean || '').trim();
  const qty = Number(product.beklenen || 0);

  if (!ean || !validateEAN13(ean)) return;
  if (!qty || qty <= 0 || qty > 10000) return;

  const current = map.get(ean);

  if (current) {
    current.beklenen += qty;

    if (!current.urunAdi && product.urunAdi) {
      current.urunAdi = product.urunAdi;
    }

    if (!current.malzemeKodu && product.malzemeKodu) {
      current.malzemeKodu = product.malzemeKodu;
    }

    map.set(ean, current);
  } else {
    map.set(ean, {
      ean,
      beklenen: qty,
      malzemeKodu: product.malzemeKodu || '',
      urunAdi: product.urunAdi || '',
    });
  }
}

function extractProducts(text) {
  const productMap = new Map();

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  /*
    STRATEJİ 1:
    Satır bazlı yakalama.
    Örnek:
    1 4401010-00078 Ct Deep Brown 7/71 4064666846736 12 Adet
  */
  for (const line of lines) {
    const match = line.match(
      /^(\d{1,3})\s+([0-9A-Z-]{6,})\s+(.+?)\s+(\d{13})\s+(\d+)\s+Adet\b/i
    );

    if (match) {
      mergeProduct(productMap, {
        malzemeKodu: match[2],
        urunAdi: cleanName(match[3]),
        ean: match[4],
        beklenen: Number(match[5]),
      });
    }
  }

  /*
    STRATEJİ 2:
    Çok satırlı ürün adları için blok bazlı yakalama.
    PDF satırı böldüğünde yine yakalar.
  */
  const compactText = text.replace(/\n/g, ' ');

  const blockPattern =
    /(?:^|\s)(\d{1,3})\s+([0-9A-Z-]{6,})\s+(.{0,180}?)\s+(\d{13})\s+(\d+)\s+Adet\b/gi;

  let blockMatch;

  while ((blockMatch = blockPattern.exec(compactText)) !== null) {
    mergeProduct(productMap, {
      malzemeKodu: blockMatch[2],
      urunAdi: cleanName(blockMatch[3]),
      ean: blockMatch[4],
      beklenen: Number(blockMatch[5]),
    });
  }

  /*
    STRATEJİ 3:
    En sağlam fallback.
    Ürün adı veya malzeme kodu bulunamasa bile EAN + miktar varsa ürünü alır.
    Senin uygulamada ürün adı zaten Firebase products tablosundan tamamlanıyor.
  */
  const eanQtyPattern = /(\d{13})\s+(\d+)\s+Adet\b/gi;

  let eanMatch;

  while ((eanMatch = eanQtyPattern.exec(text)) !== null) {
    mergeProduct(productMap, {
      ean: eanMatch[1],
      beklenen: Number(eanMatch[2]),
      malzemeKodu: '',
      urunAdi: '',
    });
  }

  return Array.from(productMap.values());
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
      rawTextPreview: text.slice(0, 3000),
    };

    return res.status(200).json({
      ...payload,

      /*
        Eski frontend koduyla uyumluluk için bırakıldı.
        Yeni SiparisKontrol.jsx direkt products alanını okur.
      */
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
