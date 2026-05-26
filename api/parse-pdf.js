import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// EAN-13 checksum doğrulama
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
    const irsNoMatch = text.match(/İrsaliye No:([A-Z0-9]+)/);
    if (irsNoMatch) irsaliyeNo = irsNoMatch[1];

    // Cari İsim
    let cariIsim = '';
    const sayinMatch = text.match(/SAYIN\s*\n([^\n]+)/);
    if (sayinMatch) cariIsim = sayinMatch[1].trim();

    const products = [];

    // Rakam dizisi + " Adet" → EAN (13 hane, checksum ile doğru olanı bul) + adet
    // Açıklama sondaki rakamlar EAN'a yapışabiliyor, checksum ile doğru olanı buluyoruz
    const digitPattern = /(\d{13,18})\s+Adet/g;
    let match;
    while ((match = digitPattern.exec(text)) !== null) {
      const digits = match[1];
      let found = false;

      // Farklı offset'lerle EAN bulmayı dene (0-5 baştaki rakam atla)
      for (let offset = 0; offset <= Math.min(5, digits.length - 14); offset++) {
        const ean = digits.substring(offset, offset + 13);
        const qtyStr = digits.substring(offset + 13);
        if (qtyStr.length >= 1 && qtyStr.length <= 4 && validateEAN13(ean)) {
          const qty = parseInt(qtyStr);
          if (qty > 0 && qty < 10000) {
            // Malzeme kodu
            const before = text.substring(Math.max(0, match.index - 200), match.index);
            const kodoMatches = before.match(/\d{7}-\d{5}/g);
            const malzemeKodu = kodoMatches ? kodoMatches[kodoMatches.length - 1] : '';

            // Ürün adı
            let urunAdi = '';
            if (malzemeKodu) {
              const kIdx = before.lastIndexOf(malzemeKodu);
              if (kIdx >= 0) {
                urunAdi = before.substring(kIdx + malzemeKodu.length)
                  .replace(/\s+/g, ' ').trim()
                  .replace(/^\d+\s*/, '').trim()
                  .substring(0, 50);
              }
            }

            products.push({ ean, beklenen: qty, urunAdi, malzemeKodu });
            found = true;
            break;
          }
        }
      }
    }

    // WLA kodları (EAN-13 formatında değil)
    const wlaPattern = /(WLA[A-Z0-9]{3,8})(\d{1,4})\s+Adet/g;
    while ((match = wlaPattern.exec(text)) !== null) {
      const ean = match[1];
      const qty = parseInt(match[2]);
      if (!ean || !qty) continue;
      const before = text.substring(Math.max(0, match.index - 200), match.index);
      const kodoMatches = before.match(/\d{7}-\d{5}/g);
      const malzemeKodu = kodoMatches ? kodoMatches[kodoMatches.length - 1] : '';
      let urunAdi = '';
      if (malzemeKodu) {
        const kIdx = before.lastIndexOf(malzemeKodu);
        if (kIdx >= 0) {
          urunAdi = before.substring(kIdx + malzemeKodu.length)
            .replace(/\s+/g, ' ').trim().replace(/^\d+\s*/, '').trim().substring(0, 50);
        }
      }
      products.push({ ean, beklenen: qty, urunAdi, malzemeKodu });
    }

    const result = { irsaliyeNo, cariIsim, products };
    res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(result) }]
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
