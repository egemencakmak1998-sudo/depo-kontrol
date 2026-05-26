import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/*
  Ürün master dosyana göre geçerli EAN başlangıçları.
  Böylece TCKN, belge no, tarih, telefon vb. 13 haneli sayılar ürün sanılmaz.
*/
const VALID_EAN_PREFIXES = [
  // Çok sık geçen ana prefixler
  '4064666',
  '8005610',
  '4068359',
  '5056668',

  // Az geçen ama gerçek ürün prefixleri
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

function cleanName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/Sıra No Malzeme Kodu Malzeme Açıklaması Satır Açıklaması EAN Code Miktar Birim Fiyat Tutar/gi, '')
    .trim();
}

function addProduct(map, product) {
  const ean = String(product.ean || '').trim();
  const qty = parseInt(product.beklenen, 10);

  if (!isValidProductEAN(ean)) return;
  if (!qty || qty <= 0 || qty > 10000) return;

  /*
    Aynı EAN farklı yakalama yöntemleriyle tekrar bulunursa adetleri toplama.
    Aksi halde 24 adet olan ürün 48 görünebilir.
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
    PDF tablo satırlarını tek satıra yaklaştırıyoruz.
    Ürün adı içinde 7/71, 5/0, 6/05 gibi boya kodları olsa bile bozmaz.
  */
  const compact = text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /*
    Ana strateji:
    Sıra No + Malzeme Kodu + Ürün Adı + EAN + Miktar + Adet

    Örnek:
    1 4401010-00078 Ct Deep Brown 7/71 4064666846736 12 Adet
    2 4401010-00021 Ct Pure Natural 5/0 4064666900872 3 Adet
  */
  const rowPattern =
    /(?:^|\s)(\d{1,3})\s+([0-9A-Z]{4,}-[0-9A-Z-]{3,})\s+(.{0,250}?)\s+(\d{13})\s+(\d{1,5})\s+Adet\b/gi;

  let match;

  while ((match = rowPattern.exec(compact)) !== null) {
    const siraNo = parseInt(match[1], 10);

    if (!siraNo || siraNo < 1 || siraNo > 999) continue;

    addProduct(map, {
      malzemeKodu: match[2],
      urunAdi: cleanName(match[3]),
      ean: match[4],
      beklenen: match[5],
    });
  }

  /*
    Fallback:
    Satır yapısı bozulursa sadece EAN + miktar + Adet yakala.
    Ürün adı sonra frontend tarafında Firebase products tablosundan tamamlanıyor.
  */
  const eanQtyPattern = /(\d{13})\s+(\d{1,5})\s+Adet\b/gi;

  while ((match = eanQtyPattern.exec(text)) !== null) {
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

      /*
        Eski frontend formatıyla uyumluluk için bırakıldı.
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
