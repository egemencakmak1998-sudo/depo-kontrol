import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, addDoc, getDocs, doc, getDoc, setDoc,
         query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useDepo, DEPOLAR, DEPO_MAP, stokDocId, isMainDepo } from '../contexts/DepoContext.jsx';
import * as XLSX from 'xlsx';

function Toast({msg,type,onDone}){const bg={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);return(<div style={{position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',background:bg[type]||bg.info,color:'#fff',padding:'10px 20px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:999,boxShadow:'0 4px 20px rgba(0,0,0,.25)'}}>{msg}</div>);}

const S={card:{background:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:12,border:'1px solid #e2e8f0'},btn:{border:'none',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,cursor:'pointer'},input:{width:'100%',padding:'10px 12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none',boxSizing:'border-box'}};

export default function DepoTransfer(){
  const{user,profile}=useAuth();
  const{selectedDepo,depoInfo}=useDepo();
  const[view,setView]=useState('list');
  const[loading,setLoading]=useState(false);
  const[toast,setToast]=useState(null);
  const toast$=(msg,type='info')=>setToast({msg,type,id:Date.now()});
  const[transfers,setTransfers]=useState([]);

  // Transfer form
  const[kaynakDepo,setKaynakDepo]=useState(selectedDepo);
  const[hedefDepo,setHedefDepo]=useState(DEPOLAR.find(d=>d.id!==selectedDepo)?.id||'');
  const[items,setItems]=useState({});// ean->{adet,urunAdi,malzemeKodu}
  const[barInput,setBarInput]=useState('');
  const[products,setProducts]=useState({});
  const[lastScanned,setLastScanned]=useState(null);
  const lastRef=useRef(null);

  const loadProducts=useCallback(async()=>{
    const snap=await getDocs(collection(db,'products'));
    const m={};snap.docs.forEach(d=>{const p=d.data();if(p.ean)m[p.ean]=p;});
    setProducts(m);
  },[]);

  const loadTransfers=useCallback(async()=>{
    const snap=await getDocs(collection(db,'transfers'));
    const list=snap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.kaynakDepo===selectedDepo||t.hedefDepo===selectedDepo);
    list.sort((a,b)=>(b.tarih?.toMillis?.()??0)-(a.tarih?.toMillis?.()??0));
    setTransfers(list);
  },[selectedDepo]);

  useEffect(()=>{loadTransfers();loadProducts();},[loadTransfers,loadProducts]);

  const addBarcode=(code)=>{
    const ean=String(code).trim();if(!ean)return;
    const p=products[ean];
    setItems(prev=>({...prev,[ean]:{adet:(prev[ean]?.adet||0)+1,urunAdi:p?.urunAdi||'',malzemeKodu:p?.malzemeKodu||''}}));
    setLastScanned(ean);
    setTimeout(()=>{if(lastRef.current)lastRef.current.scrollIntoView({behavior:'smooth',block:'center'});},100);
    toast$(p?.urunAdi||ean,'success');
  };

  const parseExcel=(file)=>{
    const reader=new FileReader();
    reader.onload=({target:{result}})=>{
      try{
        const wb=XLSX.read(new Uint8Array(result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let cEan=-1,cAdet=-1,hIdx=0;
        for(let r=0;r<Math.min(rows.length,10);r++){
          const cells=rows[r].map(c=>String(c||'').toLowerCase().trim());
          cells.forEach((c,j)=>{if(/ean|barkod/.test(c)&&cEan<0)cEan=j;if(/miktar|adet|qty/.test(c)&&cAdet<0)cAdet=j;});
          if(cEan>=0&&cAdet>=0){hIdx=r;break;}
        }
        if(cEan<0||cAdet<0){toast$('EAN ve Adet sütunları bulunamadı','error');return;}
        let count=0;
        rows.slice(hIdx+1).forEach(row=>{
          const ean=String(row[cEan]||'').trim();
          const adet=parseInt(String(row[cAdet]||'0').replace(/\D/g,''))||0;
          if(!ean||adet<=0)return;
          const p=products[ean];
          setItems(prev=>({...prev,[ean]:{adet:(prev[ean]?.adet||0)+adet,urunAdi:p?.urunAdi||'',malzemeKodu:p?.malzemeKodu||''}}));
          count++;
        });
        toast$(`${count} kalem eklendi`,'success');
      }catch(e){toast$('Dosya hatası: '+e.message,'error');}
    };
    reader.readAsArrayBuffer(file);
  };

  const transferOnayla=async()=>{
    const itemList=Object.entries(items);
    if(itemList.length===0){toast$('Ürün ekleyin','error');return;}
    if(kaynakDepo===hedefDepo){toast$('Kaynak ve hedef depo aynı olamaz','error');return;}
    const toplamAdet=itemList.reduce((a,[,v])=>a+v.adet,0);
    if(!window.confirm(`${itemList.length} kalem · ${toplamAdet} adet\n\n${DEPO_MAP[kaynakDepo]?.short} → ${DEPO_MAP[hedefDepo]?.short}\n\nTransfer onaylansın mı?`))return;
    setLoading(true);
    try{
      const now=Timestamp.now();
      const trItems=itemList.map(([ean,v])=>({ean,malzemeKodu:v.malzemeKodu||'',urunAdi:v.urunAdi||'',adet:v.adet}));
      // Kaynak stoktan düş
      for(const[ean,v]of itemList){
        const sid=stokDocId(kaynakDepo,ean);
        const sRef=doc(db,'stock',sid);
        const sSnap=await getDoc(sRef);
        const data=sSnap.exists()?sSnap.data():{miktar:0,byLocation:{}};
        await setDoc(sRef,{...data,ean,depoId:kaynakDepo,miktar:Math.max(0,(data.miktar||0)-v.adet),sonGuncelleme:now},{merge:true});
      }
      // Hedef stoğa ekle
      for(const[ean,v]of itemList){
        const sid=stokDocId(hedefDepo,ean);
        const sRef=doc(db,'stock',sid);
        const sSnap=await getDoc(sRef);
        const data=sSnap.exists()?sSnap.data():{miktar:0,byLocation:{}};
        const prevByLok=data.byLocation||{};
        const newByLok={...prevByLok,HVZ:(prevByLok.HVZ||0)+v.adet};
        await setDoc(sRef,{...data,ean,depoId:hedefDepo,miktar:(data.miktar||0)+v.adet,urunAdi:v.urunAdi||data.urunAdi||'',malzemeKodu:v.malzemeKodu||data.malzemeKodu||'',byLocation:newByLok,sonGuncelleme:now},{merge:true});
      }
      await addDoc(collection(db,'transfers'),{
        kaynakDepo,hedefDepo,tarih:now,items:trItems,
        yapan:profile?.name||user?.email||'',yapanId:user?.uid||'',
        toplamKalem:trItems.length,toplamAdet,
      });
      toast$('Transfer tamamlandı ✓','success');
      setItems({});setBarInput('');setView('list');loadTransfers();
    }catch(e){toast$('Hata: '+e.message,'error');}
    setLoading(false);
  };

  /* ── YENİ TRANSFER ── */
  if(view==='new'){
    const itemList=Object.entries(items);
    const toplam=itemList.reduce((a,[,v])=>a+v.adet,0);
    return(
      <div>
        <div style={{background:'#0f172a',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setView('list');setItems({});}} style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,color:'#fff',padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
          <div style={{flex:1}}>
            <p style={{color:'#fff',fontWeight:700,fontSize:14}}>🔄 Depo Transferi</p>
            <p style={{color:'#94a3b8',fontSize:11}}>{itemList.length} kalem · {toplam} adet</p>
          </div>
        </div>
        <div style={{padding:16}}>
          {/* Kaynak → Hedef */}
          <div style={{...S.card,background:'#f8fafc'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1,textAlign:'center'}}>
                <p style={{fontSize:10,fontWeight:600,color:'#64748b',marginBottom:4}}>KAYNAK</p>
                <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                  {DEPOLAR.map(d=>(
                    <button key={d.id} onClick={()=>{setKaynakDepo(d.id);if(d.id===hedefDepo)setHedefDepo(DEPOLAR.find(x=>x.id!==d.id)?.id||'');}}
                      style={{...S.btn,flex:1,fontSize:12,padding:'8px 6px',background:kaynakDepo===d.id?d.color:'#f1f5f9',color:kaynakDepo===d.id?'#fff':'#475569'}}>
                      {d.icon} {d.short}
                    </button>
                  ))}
                </div>
              </div>
              <span style={{fontSize:24,color:'#1e40af'}}>→</span>
              <div style={{flex:1,textAlign:'center'}}>
                <p style={{fontSize:10,fontWeight:600,color:'#64748b',marginBottom:4}}>HEDEF</p>
                <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                  {DEPOLAR.map(d=>(
                    <button key={d.id} onClick={()=>{setHedefDepo(d.id);if(d.id===kaynakDepo)setKaynakDepo(DEPOLAR.find(x=>x.id!==d.id)?.id||'');}}
                      style={{...S.btn,flex:1,fontSize:12,padding:'8px 6px',background:hedefDepo===d.id?d.color:'#f1f5f9',color:hedefDepo===d.id?'#fff':'#475569'}}>
                      {d.icon} {d.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
              <div key={ean} ref={isLast?lastRef:null}
                style={{...S.card,border:isLast?'2px solid #3b82f6':'1px solid #e2e8f0',background:isLast?'#eff6ff':'#fff',transition:'all .3s'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:600}}>{v.urunAdi||ean}</p>
                    <p style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>{v.malzemeKodu}{v.malzemeKodu&&ean?' · ':''}{ean}</p>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <button onClick={()=>setItems(prev=>{const n={...prev};n[ean]={...n[ean],adet:Math.max(0,n[ean].adet-1)};if(n[ean].adet<=0)delete n[ean];return n;})}
                      style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700}}>−</button>
                    <span style={{fontSize:15,fontWeight:800,minWidth:32,textAlign:'center'}}>{v.adet}</span>
                    <button onClick={()=>setItems(prev=>({...prev,[ean]:{...prev[ean],adet:prev[ean].adet+1}}))}
                      style={{width:26,height:26,borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontWeight:700}}>+</button>
                  </div>
                  <button onClick={()=>setItems(prev=>{const n={...prev};delete n[ean];return n;})}
                    style={{background:'#fee2e2',border:'none',borderRadius:7,color:'#dc2626',padding:'5px 8px',fontSize:12,cursor:'pointer'}}>✕</button>
                </div>
              </div>
            );
          })}
          {itemList.length>0&&<button onClick={transferOnayla} disabled={loading}
            style={{...S.btn,width:'100%',background:'#1e40af',color:'#fff',marginTop:8}}>{loading?'İşleniyor...':'🔄 Transferi Onayla'}</button>}
        </div>
        {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
      </div>
    );
  }

  /* ── LİSTE ── */
  const fmtDate=(t)=>{try{return t?.toDate?.()?.toLocaleDateString('tr-TR')||'';}catch{return '';}};
  return(
    <div>
      <div style={{background:'#0f172a',padding:'14px 16px'}}>
        <p style={{color:'#fff',fontWeight:700,fontSize:16}}>🔄 Depo Transferi</p>
        <p style={{color:'#94a3b8',fontSize:11}}>{depoInfo.short}</p>
      </div>
      <div style={{padding:16}}>
        <button onClick={()=>{setItems({});setKaynakDepo(selectedDepo);setHedefDepo(DEPOLAR.find(d=>d.id!==selectedDepo)?.id||'');setLastScanned(null);setView('new');}}
          style={{...S.btn,width:'100%',background:'#1e40af',color:'#fff',marginBottom:16}}>🔄 Yeni Transfer</button>
        {transfers.length===0&&<p style={{color:'#94a3b8',textAlign:'center',padding:'32px 0'}}>Henüz transfer kaydı yok</p>}
        {transfers.map(t=>(
          <div key={t.id} style={S.card}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>{DEPO_MAP[t.kaynakDepo]?.icon||'📦'}</span>
              <span style={{fontSize:14,color:'#1e40af',fontWeight:700}}>→</span>
              <span style={{fontSize:16}}>{DEPO_MAP[t.hedefDepo]?.icon||'📦'}</span>
              <div style={{flex:1,marginLeft:4}}>
                <p style={{fontSize:13,fontWeight:600}}>{DEPO_MAP[t.kaynakDepo]?.short} → {DEPO_MAP[t.hedefDepo]?.short}</p>
                <p style={{fontSize:11,color:'#94a3b8'}}>{t.yapan} · {fmtDate(t.tarih)} · {t.toplamKalem} kalem · {t.toplamAdet} adet</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}
