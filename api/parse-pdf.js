import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function validateEAN13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;
  const d = ean.split('').map(Number);
  const sum = d.slice(0,12).reduce((s, x, i) => s + x * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === d[12];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { base64 } = req.body;
  if (!base64) return res.status(400).json({ error: 'base64 gerekli' });

  try {
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);
    const text = data.text;

    // İrsaliye No
    let irsaliyeNo = '';
    const m1 = text.match(/İrsaliye No:([A-Z0-9]+)/);
    if (m1) irsaliyeNo = m1[1];

    // Cari İsim
    let cariIsim = '';
    const m2 = text.match(/SAYIN\s*\n([^\n]+)/);
    if (m2) cariIsim = m2[1].trim();

    // Aynı EAN birden fazla kez gelirse adetleri birleştir
    const eanMap = new Map(); // ean -> toplam adet

    const addToMap = (ean, qty) => {
      if (qty > 0 && qty < 10000) {
        eanMap.set(ean, (eanMap.get(ean) || 0) + qty);
      }
    };

    // Strateji 1: EAN ve adet arasında boşluk var (ayrı hücreler)
    const patternSpace = /(\d{13})\s+(\d{1,4})\s+Adet/g;
    let m;
    while ((m = patternSpace.exec(text)) !== null) {
      const ean = m[1];
      const qty = parseInt(m[2]);
      if (validateEAN13(ean)) addToMap(ean, qty);
    }

    // Strateji 2: EAN ve adet birleşik (aralarında boşluk yok)
    const patternMerged = /(\d{13,18})\s+Adet/g;
    while ((m = patternMerged.exec(text)) !== null) {
      const digits = m[1];
      for (let offset = 0; offset <= Math.min(5, digits.length - 14); offset++) {
        const ean = digits.substring(offset, offset + 13);
        const qtyStr = digits.substring(offset + 13);
        if (qtyStr.length >= 1 && qtyStr.length <= 4 && validateEAN13(ean)) {
          const qty = parseInt(qtyStr);
          // Strateji 1'de zaten eklendiyse çift sayma
          if (!eanMap.has(ean)) addToMap(ean, qty);
          break;
        }
      }
    }

    // WLA kodları (EAN-13 formatında değil)
    const patternWLA = /(WLA[A-Z0-9]{3,8})\s*(\d{1,4})\s+Adet/g;
    while ((m = patternWLA.exec(text)) !== null) {
      const ean = m[1];
      const qty = parseInt(m[2]);
      if (qty > 0 && qty < 10000) addToMap(ean, qty);
    }

    // Map'ten ürün listesi oluştur
    const products = [...eanMap.entries()].map(([ean, beklenen]) => ({ ean, beklenen }));

    res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify({ irsaliyeNo, cariIsim, products }) }]
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
