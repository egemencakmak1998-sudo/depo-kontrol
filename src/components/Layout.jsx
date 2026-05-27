import { useAuth } from '../contexts/AuthContext.jsx';

const NAV = [
  { id:'dashboard', label:'Ana Sayfa',    icon:'🏠' },
  { id:'siparis',   label:'Sipariş',      icon:'📋' },
  { id:'iade',      label:'İade',         icon:'↩️' },
  { id:'sayim',     label:'Sayım',        icon:'🔢' },
  { id:'raporlar',  label:'Raporlar',     icon:'📊' },
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
};

export default function Layout({ page, navigate, profile, children }) {
  const { logout } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const navItems = isAdmin ? [...NAV, { id:'stok', label:'Stok', icon:'📦' }, { id:'yonetici', label:'Yönetici', icon:'⚙️' }] : NAV;

  return (
    <div>
      {/* Desktop sidebar */}
      <div style={C.sidebar} className="desktop-only">
        <div style={C.logo}>
          <p style={{ color:'#f8fafc', fontWeight:700, fontSize:16 }}>📦 Depo Kontrol</p>
          <p style={{ color:'#64748b', fontSize:11, marginTop:3 }}>{profile?.name}</p>
          <p style={{ color:'#475569', fontSize:10 }}>{isAdmin ? '👑 Yönetici' : '👤 Operatör'}</p>
        </div>
        <nav style={{ flex:1, paddingTop:8 }}>
          {navItems.map(n => (
            <button key={n.id} style={C.navItem(page===n.id)} onClick={() => navigate(n.id)}>
              <span style={{ fontSize:16 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding:16, borderTop:'1px solid rgba(255,255,255,.08)' }}>
          <button onClick={logout} style={{ ...C.navItem(false), color:'#ef4444' }}>
            <span>🚪</span> Çıkış Yap
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={C.main} className="desktop-main">
        <div style={{ paddingBottom:70 }}>
          {children}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div style={C.bottomNav} className="mobile-only">
        {navItems.slice(0,5).map(n => (
          <button key={n.id} style={C.bottomItem(page===n.id)} onClick={() => navigate(n.id)}>
            <span style={{ fontSize:20 }}>{n.icon}</span>
            <span>{n.label}</span>
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
