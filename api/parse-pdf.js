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
    res.status(200).json({ rawText: data.text.substring(0, 2000) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
