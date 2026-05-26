import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/*
  Ürün master dosyana göre geçerli EAN başlangıçları.
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

  /*
    EAN varsa EAN ile takip et.
    EAN yoksa WLA4462 gibi ürün kodunu key olarak kullan.
  */
  if (ean && !isValidProductEAN(ean)) return;

  const key = ean || malzemeKodu;
  if (!key) return;

  if (map.has(key)) {
    const existing = map.get(key);

    /*
      Aynı ürün irsaliyede iki kere varsa adetleri topla.
      Örn:
      4064666579931 9 Adet
      4064666579931 9 Adet
      => 18 Adet
    */
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

function extractProducts(text) {
  const map = new Map();

  /*
    PDF kolonları bazen birleşik geliyor:
    14401010-00588Ultimate Repair Shampoo 250 ML406466657991718 Adet

    Bu yüzden satırları ürün başlangıcına göre bölüyoruz:
    SıraNo + 440....-..... malzeme kodu
  */
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
      full: m[0],
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

    /*
      1) EAN'li ürünler.
      Hem boşluklu hem bitişik formatı yakalar:

      4068359081183 18 Adet
      40646665799319 Adet
    */
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

      continue;
    }

    /*
      2) EAN'siz ama ürün kodlu satırlar.
      Örn:
      Wella Kraft Çanta WLA4462 34 Adet

      Bu ürün manuel kontrol edilecek.
    */
    const codePattern = /\b([A-Z]{2,5}\d{2,8})\s+(\d{1,5})\s+Adet\b/i;
    const codeMatch = afterMaterial.match(codePattern);

    if (codeMatch) {
      const code = codeMatch[1];
      const qty = codeMatch[2];
      const namePart = afterMaterial.slice(0, codeMatch.index).trim();

      addProduct(map, {
        ean: '',
        beklenen: qty,
        malzemeKodu: code,
        urunAdi: namePart || code,
      });

      continue;
    }
  }

  /*
    Fallback:
    Eğer satır bölme başarısız olursa EAN + adet üzerinden ürün yakala.
    Burada mevcut EAN varsa tekrar toplama yapmıyoruz; çünkü ana parser zaten topladı.
  */
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
