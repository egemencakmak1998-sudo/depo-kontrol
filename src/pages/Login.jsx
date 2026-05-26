import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]   = useState('');
  const [pass,  setPass]    = useState('');
  const [err,   setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try { await login(email, pass); }
    catch { setErr('E-posta veya şifre hatalı.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#0f172a 0%,#1e3a5f 60%,#0f172a 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:56, marginBottom:12 }}>📦</div>
          <h1 style={{ color:'#f8fafc', fontSize:24, fontWeight:700 }}>Depo Kontrol</h1>
          <p style={{ color:'#64748b', fontSize:14, marginTop:6 }}>Hesabınıza giriş yapın</p>
        </div>
        <form onSubmit={handle} style={{ background:'rgba(255,255,255,.05)', borderRadius:20, padding:24, border:'1px solid rgba(255,255,255,.1)' }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ color:'#94a3b8', fontSize:12, fontWeight:600, display:'block', marginBottom:6 }}>E-POSTA</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
              style={{ width:'100%', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', borderRadius:10, padding:'12px 14px', color:'#f8fafc', fontSize:14, outline:'none' }}
              placeholder="ornek@firma.com" />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ color:'#94a3b8', fontSize:12, fontWeight:600, display:'block', marginBottom:6 }}>ŞİFRE</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} required
              style={{ width:'100%', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', borderRadius:10, padding:'12px 14px', color:'#f8fafc', fontSize:14, outline:'none' }}
              placeholder="••••••••" />
          </div>
          {err && <p style={{ color:'#f87171', fontSize:13, marginBottom:14, textAlign:'center' }}>{err}</p>}
          <button type="submit" disabled={loading} style={{ width:'100%', background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', borderRadius:12, padding:'13px', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', opacity: loading?0.7:1 }}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
        <p style={{ color:'#334155', fontSize:12, textAlign:'center', marginTop:20 }}>
          Hesap oluşturmak için yöneticiyle iletişime geçin.
        </p>
      </div>
    </div>
  );
}
