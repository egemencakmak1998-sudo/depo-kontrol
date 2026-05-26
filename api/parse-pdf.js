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

function extractProducts(text) {
  const map = new Map();

  /*
    Bu parser özellikle Elis irsaliye formatı için güvenli çalışır.
    PDF içinde görünen:
    4064666846736 12 Adet
    4064666900872 3 Adet
    gibi tüm EAN + miktar eşleşmelerini yakalar.
  */

  const pattern = /(\d{13})\s+(\d{1,5})\s+Adet\b/gi;

  let match;

  while ((match = pattern.exec(text)) !== null) {
    const ean = String(match[1]).trim();
    const qty = parseInt(match[2], 10);

    if (!ean || !qty || qty <= 0 || qty > 10000) continue;

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
      rawTextPreview: text.slice(0, 5000),
    };

    return res.status(200).json({
      ...payload,

      // Eski frontend yapısıyla uyumluluk için bırakıldı
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
