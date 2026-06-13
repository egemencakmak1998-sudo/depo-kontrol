import { useAuth } from '../contexts/AuthContext.jsx';
import { useDepo } from '../contexts/DepoContext.jsx';

const FULL_NAV = [
  { id:'dashboard', label:'Ana Sayfa',    icon:'🏠' },
  { id:'siparis',   label:'Sipariş',      icon:'📋' },
  { id:'iade',      label:'İade',         icon:'↩️' },
  { id:'sayim',     label:'Sayım',        icon:'🔢' },
  { id:'malkabul',  label:'Mal Kabul',    icon:'📥' },
  { id:'egitim',    label:'Eğitim',       icon:'🎓' },
  { id:'transfer',  label:'Transfer',     icon:'🔄' },
  { id:'raporlar',  label:'Raporlar',     icon:'📊' },
];

const MINI_NAV = [
  { id:'dashboard', label:'Ana Sayfa',    icon:'🏠' },
  { id:'stok',      label:'Stok',         icon:'📦' },
  { id:'egitim',    label:'Eğitim',       icon:'🎓' },
  { id:'transfer',  label:'Transfer',     icon:'🔄' },
];

const C = {
  sidebar: { width:220, background:'#0f172a', minHeight:'100vh', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, zIndex:100 },
  logo: { padding:'20px 16px', borderBottom:'1px solid rgba(255,255,255,.08)' },
  navItem: (active) => ({
    display:'flex', alignItems:'center', gap:10, padding:'11px 16px', margin:'2px 8px',
    borderRadius:10, cursor:'pointer', border:'none', background: active ? 'rgba(59,130,246,.2)' : 'transparent',
    color: active ? '#60a5fa' : '#94a3b8', fontSize:14, fontWeight: active ? 600 : 400,
    width:'calc(100% - 16px)', textAlign:'left',
    borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
  }),
  main: { marginLeft:220, minHeight:'100vh', background:'#f1f5f9' },
  bottomNav: {
    position:'fixed', bottom:0, left:0, right:0, background:'#0f172a',
    display:'flex', zIndex:100, borderTop:'1px solid rgba(255,255,255,.08)',
    paddingBottom:'env(safe-area-inset-bottom)',
  },
  bottomItem: (active) => ({
    flex:1, padding:'8px 4px', display:'flex', flexDirection:'column', alignItems:'center',
    gap:3, border:'none', background:'transparent', cursor:'pointer',
    color: active ? '#60a5fa' : '#64748b', fontSize:10, fontWeight: active?600:400,
  }),
  depoBtn: (active, color) => ({
    flex:1, border: active ? `2px solid ${color}` : '2px solid rgba(255,255,255,.15)',
    borderRadius:8, padding:'7px 4px', cursor:'pointer', textAlign:'center',
    background: active ? color+'22' : 'transparent',
    color: active ? '#f8fafc' : '#64748b', fontSize:11, fontWeight:600,
    transition:'all .15s',
  }),
};

export default function Layout({ page, navigate, profile, children }) {
  const { logout } = useAuth();
  const { selectedDepo, setSelectedDepo, depoInfo, DEPOLAR } = useDepo();
  const isAdmin = profile?.role === 'admin';
  const isFull = depoInfo.full;

  const baseNav = isFull ? FULL_NAV : MINI_NAV;
  const navItems = isAdmin && isFull
    ? [...baseNav, { id:'dosya', label:'Dosya Araçları', icon:'🗂️' }, { id:'stok', label:'Stok', icon:'📦' }, { id:'yonetici', label:'Yönetici', icon:'⚙️' }]
    : isFull
      ? [...baseNav, { id:'stok', label:'Stok', icon:'📦' }]
      : baseNav;

  return (
    <div>
      {/* Desktop sidebar */}
      <div style={C.sidebar} className="desktop-only">
        <div style={C.logo}>
          <p style={{ color:'#f8fafc', fontWeight:700, fontSize:16 }}>📦 Depo Kontrol</p>
          <p style={{ color:'#64748b', fontSize:11, marginTop:3 }}>{profile?.name}</p>
          <p style={{ color:'#475569', fontSize:10 }}>{isAdmin ? '👑 Yönetici' : '👤 Operatör'}</p>
        </div>
        {/* Depo seçici */}
        <div style={{ padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <p style={{ fontSize:9, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:1.5, marginBottom:6 }}>Aktif Depo</p>
          <div style={{ display:'flex', gap:4 }}>
            {DEPOLAR.map(d => (
              <button key={d.id} style={C.depoBtn(selectedDepo===d.id, d.color)}
                onClick={() => { setSelectedDepo(d.id); navigate('dashboard'); }}>
                <span style={{ fontSize:12, display:'block', marginBottom:1 }}>{d.icon}</span>
                <span style={{ fontSize:10 }}>{d.short}</span>
              </button>
            ))}
          </div>
        </div>
        <nav style={{ flex:1, paddingTop:8, overflowY:'auto' }}>
          {navItems.map(n => (
            <button key={n.id} style={C.navItem(page===n.id)} onClick={() => navigate(n.id)}>
              <span style={{ fontSize:16 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding:16, borderTop:'1px solid rgba(255,255,255,.08)', flexShrink:0 }}>
          <button onClick={logout} style={{ ...C.navItem(false), color:'#ef4444' }}>
            <span>🚪</span> Çıkış Yap
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={C.main} className="desktop-main">
        {/* Mobil depo göstergesi */}
        <div className="mobile-only" style={{ background:depoInfo.color, padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>{depoInfo.icon}</span>
            <p style={{ color:'#fff', fontWeight:700, fontSize:13 }}>{depoInfo.label}</p>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {DEPOLAR.map(d => (
              <button key={d.id} onClick={() => { setSelectedDepo(d.id); navigate('dashboard'); }}
                style={{ border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                  background: selectedDepo===d.id ? '#fff' : 'rgba(255,255,255,.2)',
                  color: selectedDepo===d.id ? d.color : '#fff' }}>
                {d.short}
              </button>
            ))}
          </div>
        </div>
        <div style={{ paddingBottom:70 }}>
          {children}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div style={C.bottomNav} className="mobile-only">
        {navItems.map(n => (
          <button key={n.id} style={{...C.bottomItem(page===n.id), padding:navItems.length>5?'6px 2px':'8px 6px', minWidth:0, flex:1}} onClick={() => navigate(n.id)}>
            <span style={{ fontSize:navItems.length>5?16:20 }}>{n.icon}</span>
            <span style={{ fontSize:navItems.length>5?9:11, marginTop:1 }}>{n.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @media (min-width: 768px) {
          .mobile-only { display: none !important; }
          .desktop-only { display: flex !important; }
          .desktop-main { margin-left: 220px !important; }
        }
        @media (max-width: 767px) {
          .desktop-only { display: none !important; }
          .desktop-main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
