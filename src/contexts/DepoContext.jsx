import { createContext, useContext, useState, useEffect } from 'react';

export const DEPOLAR = [
  { id: 'esatpasa', label: 'Esatpaşa Depo', short: 'Esatpaşa', color: '#1e40af', icon: '🏭' },
  { id: 'emaar', label: 'Emaar Depo', short: 'Emaar', color: '#7c3aed', icon: '🏢' },
];

export const DEPO_MAP = Object.fromEntries(DEPOLAR.map(d => [d.id, d]));

/* Stock doc ID = depoId_ean (her depoda ayrı stok) */
export const stokDocId = (depoId, ean) => `${depoId}_${ean}`;

const DepoContext = createContext();

export function DepoProvider({ children }) {
  const [selectedDepo, setSelectedDepo] = useState(() => {
    try { return localStorage.getItem('depoKontrol:selectedDepo') || 'esatpasa'; } catch { return 'esatpasa'; }
  });

  useEffect(() => {
    try { localStorage.setItem('depoKontrol:selectedDepo', selectedDepo); } catch {}
  }, [selectedDepo]);

  const depoInfo = DEPO_MAP[selectedDepo] || DEPOLAR[0];

  return (
    <DepoContext.Provider value={{ selectedDepo, setSelectedDepo, depoInfo, DEPOLAR }}>
      {children}
    </DepoContext.Provider>
  );
}

export function useDepo() {
  const ctx = useContext(DepoContext);
  if (!ctx) throw new Error('useDepo must be used inside DepoProvider');
  return ctx;
}
