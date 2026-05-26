import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';

const Card = ({ icon, label, value, sub, color, onClick }) => (
  <div onClick={onClick} style={{ background:'#fff', borderRadius:16, padding:'18px 16px', cursor: onClick?'pointer':'default', border:`2px solid ${color}20`, boxShadow:'0 1px 4px rgba(0,0,0,.06)', transition:'transform .15s', flex:1, minWidth:140 }}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.transform='translateY(-2px)'}}
    onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
    <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
    <p style={{ fontSize:22, fontWeight:800, color:'#0f172a' }}>{value}</p>
    <p style={{ fontSize:13, fontWeight:600, color:'#334155', marginTop:2 }}>{label}</p>
    {sub && <p style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{sub}</p>}
  </div>
);

const ModuleBtn = ({ icon, label, sub, color, onClick }) => (
  <button onClick={onClick} style={{ background:'#fff', border:`1px solid #e2e8f0`, borderRadius:16, padding:'18px 14px', textAlign:'left', cursor:'pointer', display:'flex', alignItems:'center', gap:14, width:'100%', transition:'all .15s' }}
    onMouseEnter={e=>{e.currentTarget.style.background=color+'15'; e.currentTarget.style.borderColor=color}}
    onMouseLeave={e=>{e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#e2e8f0'}}>
    <div style={{ width:48, height:48, borderRadius:14, background:color+'20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{icon}</div>
    <div>
      <p style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>{label}</p>
      <p style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{sub}</p>
    </div>
    <span style={{ marginLeft:'auto', color:'#94a3b8' }}>›</span>
  </button>
);

export default function Dashboard({ navigate, profile }) {
  const [stats, setStats] = useState({ siparisler:0, iadeler:0, sayimlar:0, bekleyen:0 });

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date(); today.setHours(0,0,0,0);
        const [s,i,sy,b] = await Promise.all([
          getDocs(query(collection(db,'orders'), where('tarih','>=',Timestamp.fromDate(today)))),
          getDocs(query(collection(db,'returns'), where('tarih','>=',Timestamp.fromDate(today)))),
          getDocs(query(collection(db,'countSessions'), where('baslangic','>=',Timestamp.fromDate(today)))),
          getDocs(query(collection(db,'returns'), where('durum','==','bekliyor'))),
        ]);
        setStats({ siparisler:s.size, iadeler:i.size, sayimlar:sy.size, bekleyen:b.size });
      } catch {}
    };
    load();
  }, []);

  const isAdmin = profile?.role === 'admin';

  return (
    <div style={{ padding:'20px 16px', maxWidth:700, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <p style={{ color:'#64748b', fontSize:13 }}>{new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' })}</p>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', marginTop:2 }}>
          Merhaba, {profile?.name?.split(' ')[0]} 👋
        </h1>
      </div>

      {/* Today stats */}
      <p style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>BUGÜN</p>
      <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
        <Card icon="📋" label="Sipariş" value={stats.siparisler} sub="kontrol" color="#3b82f6" onClick={()=>navigate('siparis')} />
        <Card icon="↩️" label="İade"    value={stats.iadeler}   sub="işlem"  color="#f59e0b" onClick={()=>navigate('iade')} />
        <Card icon="🔢" label="Sayım"   value={stats.sayimlar}  sub="oturum" color="#10b981" onClick={()=>navigate('sayim')} />
        {isAdmin && <Card icon="⏳" label="Onay" value={stats.bekleyen} sub="bekliyor" color="#ef4444" onClick={()=>navigate('yonetici')} />}
      </div>

      {/* Modules */}
      <p style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>MODÜLLER</p>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <ModuleBtn icon="📋" label="Sipariş Kontrol" sub="PDF/Excel yükle, barkod okut, kontrol et" color="#3b82f6" onClick={()=>navigate('siparis')} />
        <ModuleBtn icon="↩️" label="İade Kontrol"    sub="Cari seç, ürünleri okut, nedeni kaydet"   color="#f59e0b" onClick={()=>navigate('iade')} />
        <ModuleBtn icon="🔢" label="Depo Sayımı"     sub="Manuel veya referanslı lokasyon sayımı"   color="#10b981" onClick={()=>navigate('sayim')} />
        <ModuleBtn icon="📊" label="Raporlar"        sub="Geçmiş işlemler ve kargo takip"           color="#6366f1" onClick={()=>navigate('raporlar')} />
        {isAdmin && <ModuleBtn icon="⚙️" label="Yönetici Paneli" sub="Kullanıcılar, ürünler, onaylar" color="#64748b" onClick={()=>navigate('yonetici')} />}
      </div>
    </div>
  );
}
