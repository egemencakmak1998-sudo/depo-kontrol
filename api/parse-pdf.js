import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/*
  Ürün master dosyana göre geçerli EAN başlangıçları.
  Hepsi 7 haneli prefix olarak tutuluyor.
*/
const VALID_EAN_PREFIXES = [
  '4064666',
  '8005610',
  '4068359',
  '5056668',
  '5060829',
  '5060777',
  '5060356',
  '5060760',
  '4056800',
  '3614228',
  '5060703',
  '5060569',
  '3614227',
  '4084500',
  '3614226',
  '3614229',
];

const PREFIX_GROUP = VALID_EAN_PREFIXES.join('|');

function isValidProductEAN(ean) {
  const value = String(ean || '').trim();

  if (!/^\d{13}$/.test(value)) return false;

  return VALID_EAN_PREFIXES.some(prefix => value.startsWith(prefix));
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

function addProduct(map, product) {
  const ean = String(product.ean || '').trim();
  const qty = parseInt(product.beklenen, 10);

  if (!isValidProductEAN(ean)) return;
  if (!qty || qty <= 0 || qty > 10000) return;

  /*
    Aynı EAN iki farklı yöntemle yakalanırsa adetleri toplama.
    Aksi halde 24 olan ürün 48 görünebilir.
  */
  if (map.has(ean)) {
    const existing = map.get(ean);

    if (!existing.urunAdi && product.urunAdi) {
      existing.urunAdi = product.urunAdi;
    }

    if (!existing.malzemeKodu && product.malzemeKodu) {
      existing.malzemeKodu = product.malzemeKodu;
    }

    map.set(ean, existing);
    return;
  }

  map.set(ean, {
    ean,
    beklenen: qty,
    malzemeKodu: product.malzemeKodu || '',
    urunAdi: product.urunAdi || '',
  });
}

function extractProducts(text) {
  const map = new Map();

  /*
    1. Yöntem:
    Normal formatı yakalar:
    4068359081183 24 Adet
  */
  const spacedPattern = new RegExp(
    `((?:${PREFIX_GROUP})\\d{6})\\s+(\\d{1,5})\\s+Adet\\b`,
    'gi'
  );

  let match;

  while ((match = spacedPattern.exec(text)) !== null) {
    addProduct(map, {
      ean: match[1],
      beklenen: match[2],
      malzemeKodu: '',
      urunAdi: '',
    });
  }

  /*
    2. Yöntem:
    PDF boşluğu silerse şu formatı yakalar:
    406466684673612 Adet

    Burada:
    4064666846736 = 13 haneli EAN
    12 = miktar
  */
  const compactPattern = new RegExp(
    `((?:${PREFIX_GROUP})\\d{6})(\\d{1,5})\\s+Adet\\b`,
    'gi'
  );

  while ((match = compactPattern.exec(text)) !== null) {
    addProduct(map, {
      ean: match[1],
      beklenen: match[2],
      malzemeKodu: '',
      urunAdi: '',
    });
  }

  /*
    3. Yöntem:
    Metni tek satıra indirip tekrar dener.
    Bazı PDF'lerde satır kırılımları EAN ile adet arasına giriyor.
  */
  const compactText = text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const compactTextPattern = new RegExp(
    `((?:${PREFIX_GROUP})\\d{6})\\s*(\\d{1,5})\\s+Adet\\b`,
    'gi'
  );

  while ((match = compactTextPattern.exec(compactText)) !== null) {
    addProduct(map, {
      ean: match[1],
      beklenen: match[2],
      malzemeKodu: '',
      urunAdi: '',
    });
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
      debug: {
        textLength: text.length,
        eanCount: [...text.matchAll(/\d{13}/g)].filter(m => isValidProductEAN(m[0])).length,
        productCount: products.length,
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
