import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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

    let irsaliyeNo = '';
    const irsaliyeMatch = text.match(/ELI\d{16}/);
    if (irsaliyeMatch) irsaliyeNo = irsaliyeMatch[0];

    let cariIsim = '';
    const sayinMatch = text.match(/SAYIN\s*\n([^\n]+)/);
    if (sayinMatch) cariIsim = sayinMatch[1].trim();

    const eanMatches = [...text.matchAll(/\b(\d{13}|WLA\w+)\b/g)];
    const qtyMatches = [...text.matchAll(/\b(\d+)\s+Adet\b/g)];
    const kodoMatches = [...text.matchAll(/\b(\d{7}-\d{5})\b/g)];

    const products = [];
    const count = Math.min(eanMatches.length, qtyMatches.length);

    for (let i = 0; i < count; i++) {
      const ean = eanMatches[i][1];
      const qty = parseInt(qtyMatches[i][1]);
      if (!ean || !qty) continue;

      const malzemeKodu = kodoMatches[i] ? kodoMatches[i][1] : '';

      let urunAdi = '';
      if (malzemeKodu) {
        const idx = text.indexOf(malzemeKodu, (kodoMatches[i-1]?.index || 0) + (i > 0 ? 1 : 0));
        if (idx >= 0) {
          const snippet = text.substring(idx + malzemeKodu.length, idx + malzemeKodu.length + 80);
          urunAdi = snippet.replace(/\s+/g, ' ').trim()
            .replace(/\d{13}.*/, '').replace(/WLA\w+.*/, '')
            .replace(/\d{7}-\d{5}.*/, '').trim().substring(0, 50);
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
