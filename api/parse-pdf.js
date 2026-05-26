import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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

const WLA_PRODUCTS = {
  WLA4462: 'Wella Kraft Çanta',
  WLA4463: 'Ultimate Repair Kasa Önü Stand Step 4',
  WLA4464: 'Ultimate Repair Kasa Önü Stand Step 5',
  WLA4458: 'Wella Siyah Havlu (50*90) (System.Man)',
  WLA4461: 'Wella Kırmızı Karton Çanta (24*17)',
  WLA4459: 'Wella Kırmızı Havlu (50*90)',
  WLA4460: 'Wella Beyaz Havlu (50*90)',
  WLA4465: 'Ultimate Repair Servis Menüsü Step 4',
  WLA4468: 'Fiyat Listesi Kılıfı',
  WLA4489: 'Wella Siyah Penuar',
  WLA4470: 'Wella Siyah Önlük',
  WLA4469: 'Ultimate Repair Ayaklı Görsel 70X90',
  WLA4466: 'Ultimate Repair Kullanım Kılavuzu Step 4',
  WLA4491: 'Smoothfiller Servis Menüsü',
  WLA4492: 'Smoothfiller Küçük Ayaklı Görsel',
  WLA4493: 'Smoothfiller Teknik Kılavuz Kitapçık',
};

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

function cleanName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/Sıra No Malzeme Kodu Malzeme Açıklaması Satır Açıklaması EAN Code Miktar Birim Fiyat Tutar/gi, '')
    .replace(/Toplam Tutar.*/gi, '')
    .trim();
}

function addProduct(map, product) {
  const ean = String(product.ean || '').trim();
  const malzemeKodu = String(product.malzemeKodu || '').trim();
  const urunAdi = cleanName(product.urunAdi || '');
  const qty = parseInt(product.beklenen, 10);

  if (!qty || qty <= 0 || qty > 10000) return;
  if (ean && !isValidProductEAN(ean)) return;

  const key = ean || malzemeKodu;
  if (!key) return;

  if (map.has(key)) {
    const existing = map.get(key);
    existing.beklenen += qty;

    if (!existing.urunAdi && urunAdi) existing.urunAdi = urunAdi;
    if (!existing.malzemeKodu && malzemeKodu) existing.malzemeKodu = malzemeKodu;

    map.set(key, existing);
    return;
  }

  map.set(key, {
    ean,
    beklenen: qty,
    malzemeKodu,
    urunAdi,
  });
}

function addWlaProductsFromText(map, compact) {
  /*
    WLA ürünlerini regex'e bırakmadan, listedeki her kodu direkt arar.
    Örnek PDF parse çıktıları:
    WLA4462 34 Adet
    WLA446234 Adet
    94401040-00636Wella Kraft ÇantaWLA446234 Adet
  */
  Object.entries(WLA_PRODUCTS).forEach(([code, productName]) => {
    let searchFrom = 0;

    while (true) {
      const index = compact.indexOf(code, searchFrom);
      if (index === -1) break;

      const after = compact.slice(index + code.length, index + code.length + 40);

      const qtyMatch =
        after.match(/^\s*(\d{1,5})\s*Adet\b/i) ||
        after.match(/^(\d{1,5})\s*Adet\b/i);

      if (qtyMatch) {
        addProduct(map, {
          ean: '',
          beklenen: qtyMatch[1],
          malzemeKodu: code,
          urunAdi: productName,
        });
      }

      searchFrom = index + code.length;
    }
  });
}

function extractProducts(text) {
  const map = new Map();

  const compact = text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rowStartPattern = /(?:^|\s)(\d{1,3})(440\d{4}-\d{5})/g;
  const starts = [];
  let m;

  while ((m = rowStartPattern.exec(compact)) !== null) {
    starts.push({
      index: m.index,
      siraNo: parseInt(m[1], 10),
      malzemeKodu: m[2],
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = starts[i + 1]?.index ?? compact.length;
    const rowText = compact.slice(start.index, end).trim();

    if (!start.siraNo || start.siraNo < 1 || start.siraNo > 999) continue;

    const malzemeKodu = start.malzemeKodu;
    const afterMaterial = rowText.slice(rowText.indexOf(malzemeKodu) + malzemeKodu.length).trim();

    const eanPattern = new RegExp(
      `((?:${PREFIX_GROUP})\\d{6})\\s*(\\d{1,5})\\s+Adet\\b`,
      'i'
    );

    const eanMatch = afterMaterial.match(eanPattern);

    if (eanMatch) {
      const ean = eanMatch[1];
      const qty = eanMatch[2];
      const namePart = afterMaterial.slice(0, eanMatch.index).trim();

      addProduct(map, {
        ean,
        beklenen: qty,
        malzemeKodu,
        urunAdi: namePart,
      });
    }
  }

  const fallbackPattern = new RegExp(
    `((?:${PREFIX_GROUP})\\d{6})\\s*(\\d{1,5})\\s+Adet\\b`,
    'gi'
  );

  while ((m = fallbackPattern.exec(compact)) !== null) {
    const ean = m[1];
    const qty = m[2];

    if (!map.has(ean)) {
      addProduct(map, {
        ean,
        beklenen: qty,
        malzemeKodu: '',
        urunAdi: '',
      });
    }
  }

  addWlaProductsFromText(map, compact);

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
        eanCount: [...text.matchAll(/\d{13}/g)].filter(x => isValidProductEAN(x[0])).length,
        wlaCount: [...text.matchAll(/WLA\d{2,8}/gi)].length,
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
