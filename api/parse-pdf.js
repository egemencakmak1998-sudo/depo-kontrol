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

    const products = [];
    const pattern = /(\d{10,14}|WLA\w+)\s+(\d+)\s+Adet/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const ean = match[1];
      const qty = parseInt(match[2]);
      if (!ean || !qty) continue;

      const before = text.substring(Math.max(0, match.index - 300), match.index);
      const kodoMatches = before.match(/\d{7}-\d{5}/g);
      const malzemeKodu = kodoMatches ? kodoMatches[kodoMatches.length - 1] : '';

      let urunAdi = '';
      if (malzemeKodu) {
        const kIdx = before.lastIndexOf(malzemeKodu);
        if (kIdx >= 0) {
          urunAdi = before.substring(kIdx + malzemeKodu.length)
            .replace(/\s+/g, ' ').trim().substring(0, 60);
        }
      }

      products.push({ ean, beklenen: qty, urunAdi, malzemeKodu });
    }

    const result = { irsaliyeNo, cariIsim, products };
    res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(result) }]
    });

  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack?.substring(0, 200) });
  }
}
