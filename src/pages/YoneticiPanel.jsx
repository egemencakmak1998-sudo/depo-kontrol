import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, Timestamp, writeBatch, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import * as XLSX from 'xlsx';

function Toast({ msg, type, onDone }) {
  const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return <div style={{position:'fixed',top:16,left:'50%',transform:'translateX(-50%)',background:bg[type]||'#334155',color:'#fff',padding:'10px 20px',borderRadius:16,fontSize:13,fontWeight:600,zIndex:9999,maxWidth:'88vw',textAlign:'center'}}>{msg}</div>;
}

const Btn=(({label,color='#3b82f6',onClick,disabled,small})=>(
  <button onClick={onClick} disabled={disabled} style={{background:color,border:'none',color:'#fff',padding:small?'7px 12px':'11px 18px',borderRadius:10,fontWeight:700,fontSize:small?11:13,cursor:'pointer',opacity:disabled?.6:1}}>{label}</button>
));

/* ── KULLANICILAR ────────────────────────────────────── */
function Kullanicilar() {
  const [users, setUsers]   = useState([]);
  const [form, setForm]     = useState({ name:'', email:'', pass:'', role:'operator' });
  const [adding, setAdding] = useState(false);
  const [show, setShow]     = useState(false);
  const [toast, setToast]   = useState(null);
  const toast$ = (msg,type='info')=>setToast({msg,type,id:Date.now()});

  const load = async () => {
    const snap = await getDocs(collection(db,'users'));
    setUsers(snap.docs.map(d=>({id:d.id,...d.data()})));
  };
  useEffect(()=>{load();},[]);

  const handleAdd = async () => {
    if (!form.name||!form.email||!form.pass){toast$('Tüm alanları doldurun','error');return;}
    setAdding(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.pass);
      await addDoc(collection(db,'users'), { uid:cred.user.uid, name:form.name, email:form.email, role:form.role, createdAt:Timestamp.now() });
      toast$('Kullanıcı oluşturuldu ✓','success');
      setForm({name:'',email:'',pass:'',role:'operator'}); setShow(false); load();
    }catch(e){toast$('Hata: '+e.message,'error');}
    finally{setAdding(false);}
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <p style={{fontWeight:700,color:'#0f172a',fontSize:15}}>👥 Kullanıcılar ({users.length})</p>
        <Btn label="+ Ekle" onClick={()=>setShow(true)} small />
      </div>
      {show&&(
        <div style={{background:'#f8fafc',borderRadius:14,padding:16,border:'1px solid #e2e8f0',marginBottom:14}}>
          {[{k:'name',ph:'Ad Soyad'},{k:'email',ph:'E-posta'},{k:'pass',ph:'Şifre (min 6 karakter)',type:'password'}].map(({k,ph,type})=>(
            <input key={k} type={type||'text'} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',marginBottom:8}} onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
          ))}
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            {[{v:'operator',l:'Operatör'},{v:'admin',l:'Yönetici'}].map(({v,l})=>(
              <button key={v} onClick={()=>setForm(p=>({...p,role:v}))} style={{flex:1,padding:'8px',borderRadius:10,border:`2px solid ${form.role===v?'#3b82f6':'#e2e8f0'}`,background:form.role===v?'#eff6ff':'#fff',cursor:'pointer',fontWeight:600,fontSize:13,color:form.role===v?'#2563eb':'#64748b'}}>{l}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setShow(false)} style={{flex:1,padding:'10px',borderRadius:10,border:'2px solid #e2e8f0',background:'#fff',cursor:'pointer',color:'#64748b',fontWeight:600}}>İptal</button>
            <button onClick={handleAdd} disabled={adding} style={{flex:2,padding:'10px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',cursor:'pointer',fontWeight:700}}>{adding?'Oluşturuluyor...':'Kullanıcı Oluştur'}</button>
          </div>
        </div>
      )}
      {users.map(u=>(
        <div key={u.id} style={{background:'#fff',borderRadius:12,padding:'12px 14px',marginBottom:8,border:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:38,height:38,borderRadius:10,background:u.role==='admin'?'#fef3c7':'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{u.role==='admin'?'👑':'👤'}</div>
          <div style={{flex:1}}>
            <p style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{u.name}</p>
            <p style={{fontSize:11,color:'#94a3b8'}}>{u.email} · {u.role==='admin'?'Yönetici':'Operatör'}</p>
          </div>
        </div>
      ))}
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── ÜRÜNLER ─────────────────────────────────────────── */
function Urunler() {
  const [products, setProducts] = useState([]);
  const [search, setSearch]     = useState('');
  const [importing, setImp]     = useState(false);
  const [toast, setToast]       = useState(null);
  const [editingLoc, setEditingLoc] = useState(null);
  const [locValue, setLocValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState({ urunAdi:'', ean:'', malzemeKodu:'' });
  const toast$ = (msg,type='info')=>setToast({msg,type,id:Date.now()});

  const load = async () => {
    const snap=await getDocs(query(collection(db,'products'),orderBy('urunAdi')));
    setProducts(snap.docs.map(d=>({id:d.id,...d.data()})));
  };
  useEffect(()=>{load();},[]);

  const addManualProduct = async () => {
    const urunAdi = manualForm.urunAdi.trim();
    const ean = manualForm.ean.trim();
    const malzemeKodu = manualForm.malzemeKodu.trim().toUpperCase();

    if (!urunAdi || !ean || !malzemeKodu) {
      toast$('Ürün adı, EAN ve malzeme kodu zorunlu','error');
      return;
    }

    setSavingManual(true);
    try {
      const eanSnap = await getDocs(query(collection(db,'products'), where('ean','==',ean)));
      if (!eanSnap.empty) {
        toast$('Bu EAN ile kayıtlı ürün zaten var','warning');
        setSavingManual(false);
        return;
      }

      const codeSnap = await getDocs(query(collection(db,'products'), where('malzemeKodu','==',malzemeKodu)));
      if (!codeSnap.empty) {
        toast$('Bu malzeme kodu ile kayıtlı ürün zaten var','warning');
        setSavingManual(false);
        return;
      }

      await addDoc(collection(db,'products'), {
        urunAdi,
        ean,
        malzemeKodu,
        birim: 'Adet',
        locations: ['BELIRLENECEK'],
        lokasyon: 'BELIRLENECEK',
        lokasyonDurumu: 'atanmadi',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      toast$('Ürün manuel olarak eklendi ✓','success');
      setManualForm({ urunAdi:'', ean:'', malzemeKodu:'' });
      setShowManual(false);
      load();
    } catch(e) {
      toast$('Hata: '+e.message,'error');
    } finally {
      setSavingManual(false);
    }
  };

  const importExcel = async (file) => {
    setImp(true);
    try {
      const reader=new FileReader();
      reader.onload=async({target:{result}})=>{
        try {
          const wb=XLSX.read(new Uint8Array(result),{type:'array'});
          const ws=wb.Sheets[wb.SheetNames[0]];
          const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          let hIdx=-1,cEan=-1,cCode=-1,cDesc=-1,cBirim=-1,cLok=-1;
          for(let r=0;r<Math.min(rows.length,20);r++){
            const cells=rows[r].map(c=>String(c).toLowerCase().replace(/\s+/g,' ').trim());
            let eF=false;
            cells.forEach((cell,j)=>{
              if(/ean|barkod|barcode/.test(cell)){cEan=j;eF=true;}
              if(/(malzeme|stok|ürün|item)\s*(kodu?|code?)/.test(cell)&&cCode<0) cCode=j;
              if(/açıklama|aciklama|description|ürün ad/.test(cell)&&cDesc<0) cDesc=j;
              if(/birim|unit/.test(cell)&&cBirim<0) cBirim=j;
              if(/lokasyon|location/.test(cell)&&cLok<0) cLok=j;
            });
            if(eF){hIdx=r;break;}
          }
          if(hIdx<0){toast$('EAN sütunu bulunamadı','error');setImp(false);return;}

          // Mevcut ürünleri EAN'a göre eşleştir (güncelleme için)
          const existingSnap=await getDocs(collection(db,'products'));
          const eanToDocId={};
          const existingByEan={};
          existingSnap.docs.forEach(d=>{
            const data=d.data();
            if(data.ean){
              const key=String(data.ean).trim();
              eanToDocId[key]=d.id;
              existingByEan[key]=data;
            }
          });

          const batch=writeBatch(db);
          let created=0, updated=0;
          rows.slice(hIdx+1).forEach(row=>{
            const ean=String(row[cEan]||'').trim();
            if(!ean) return;

            // Lokasyon: virgülle ayrılmış string → array. Boşsa mevcut lokasyonu koru, yoksa BELIRLENECEK ata.
            const lokStr=cLok>=0?String(row[cLok]||'').trim():'';
            const parsedLocations=lokStr
              ? lokStr.split(',').map(l=>l.trim().toUpperCase()).filter(Boolean)
              : [];
            const existingLocations=Array.isArray(existingByEan[ean]?.locations)
              ? existingByEan[ean].locations.filter(Boolean)
              : [];
            const locations=parsedLocations.length
              ? parsedLocations
              : (existingLocations.length ? existingLocations : ['BELIRLENECEK']);
            const primaryLocation=locations[0] || 'BELIRLENECEK';
            const lokasyonDurumu=locations.some(l=>l && l !== 'BELIRLENECEK') ? 'atandi' : 'atanmadi';

            const data={
              ean,
              malzemeKodu:cCode>=0?String(row[cCode]||'').trim():'',
              urunAdi:cDesc>=0?String(row[cDesc]||'').trim():'',
              birim:cBirim>=0?String(row[cBirim]||'Adet').trim():'Adet',
              locations,
              lokasyon:primaryLocation,
              lokasyonDurumu,
              updatedAt: Timestamp.now(),
            };

            if(eanToDocId[ean]){
              // Mevcut ürünü güncelle
              batch.update(doc(db,'products',eanToDocId[ean]), data);
              updated++;
            } else {
              // Yeni ürün oluştur
              batch.set(doc(collection(db,'products')), { ...data, createdAt: Timestamp.now() });
              created++;
            }
          });
          await batch.commit();
          toast$(`${created} yeni, ${updated} güncellendi ✓`,'success');
          load();
        }catch(e){toast$('Hata: '+e.message,'error');}
        finally{setImp(false);}
      };
      reader.readAsArrayBuffer(file);
    }catch{setImp(false);}
  };

  const getLocations = (p) => Array.isArray(p.locations) && p.locations.length ? p.locations : [p.lokasyon || 'BELIRLENECEK'];
  const getLocationText = (p) => getLocations(p).join(' · ');

  const saveLocation = async () => {
    if (!editingLoc) return;
    const locations = locValue.split(',').map(l=>l.trim().toUpperCase()).filter(Boolean);
    const finalLocations = locations.length ? locations : ['BELIRLENECEK'];
    const lokasyonDurumu = finalLocations.some(l=>l && l !== 'BELIRLENECEK') ? 'atandi' : 'atanmadi';
    const yeniAd = nameValue.trim();
    if (!yeniAd) { toast$('Ürün adı boş olamaz','error'); return; }
    try {
      const now = Timestamp.now();
      // 1) Ürün kaydını güncelle (ad + lokasyon)
      await updateDoc(doc(db,'products',editingLoc.id), {
        urunAdi: yeniAd,
        locations: finalLocations,
        lokasyon: finalLocations[0],
        lokasyonDurumu,
        updatedAt: now,
      });
      const ean = editingLoc.ean;
      // 2) Ad değiştiyse stok ve geçmiş hareketlerde de güncelle
      if (ean && yeniAd !== (editingLoc.urunAdi||'')) {
        // stock/{ean}
        try {
          const sRef = doc(db,'stock',ean);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) await updateDoc(sRef, { urunAdi: yeniAd });
        } catch {}
        // stockMovements (geçmiş hareketler) — batch
        try {
          const movSnap = await getDocs(query(collection(db,'stockMovements'), where('ean','==',ean)));
          if (!movSnap.empty) {
            const chunks = [];
            const docs = movSnap.docs;
            for (let i=0;i<docs.length;i+=400) chunks.push(docs.slice(i,i+400));
            for (const chunk of chunks) {
              const b = writeBatch(db);
              chunk.forEach(d => b.update(d.ref, { urunAdi: yeniAd }));
              await b.commit();
            }
          }
        } catch {}
      }
      toast$('Ürün güncellendi ✓','success');
      setEditingLoc(null);
      setLocValue('');
      setNameValue('');
      load();
    } catch(e) { toast$('Hata: '+e.message,'error'); }
  };

  const filtered=products.filter(p=>
    p.urunAdi?.toLowerCase().includes(search.toLowerCase())||
    p.ean?.includes(search)||
    p.malzemeKodu?.toLowerCase().includes(search.toLowerCase())||
    getLocationText(p).toLowerCase().includes(search.toLowerCase())
  ).slice(0,50);

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <p style={{fontWeight:700,color:'#0f172a',fontSize:15}}>📦 Ürünler ({products.length})</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowManual(true)} style={{background:'linear-gradient(135deg,#10b981,#059669)',color:'#fff',padding:'7px 12px',borderRadius:10,fontSize:11,fontWeight:700,cursor:'pointer',border:'none'}}>
            ➕ Manuel Ürün
          </button>
          <label style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',padding:'7px 12px',borderRadius:10,fontSize:11,fontWeight:700,cursor:'pointer'}}>
            {importing?'Yükleniyor...':'📥 Excel Yükle'}
            <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>importExcel(e.target.files[0])} disabled={importing} />
          </label>
        </div>
      </div>
      <div style={{background:'#f8fafc',borderRadius:12,padding:'8px 12px',border:'1px solid #e2e8f0',marginBottom:12,fontSize:12,color:'#64748b'}}>
        <p>Excel formatı: <b>EAN Kodu · Malzeme Kodu · Ürün Adı · Birim</b> <span style={{color:'#94a3b8'}}>· Lokasyon opsiyonel, boşsa BELIRLENECEK atanır</span></p>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ürün adı, EAN veya kod ile ara..." style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',marginBottom:12}} onFocus={e=>e.target.style.borderColor='#3b82f6'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
      {filtered.map(p=>(
        <div key={p.id} style={{background:'#fff',borderRadius:10,padding:'10px 12px',marginBottom:6,border:'1px solid #e2e8f0',display:'flex',gap:10,alignItems:'center'}}>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:13,fontWeight:600,color:'#0f172a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.urunAdi||'—'}</p>
            <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{p.malzemeKodu}{p.malzemeKodu?' · ':''}{p.ean}</p>
            <p style={{fontSize:10,color:p.lokasyonDurumu==='atanmadi'?'#f59e0b':'#64748b',fontFamily:'monospace',marginTop:3}}>📍 {getLocationText(p)}</p>
          </div>
          <button onClick={()=>{setEditingLoc(p);setLocValue(getLocations(p).filter(l=>l!=='BELIRLENECEK').join(', '));setNameValue(p.urunAdi||'');}} style={{fontSize:11,color:'#2563eb',background:'#eff6ff',padding:'4px 8px',borderRadius:6,border:'1px solid #bfdbfe',fontWeight:700,cursor:'pointer',flexShrink:0}}>✏️ Düzenle</button>
        </div>
      ))}
      {showManual&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',zIndex:9998,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:16,padding:18,width:'100%',maxWidth:420,boxShadow:'0 20px 45px rgba(0,0,0,.2)'}}>
            <p style={{fontSize:15,fontWeight:800,color:'#0f172a',marginBottom:4}}>Manuel Ürün Ekle</p>
            <p style={{fontSize:12,color:'#64748b',marginBottom:12}}>Ürün sisteme lokasyonu BELIRLENECEK olarak eklenir. Lokasyonu sonradan düzenleyebilirsin.</p>
            <input value={manualForm.urunAdi} onChange={e=>setManualForm(p=>({...p,urunAdi:e.target.value}))} placeholder="Ürün adı" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',marginBottom:8}} />
            <input value={manualForm.ean} onChange={e=>setManualForm(p=>({...p,ean:e.target.value.replace(/\s/g,'')}))} placeholder="Barkod / EAN" inputMode="numeric" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'monospace',marginBottom:8}} />
            <input value={manualForm.malzemeKodu} onChange={e=>setManualForm(p=>({...p,malzemeKodu:e.target.value.toUpperCase()}))} placeholder="Malzeme kodu" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'monospace',marginBottom:12}} />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowManual(false);setManualForm({ urunAdi:'', ean:'', malzemeKodu:'' });}} disabled={savingManual} style={{background:'#f1f5f9',border:'none',color:'#475569',padding:'9px 14px',borderRadius:10,fontWeight:700,cursor:'pointer'}}>İptal</button>
              <button onClick={addManualProduct} disabled={savingManual} style={{background:'#10b981',border:'none',color:'#fff',padding:'9px 14px',borderRadius:10,fontWeight:700,cursor:'pointer',opacity:savingManual?0.6:1}}>{savingManual?'Ekleniyor...':'Ürünü Ekle'}</button>
            </div>
          </div>
        </div>
      )}
      {editingLoc&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',zIndex:9998,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:16,padding:18,width:'100%',maxWidth:420,boxShadow:'0 20px 45px rgba(0,0,0,.2)'}}>
            <p style={{fontSize:15,fontWeight:800,color:'#0f172a',marginBottom:4}}>Ürün Düzenle</p>
            <p style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace',marginBottom:12}}>{editingLoc.malzemeKodu}{editingLoc.malzemeKodu?' · ':''}{editingLoc.ean}</p>
            <p style={{fontSize:11,fontWeight:700,color:'#64748b',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Ürün Adı</p>
            <input value={nameValue} onChange={e=>setNameValue(e.target.value)} placeholder="Ürün adı" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',marginBottom:12}} />
            <p style={{fontSize:11,fontWeight:700,color:'#64748b',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Lokasyon</p>
            <input value={locValue} onChange={e=>setLocValue(e.target.value.toUpperCase())} placeholder="Örn: A109S013B veya virgülle çoklu lokasyon" style={{width:'100%',border:'2px solid #e2e8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'monospace',marginBottom:8}} />
            <p style={{fontSize:11,color:'#94a3b8',marginBottom:12}}>Boş lokasyon kaydedersen BELIRLENECEK olarak kalır. Ürün adı değişikliği stok ve geçmiş hareketlere de yansır.</p>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>{setEditingLoc(null);setLocValue('');setNameValue('');}} style={{background:'#f1f5f9',border:'none',color:'#475569',padding:'9px 14px',borderRadius:10,fontWeight:700,cursor:'pointer'}}>İptal</button>
              <button onClick={saveLocation} style={{background:'#10b981',border:'none',color:'#fff',padding:'9px 14px',borderRadius:10,fontWeight:700,cursor:'pointer'}}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
      {products.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:'#94a3b8'}}><p style={{fontSize:32,marginBottom:8}}>📦</p><p style={{fontSize:13}}>Henüz ürün yüklenmedi</p><p style={{fontSize:12,marginTop:4}}>Excel dosyasını yükleyin</p></div>}
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

function Onaylar() {
  const [returns, setReturns] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [toast, setToast] = useState(null);
  const toast$ = (msg,type='info')=>setToast({msg,type,id:Date.now()});

  const load = useCallback(async()=>{
    const [rSnap,sSnap]=await Promise.all([
      getDocs(query(collection(db,'returns'),where('durum','==','bekliyor'),orderBy('tarih','desc'))),
      getDocs(query(collection(db,'countSessions'),where('onayli','==',false),orderBy('baslangic','desc'))),
    ]);
    setReturns(rSnap.docs.map(d=>({id:d.id,...d.data()})));
    setSessions(sSnap.docs.map(d=>({id:d.id,...d.data()})));
  },[]);
  useEffect(()=>{load();},[load]);

  const approveReturn = async (ret) => {
    try {
      // Add to stock
      const batch=writeBatch(db);
      for (const item of ret.items||[]) {
        if (!item.ean) continue;
        const ref=doc(db,'stock',item.ean);
        const snap=await getDoc(ref);
        if (snap.exists()) batch.update(ref,{adet:(snap.data().adet||0)+item.adet, sonGuncelleme:Timestamp.now()});
        else batch.set(ref,{ean:item.ean, adet:item.adet, sonGuncelleme:Timestamp.now()});
      }
      batch.update(doc(db,'returns',ret.id),{durum:'onaylandi',onayTarihi:Timestamp.now()});
      await batch.commit();
      toast$('İade onaylandı ve stoğa eklendi ✓','success');
      load();
    }catch(e){toast$('Hata: '+e.message,'error');}
  };

  const approveCount = async (session) => {
    try {
      // Merge all entries
      const entriesSnap = await getDocs(query(collection(db,'countEntries'),where('sessionId','==',session.id)));
      const merged = {};
      entriesSnap.docs.forEach(d=>{
        const data=d.data();
        Object.entries(data.entries||{}).forEach(([ean,cnt])=>{ merged[ean]=(merged[ean]||0)+cnt; });
      });
      // Export as xlsx
      const products = {};
      const pSnap = await getDocs(collection(db,'products'));
      pSnap.docs.forEach(d=>{ const p=d.data(); if(p.ean) products[p.ean]=p; });
      const rows = Object.entries(merged).map(([ean,cnt])=>({
        'Lokasyon': session.lokasyon,
        'EAN Kodu': ean,
        'Malzeme Kodu': products[ean]?.malzemeKodu||'',
        'Ürün Adı': products[ean]?.urunAdi||'',
        'Sayım Adedi': cnt,
        ...(session.tur==='referansli'?{
          'Referans Adedi': session.referansData?.[ean]||0,
          'Fark': cnt-(session.referansData?.[ean]||0),
          'Durum': cnt===(session.referansData?.[ean]||0)?'TAMAM':cnt<(session.referansData?.[ean]||0)?'EKSİK':'FAZLA',
        }:{}),
      }));
      const ws=XLSX.utils.json_to_sheet(rows);
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,`Sayım_${session.lokasyon}`);
      XLSX.writeFile(wb,`sayim_${session.lokasyon}_${new Date().toISOString().slice(0,10)}.xlsx`);
      await updateDoc(doc(db,'countSessions',session.id),{onayli:true,onayTarihi:Timestamp.now(),mergedEntries:merged});
      toast$('Sayım onaylandı ve Excel indirildi ✓','success');
      load();
    }catch(e){toast$('Hata: '+e.message,'error');}
  };

  return (
    <div>
      <p style={{fontWeight:700,color:'#0f172a',fontSize:15,marginBottom:14}}>⏳ Onay Bekleyenler</p>
      {returns.length===0&&sessions.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:'#94a3b8'}}><p style={{fontSize:36,marginBottom:8}}>✅</p><p style={{fontSize:14}}>Bekleyen onay yok</p></div>}
      {returns.length>0&&(
        <>
          <p style={{fontSize:12,fontWeight:700,color:'#f59e0b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>İade Onayları ({returns.length})</p>
          {returns.map(r=>(
            <div key={r.id} style={{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:10,border:'2px solid #fde68a'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div>
                  <p style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{r.cariIsim||'—'}</p>
                  <p style={{fontSize:11,color:'#64748b'}}>{r.neden||'—'} · {r.toplamAdet||0} adet · {r.operator}</p>
                  <p style={{fontSize:11,color:'#94a3b8'}}>{r.tarih?.toDate?.().toLocaleDateString('tr-TR')||'—'}</p>
                </div>
                <button onClick={()=>approveReturn(r)} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'9px 14px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer'}}>Onayla → Stoğa Ekle</button>
              </div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {(r.items||[]).slice(0,6).map((item,i)=>(
                  <span key={i} style={{fontSize:10,color:'#475569',background:'#f1f5f9',padding:'2px 8px',borderRadius:6,fontFamily:'monospace'}}>{item.ean} ×{item.adet}</span>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {sessions.length>0&&(
        <>
          <p style={{fontSize:12,fontWeight:700,color:'#10b981',textTransform:'uppercase',letterSpacing:1,marginBottom:8,marginTop:16}}>Sayım Onayları ({sessions.length})</p>
          {sessions.map(s=>{
            const entryCnt=s.kullanicilar?.length||0;
            return (
              <div key={s.id} style={{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:10,border:'2px solid #86efac'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <p style={{fontSize:14,fontWeight:700,color:'#0f172a',fontFamily:'monospace'}}>{s.lokasyon}</p>
                    <p style={{fontSize:11,color:'#64748b'}}>{s.tur==='referansli'?'Referanslı':'Manuel'} · {entryCnt} kişi girdi</p>
                    <p style={{fontSize:11,color:'#94a3b8'}}>{s.baslangic?.toDate?.().toLocaleDateString('tr-TR')||'—'}</p>
                  </div>
                  <button onClick={()=>approveCount(s)} style={{background:'linear-gradient(135deg,#10b981,#059669)',border:'none',color:'#fff',padding:'9px 14px',borderRadius:10,fontWeight:700,fontSize:12,cursor:'pointer'}}>Birleştir + Excel ⬇️</button>
                </div>
              </div>
            );
          })}
        </>
      )}
      {toast&&<Toast {...toast} onDone={()=>setToast(null)} />}
    </div>
  );
}

/* ── MAIN ────────────────────────────────────────────── */
export default function YoneticiPanel({ profile }) {
  const [tab, setTab] = useState('onaylar');
  if (profile?.role !== 'admin') return (
    <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}><p style={{fontSize:48,marginBottom:12}}>🔒</p><p style={{fontSize:15,fontWeight:600}}>Bu sayfaya erişim yetkiniz yok</p></div>
  );

  const tabs=[{id:'onaylar',lbl:'⏳ Onaylar'},{id:'urunler',lbl:'📦 Ürünler'},{id:'kullanicilar',lbl:'👥 Kullanıcılar'}];

  return (
    <div>
      <div style={{background:'#0f172a',padding:'12px 16px'}}><h2 style={{color:'#f8fafc',fontSize:15,fontWeight:700}}>⚙️ Yönetici Paneli</h2></div>
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',display:'flex',overflowX:'auto'}}>
        {tabs.map(({id,lbl})=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:'11px 14px',fontSize:12,fontWeight:600,border:'none',cursor:'pointer',background:'transparent',color:tab===id?'#2563eb':'#64748b',borderBottom:`3px solid ${tab===id?'#3b82f6':'transparent'}`,whiteSpace:'nowrap'}}>{lbl}</button>
        ))}
      </div>
      <div style={{padding:16,maxWidth:600,margin:'0 auto'}}>
        {tab==='onaylar'&&<Onaylar />}
        {tab==='urunler'&&<Urunler />}
        {tab==='kullanicilar'&&<Kullanicilar />}
      </div>
    </div>
  );
}
