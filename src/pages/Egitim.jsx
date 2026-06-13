import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, setDoc,
         query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useDepo, stokDocId, isMainDepo } from '../contexts/DepoContext.jsx';
import * as XLSX from 'xlsx';

function Toast({msg,type,onDone}){const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);return(<div style={{position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',background:bg[type]||bg.info,color:'#fff',padding:'10px 20px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:999,boxShadow:'0 4px 20px rgba(0,0,0,.25)'}}>{msg}</div>);}

const S={card:{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:12,border:'1px solid #e2e8f0'},btn:{border:'none',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,cursor:'pointer'},input:{width:'100%',padding:'10px 12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none',boxSizing:'border-box'}};

export default function Egitim(){
  const{user,profile}=useAuth();
  const{selectedDepo,depoInfo}=useDepo();
  const isAdmin=profile?.role==='admin';
  const[view,setView]=useState('list');
  const[trainings,setTrainings]=useState([]);
  const[loading,setLoading]=useState(false);
  const[toast,setToast]=useState(null);
  const toast$=(msg,type='info')=>setToast({msg,type,id:Date.now()});

  // Yeni çıkış
  const[hedef,setHedef]=useState('');
  const[cikisItems,setCikisItems]=useState({});// ean->{adet,urunAdi,malzemeKodu}
  const[barInput,setBarInput]=useState('');
  const[products,setProducts]=useState({});
  const[lastScanned,setLastScanned]=useState(null);

  // Geri alım
  const[activeTr,setActiveTr]=useState(null);
  const[geriItems,setGeriItems]=useState({});// ean->adet
  const[geriBarInput,setGeriBarInput]=useState('');
  const[geriLastScanned,setGeriLastScanned]=useState(null);

  const lastScannedRef=useRef(null);
  const geriLastRef=useRef(null);

  const loadProducts=useCallback(async()=>{
    const snap=await getDocs(collection(db,'products'));
    const m={};snap.docs.forEach(d=>{const p=d.data();if(p.ean)m[p.ean]=p;});
    setProducts(m);
  },[]);

  const loadTrainings=useCallback(async()=>{
    const snap=await getDocs(query(collection(db,'trainings'),where('depoId','==',selectedDepo)));
    const list=snap.docs.map(d=>({id:d.id,...d.data()}));
    list.sort((a,b)=>(b.baslangiç?.toMillis?.()??0)-(a.baslangiç?.toMillis?.()??0));
    setTrainings(list);
  },[selectedDepo]);

  useEffect(()=>{loadTrainings();loadProducts();},[loadTrainings,loadProducts]);

  const addBarcode=(code)=>{
    const ean=String(code).trim();
    if(!ean)return;
    const p=products[ean];
    setCikisItems(prev=>({...prev,[ean]:{adet:(prev[ean]?.adet||0)+1,urunAdi:p?.urunAdi||'',malzemeKodu:p?.malzemeKodu||''}}));
    setLastScanned(ean);
    setTimeout(()=>{if(lastScannedRef.current)lastScannedRef.current.scrollIntoView({behavior:'smooth',block:'center'});},100);
    toast$(p?.urunAdi||ean,'success');
  };

  const cikisOnayla=async()=>{
    const items=Object.entries(cikisItems);
    if(items.length===0){toast$('Ürün ekleyin','error');return;}
    if(!hedef.trim()){toast$('Hedef/açıklama girin','error');return;}
    if(!window.confirm(`${items.length} kalem eğitime gönderilecek ve stoktan düşülecek.\n\nDevam edilsin mi?`))return;
    setLoading(true);
    try{
      const now=Timestamp.now();
      const trainingItems=items.map(([ean,v])=>({ean,malzemeKodu:v.malzemeKodu||'',urunAdi:v.urunAdi||'',cikisMiktar:v.adet,geriGelenMiktar:0,fark:v.adet}));
      // Stoktan düş
      for(const[ean,v]of items){
        const sid=stokDocId(selectedDepo,ean);
        const sRef=doc(db,'stock',sid);
        const sSnap=await getDoc(sRef);
        const data=sSnap.exists()?sSnap.data():{miktar:0,byLocation:{}};
        const yeniMiktar=Math.max(0,(data.miktar||0)-v.adet);
        await setDoc(sRef,{...data,ean,depoId:selectedDepo,miktar:yeniMiktar,sonGuncelleme:now},{merge:true});
      }
      await addDoc(collection(db,'trainings'),{
        depoId:selectedDepo,durum:'aktif',hedef:hedef.trim(),
        baslangiç:now,items:trainingItems,
        cikisYapan:profile?.name||user?.email||'',cikisYapanId:user?.uid||'',
        toplamCikis:trainingItems.reduce((a,i)=>a+i.cikisMiktar,0),
      });
      toast$('Eğitim çıkışı yapıldı ✓','success');
      setCikisItems({});setHedef('');setBarInput('');setView('list');loadTrainings();
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  const addGeriBarcode=(code)=>{
    const ean=String(code).trim();if(!ean)return;
    const trItem=activeTr?.items?.find(i=>i.ean===ean);
    if(!trItem){toast$('Bu ürün çıkış listesinde yok','error');return;}
    setGeriItems(prev=>({...prev,[ean]:(prev[ean]||0)+1}));
    setGeriLastScanned(ean);
    setTimeout(()=>{if(geriLastRef.current)geriLastRef.current.scrollIntoView({behavior:'smooth',block:'center'});},100);
    toast$(trItem.urunAdi||ean,'success');
  };

  const geriAlimOnayla=async()=>{
    if(!activeTr)return;
    const toplamGeri=Object.values(geriItems).reduce((a,v)=>a+v,0);
    if(!window.confirm(`${toplamGeri} adet ürün stoğa geri eklenecek.\n\nDevam edilsin mi?`))return;
    setLoading(true);
    try{
      const now=Timestamp.now();
      const guncelItems=activeTr.items.map(item=>{
        const geri=geriItems[item.ean]||0;
        return{...item,geriGelenMiktar:geri,fark:item.cikisMiktar-geri};
      });
      // Stoğa geri ekle
      for(const[ean,adet]of Object.entries(geriItems)){
        if(adet<=0)continue;
        const sid=stokDocId(selectedDepo,ean);
        const sRef=doc(db,'stock',sid);
        const sSnap=await getDoc(sRef);
        const data=sSnap.exists()?sSnap.data():{miktar:0,byLocation:{}};
        const yeniMiktar=(data.miktar||0)+adet;
        await setDoc(sRef,{...data,ean,depoId:selectedDepo,miktar:yeniMiktar,sonGuncelleme:now},{merge:true});
      }
      await updateDoc(doc(db,'trainings',activeTr.id),{
        durum:'tamamlandi',bitiş:now,items:guncelItems,
        geriAlan:profile?.name||user?.email||'',geriAlanId:user?.uid||'',
        toplamGeri,
      });
      toast$('Geri alım tamamlandı ✓','success');
      setActiveTr(null);setGeriItems({});setGeriBarInput('');setView('list');loadTrainings();
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  // Excel ile ürün ekleme (çıkış için)
  const parseExcel=(file)=>{
    const reader=new FileReader();
    reader.onload=({target:{result}})=>{
      try{
        const wb=XLSX.read(new Uint8Array(result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let cEan=-1,cAdet=-1,cKod=-1,hIdx=0;
        for(let r=0;r<Math.min(rows.length,10);r++){
          const cells=rows[r].map(c=>String(c||'').toLowerCase().trim());
          cells.forEach((c,j)=>{
            if(/ean|barkod/.test(c)&&cEan<0)cEan=j;
            if(/miktar|adet|qty/.test(c)&&cAdet<0)cAdet=j;
            if(/(malzeme|ürün)\s*kodu?/.test(c)&&cKod<0)cKod=j;
          });
          if(cEan>=0&&cAdet>=0){hIdx=r;break;}
        }
        if(cEan<0||cAdet<0){toast$('EAN ve Adet sütunları bulunamadı','error');return;}
        let count=0;
        rows.slice(hIdx+1).forEach(row=>{
          const ean=String(row[cEan]||'').trim();
          const adet=parseInt(String(row[cAdet]||'0').replace(/\D/g,''))||0;
          if(!ean||adet<=0)return;
          const p=products[ean];
          setCikisItems(prev=>({...prev,[ean]:{adet:(prev[ean]?.adet||0)+adet,urunAdi:p?.urunAdi||'',malzemeKodu:cKod>=0?String(row[cKod]||'').trim():(p?.malzemeKodu||'')}}));
          count++;
        });
        toast$(`${count} kalem eklendi`,'success');
      }catch(e){toast$('Dosya hatası: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  /* ── GERİ ALIM EKRANI ── */
  if(view==='return'&&activeTr){
    return(
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setView('list');setActiveTr(null);setGeriItems({});}} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <div style={{flex:1}}>
            <p style={{color:'#fff',fontWeight:700,fontSize:14}}>🎓 Geri Alım</p>
            <p style={{color:'#94a3b8',fontSize:11}}>{activeTr.hedef} · {depoInfo.short}</p>
          </div>
        </div>
        <div style={{padding:16}}>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input value={geriBarInput} onChange={e=>setGeriBarInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){addGeriBarcode(geriBarInput);setGeriBarInput('');}}}
              placeholder="Barkod okutun → Enter" style={{...S.input,flex:1}}/>
            <button onClick={()=>{addGeriBarcode(geriBarInput);setGeriBarInput('');}}
              style={{...S.btn,background:'#1e40af',color:'#fff'}}>Ekle</button>
          </div>
          {activeTr.items.map((item,i)=>{
            const geri=geriItems[item.ean]||0;
            const tam=geri>=item.cikisMiktar;
            const isLast=item.ean===geriLastScanned;
            return(
              <div key={i} ref={isLast?geriLastRef:null}
                style={{...S.card,border:isLast?'2px solid #3b82f6':tam?'1px solid #bbf7d0':'1px solid #e2e8f0',
                  background:isLast?'#eff6ff':tam?'#f0fdf4':'#fff',transition:'all .3s'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>{item.urunAdi||item.ean}</p>
                    <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{item.malzemeKodu}{item.malzemeKodu&&item.ean?' · ':''}{item.ean}</p>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <p style={{fontSize:11,color:'#64748b'}}>Çıkış: {item.cikisMiktar}</p>
                    <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4}}>
                      <button onClick={()=>setGeriItems(prev=>({...prev,[item.ean]:Math.max(0,(prev[item.ean]||0)-1)}))}
                        style={{width:24,height:24,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700}}>−</button>
                      <span style={{fontSize:15,fontWeight:800,color:tam?'#15803d':geri>0?'#d97706':'#94a3b8',minWidth:32,textAlign:'center'}}>{geri}</span>
                      <button onClick={()=>setGeriItems(prev=>({...prev,[item.ean]:(prev[item.ean]||0)+1}))}
                        style={{width:24,height:24,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700}}>+</button>
                    </div>
                  </div>
                  {tam&&<span style={{fontSize:16}}>✅</span>}
                </div>
                {geri>0&&geri<item.cikisMiktar&&<p style={{fontSize:10,color:'#d97706',marginTop:4}}>⚠️ Eksik: {item.cikisMiktar-geri} adet</p>}
              </div>
            );
          })}
          <button onClick={geriAlimOnayla} disabled={loading}
            style={{...S.btn,width:'100%',background:'#10b981',color:'#fff',marginTop:8}}>{loading?'İşleniyor...':'✅ Geri Alımı Tamamla'}</button>
        </div>
        {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
      </div>
    );
  }

  /* ── YENİ ÇIKIŞ EKRANI ── */
  if(view==='new'){
    const itemList=Object.entries(cikisItems);
    const toplam=itemList.reduce((a,[,v])=>a+v.adet,0);
    return(
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setView('list');setCikisItems({});setHedef('');}} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <div style={{flex:1}}>
            <p style={{color:'#fff',fontWeight:700,fontSize:14}}>🎓 Eğitim Çıkışı</p>
            <p style={{color:'#94a3b8',fontSize:11}}>{depoInfo.short} · {itemList.length} kalem · {toplam} adet</p>
          </div>
        </div>
        <div style={{padding:16}}>
          <div style={S.card}>
            <p style={{fontSize:12,fontWeight:700,marginBottom:6}}>Hedef / Açıklama</p>
            <input value={hedef} onChange={e=>setHedef(e.target.value)} placeholder="Eğitim yeri, kişi veya açıklama"
              style={S.input}/>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input value={barInput} onChange={e=>setBarInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){addBarcode(barInput);setBarInput('');}}}
              placeholder="Barkod okutun → Enter" style={{...S.input,flex:1}}/>
            <button onClick={()=>{addBarcode(barInput);setBarInput('');}}
              style={{...S.btn,background:'#1e40af',color:'#fff'}}>Ekle</button>
          </div>
          <label style={{...S.btn,background:'#f1f5f9',color:'#475569',display:'inline-block',cursor:'pointer',marginBottom:12}}>
            📂 Excel Yükle
            <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])parseExcel(e.target.files[0]);e.target.value='';}}/>
          </label>
          {itemList.length===0&&<p style={{color:'#94a3b8',textAlign:'center',padding:'24px 0'}}>Henüz ürün eklenmedi</p>}
          {itemList.map(([ean,v],i)=>{
            const isLast=ean===lastScanned;
            return(
              <div key={ean} ref={isLast?lastScannedRef:null}
                style={{...S.card,border:isLast?'2px solid #3b82f6':'1px solid #e2e8f0',background:isLast?'#eff6ff':'#fff',transition:'all .3s'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:600}}>{v.urunAdi||ean}</p>
                    <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{v.malzemeKodu}{v.malzemeKodu&&ean?' · ':''}{ean}</p>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <button onClick={()=>setCikisItems(prev=>{const n={...prev};n[ean]={...n[ean],adet:Math.max(0,n[ean].adet-1)};if(n[ean].adet<=0)delete n[ean];return n;})}
                      style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700}}>−</button>
                    <span style={{fontSize:15,fontWeight:800,color:'#1e293b',minWidth:32,textAlign:'center'}}>{v.adet}</span>
                    <button onClick={()=>setCikisItems(prev=>({...prev,[ean]:{...prev[ean],adet:prev[ean].adet+1}}))}
                      style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700}}>+</button>
                  </div>
                  <button onClick={()=>setCikisItems(prev=>{const n={...prev};delete n[ean];return n;})}
                    style={{background:'#fee2e2',border:'none',borderRadius:7,color:'#dc2626',padding:'5px 8px',fontSize:12,cursor:'pointer'}}>✕</button>
                </div>
              </div>
            );
          })}
          {itemList.length>0&&<button onClick={cikisOnayla} disabled={loading}
            style={{...S.btn,width:'100%',background:'#dc2626',color:'#fff',marginTop:8}}>{loading?'İşleniyor...':'🎓 Eğitime Gönder (Stoktan Düş)'}</button>}
        </div>
        {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
      </div>
    );
  }

  /* ── LİSTE ── */
  const aktifler=trainings.filter(t=>t.durum==='aktif');
  const bitmisler=trainings.filter(t=>t.durum==='tamamlandi');
  const fmtDate=(t)=>{try{return t?.toDate?.()?.toLocaleDateString('tr-TR')||'';}catch{return '';}};
  return(
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <p style={{color:'#fff',fontWeight:700,fontSize:16}}>🎓 Eğitim</p>
          <p style={{color:'#94a3b8',fontSize:11}}>{depoInfo.short}</p>
        </div>
      </div>
      <div style={{padding:16}}>
        <button onClick={()=>{setCikisItems({});setHedef('');setLastScanned(null);setView('new');}}
          style={{...S.btn,width:'100%',background:'#dc2626',color:'#fff',marginBottom:16}}>🎓 Yeni Eğitim Çıkışı</button>
        {aktifler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Eğitimde ({aktifler.length})</p>
            {aktifler.map(t=>(
              <div key={t.id} style={{...S.card,border:'1px solid #fecaca',background:'#fff5f5'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:700,color:'#dc2626'}}>🎓 {t.hedef}</p>
                    <p style={{fontSize:11,color:'#64748b'}}>{t.cikisYapan} · {fmtDate(t.baslangiç)} · {t.items?.length} kalem · {t.toplamCikis} adet</p>
                  </div>
                  <button onClick={()=>{setActiveTr(t);setGeriItems({});setGeriLastScanned(null);setView('return');}}
                    style={{...S.btn,background:'#10b981',color:'#fff',fontSize:12}}>↩ Geri Al</button>
                </div>
              </div>
            ))}
          </>
        )}
        {bitmisler.length>0&&(
          <>
            <p style={{fontSize:12,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8,marginTop:16}}>Tamamlanan ({bitmisler.length})</p>
            {bitmisler.map(t=>{
              const toplamFark=(t.items||[]).reduce((a,i)=>a+(i.fark||0),0);
              return(
                <div key={t.id} style={S.card}>
                  <p style={{fontSize:13,fontWeight:600,color:'#475569'}}>🎓 {t.hedef}</p>
                  <p style={{fontSize:11,color:'#94a3b8'}}>{fmtDate(t.baslangiç)} → {fmtDate(t.bitiş)} · {t.cikisYapan}</p>
                  <p style={{fontSize:11,color:toplamFark>0?'#d97706':'#15803d',fontWeight:600,marginTop:4}}>
                    Çıkış: {t.toplamCikis} · Geri: {t.toplamGeri||0}{toplamFark>0?` · Eksik: ${toplamFark}`:'  · ✅ Tam'}
                  </p>
                </div>
              );
            })}
          </>
        )}
        {trainings.length===0&&<p style={{color:'#94a3b8',textAlign:'center',padding:'32px 0'}}>Henüz eğitim kaydı yok</p>}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}
