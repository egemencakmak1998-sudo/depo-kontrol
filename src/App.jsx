import { useState } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import SiparisKontrol from './pages/SiparisKontrol.jsx';
import IadeKontrol from './pages/IadeKontrol.jsx';
import DepoSayimi from './pages/DepoSayimi.jsx';
import Raporlar from './pages/Raporlar.jsx';
import YoneticiPanel from './pages/YoneticiPanel.jsx';
import Stok from './pages/Stok.jsx';
import MalKabul from './pages/MalKabul.jsx';
import Layout from './components/Layout.jsx';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState({});

  const navigate = (p, params = {}) => { setPage(p); setPageParams(params); };

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
        <p style={{ color:'#94a3b8', fontSize:14 }}>Yükleniyor...</p>
      </div>
    </div>
  );

  if (!user) return <Login />;

  const pages = { dashboard: Dashboard, siparis: SiparisKontrol, iade: IadeKontrol, sayim: DepoSayimi, malkabul: MalKabul, raporlar: Raporlar, stok: Stok, yonetici: YoneticiPanel };
  const PageComponent = pages[page] || Dashboard;

  return (
    <Layout page={page} navigate={navigate} profile={profile}>
      <PageComponent navigate={navigate} params={pageParams} profile={profile} />
    </Layout>
  );
}

