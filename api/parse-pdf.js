import pdfParse from 'pdf-parse/lib/pdf-parse.js';

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

    // Parse irsaliye bilgileri
    let irsaliyeNo = '';
    let cariIsim = '';

    // İrsaliye numarası
    const irsaliyeMatch = text.match(/ELI\d{16}/);
    if (irsaliyeMatch) irsaliyeNo = irsaliyeMatch[0];

    // Cari isim - SAYIN'dan sonraki satır
    const sayinMatch = text.match(/SAYIN\s*\n([^\n]+)/);
    if (sayinMatch) cariIsim = sayinMatch[1].trim();

    // Ürünleri çıkar: EAN kodu + miktar + Adet
    const products = [];
    const pattern = /(\d{10,14}|WLA\w+)\s+(\d+)\s+Adet/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const ean = match[1];
      const qty = parseInt(match[2]);
      if (!ean || !qty) continue;

      // Malzeme kodu (XXXXXXX-XXXXX formatı)
      const before = text.substring(Math.max(0, match.index - 200), match.index);
      const kodoMatch = before.match(/(\d{7}-\d{5})\s+/g);
      const malzemeKodu = kodoMatch ? kodoMatch[kodoMatch.length - 1].trim() : '';

      // Ürün adı
      let urunAdi = '';
      if (malzemeKodu) {
        const kIdx = before.lastIndexOf(malzemeKodu);
        if (kIdx >= 0) {
          urunAdi = before.substring(kIdx + malzemeKodu.length).replace(/\s+/g, ' ').trim();
          urunAdi = urunAdi.replace(/\d{7}-\d{5}/g, '').trim().substring(0, 60);
        }
      }

      products.push({ ean, beklenen: qty, urunAdi, malzemeKodu });
    }

    // Frontend'in beklediği format
    const result = { irsaliyeNo, cariIsim, products };
    res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(result) }]
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
