import { createContext, useContext, useState, useEffect } from 'react';

export const DEPOLAR = [
  { id: 'tuzla', label: 'Tuzla Depo', short: 'Tuzla', color: '#1e40af', icon: '🏭', full: true },
  { id: 'esatpasa', label: 'Esatpaşa Depo', short: 'Esatpaşa', color: '#7c3aed', icon: '🏢', full: false },
  { id: 'emaar', label: 'Emaar Depo', short: 'Emaar', color: '#0d9488', icon: '🏬', full: false },
];

export const DEPO_MAP = Object.fromEntries(DEPOLAR.map(d => [d.id, d]));

/* Tuzla = ana depo, mevcut stock/{ean} dokümanları Tuzla'ya ait.
   Yan depolar stock/{depoId}_{ean} formatını kullanır. */
export const stokDocId = (depoId, ean) => depoId === 'tuzla' ? ean : `${depoId}_${ean}`;
export const isMainDepo = (depoId) => depoId === 'tuzla';

const DepoContext = createContext();

export function DepoProvider({ children }) {
  const [selectedDepo, setSelectedDepo] = useState(() => {
    try { return localStorage.getItem('depoKontrol:selectedDepo') || 'tuzla'; } catch { return 'tuzla'; }
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
