import { useState, useEffect, useCallback } from "react";
import { ComposedChart, LineChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";

const PRESETS = [
  { label: "トヨタ",      symbol: "7203.T", market: "JP", name: "トヨタ自動車" },
  { label: "ソニー",      symbol: "6758.T", market: "JP", name: "ソニーグループ" },
  { label: "任天堂",      symbol: "7974.T", market: "JP", name: "任天堂" },
  { label: "三菱UFJ",    symbol: "8306.T", market: "JP", name: "三菱UFJフィナンシャル" },
  { label: "キオクシア",  symbol: "285A.T", market: "JP", name: "キオクシアHD" },
  { label: "Apple",      symbol: "AAPL",   market: "US", name: "Apple Inc." },
  { label: "NVIDIA",     symbol: "NVDA",   market: "US", name: "NVIDIA Corporation" },
  { label: "Tesla",      symbol: "TSLA",   market: "US", name: "Tesla, Inc." },
  { label: "Microsoft",  symbol: "MSFT",   market: "US", name: "Microsoft Corporation" },
  { label: "Amazon",     symbol: "AMZN",   market: "US", name: "Amazon.com, Inc." },
];

const PERIODS = [
  { label: "1日",   value: "1d"  },
  { label: "1ヶ月", value: "1mo" },
  { label: "3ヶ月", value: "3mo" },
  { label: "6ヶ月", value: "6mo" },
  { label: "1年",   value: "1y"  },
];

const PANELS = [
  { key: "macd",  label: "MACD",             color: "#3b82f6" },
  { key: "bb",    label: "ボリンジャー",      color: "#8b5cf6" },
  { key: "vol",   label: "出来高",            color: "#10b981" },
  { key: "stoch", label: "ストキャスティクス", color: "#f97316" },
  { key: "rsi",   label: "RSI",               color: "#06b6d4" },
];

// ── テクニカル計算 ──────────────────────────────────────
function calcMA(data,n){return data.map((d,i)=>({...d,[`ma${n}`]:i<n-1?null:parseFloat((data.slice(i-n+1,i+1).reduce((s,x)=>s+x.close,0)/n).toFixed(2))}));}
function calcBB(data,n=20){return data.map((d,i)=>{if(i<n-1)return{...d,bbUpper:null,bbLower:null,bbMid:null};const sl=data.slice(i-n+1,i+1).map(x=>x.close),mean=sl.reduce((s,v)=>s+v,0)/n,std=Math.sqrt(sl.reduce((s,v)=>s+(v-mean)**2,0)/n);return{...d,bbUpper:parseFloat((mean+2*std).toFixed(2)),bbLower:parseFloat((mean-2*std).toFixed(2)),bbMid:parseFloat(mean.toFixed(2))};});}
function calcMACD(data,fast=12,slow=26,sig=9){function ema(arr,n){const k=2/(n+1);let e=arr[0];return arr.map((v,i)=>{if(i===0)return e;e=v*k+e*(1-k);return e;});}const c=data.map(d=>d.close),ef=ema(c,fast),es=ema(c,slow),ml=ef.map((v,i)=>v-es[i]),sg=ema(ml,sig);return data.map((d,i)=>({...d,macd:i<slow-1?null:parseFloat(ml[i].toFixed(3)),macdSig:i<slow+sig-2?null:parseFloat(sg[i].toFixed(3)),macdHist:i<slow+sig-2?null:parseFloat((ml[i]-sg[i]).toFixed(3))}));}
function calcRSI(data,n=14){return data.map((d,i)=>{if(i<n)return{...d,rsi:null};let g=0,l=0;for(let j=i-n+1;j<=i;j++){const diff=data[j].close-data[j-1].close;if(diff>0)g+=diff;else l-=diff;}return{...d,rsi:parseFloat((100-100/(1+(l===0?100:g/l))).toFixed(1))};});}
function calcStoch(data,k=14,d=3){return data.map((d2,i)=>{if(i<k-1)return{...d2,stochK:null,stochD:null};const sl=data.slice(i-k+1,i+1),hh=Math.max(...sl.map(x=>x.high)),ll=Math.min(...sl.map(x=>x.low));const kVal=hh===ll?50:parseFloat(((d2.close-ll)/(hh-ll)*100).toFixed(1));const ds=[];for(let j=Math.max(k-1,i-d+1);j<=i;j++){const s2=data.slice(j-k+1,j+1),h2=Math.max(...s2.map(x=>x.high)),l2=Math.min(...s2.map(x=>x.low));ds.push(h2===l2?50:(data[j].close-l2)/(h2-l2)*100);}return{...d2,stochK:kVal,stochD:ds.length?parseFloat((ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(1)):null};});}
function applyIndicators(data){let d=calcMA(calcMA(data,5),25);d=calcBB(d);d=calcMACD(d);d=calcRSI(d);d=calcStoch(d);return d;}

// ── シグナルスコア計算 ──────────────────────────────────
function calcSignalScore(data) {
  if(data.length < 26) return null;
  const lr = data[data.length-1];
  const prev = data[data.length-2];
  let score = 0, details = [];

  // RSI
  if(lr.rsi != null) {
    if(lr.rsi < 30)      { score += 2; details.push({name:"RSI",signal:"強い買い",score:+2,color:"#22c55e"}); }
    else if(lr.rsi < 45) { score += 1; details.push({name:"RSI",signal:"買い",score:+1,color:"#86efac"}); }
    else if(lr.rsi > 70) { score -= 2; details.push({name:"RSI",signal:"強い売り",score:-2,color:"#ef4444"}); }
    else if(lr.rsi > 55) { score -= 1; details.push({name:"RSI",signal:"売り",score:-1,color:"#fca5a5"}); }
    else                  { details.push({name:"RSI",signal:"中立",score:0,color:"#94a3b8"}); }
  }

  // MACD
  if(lr.macd != null && lr.macdSig != null) {
    const cross = lr.macd > lr.macdSig && prev?.macd <= prev?.macdSig;
    const dcross = lr.macd < lr.macdSig && prev?.macd >= prev?.macdSig;
    if(cross)             { score += 2; details.push({name:"MACD",signal:"ゴールデンクロス",score:+2,color:"#22c55e"}); }
    else if(dcross)       { score -= 2; details.push({name:"MACD",signal:"デッドクロス",score:-2,color:"#ef4444"}); }
    else if(lr.macd > lr.macdSig) { score += 1; details.push({name:"MACD",signal:"上昇",score:+1,color:"#86efac"}); }
    else                  { score -= 1; details.push({name:"MACD",signal:"下降",score:-1,color:"#fca5a5"}); }
  }

  // ストキャス
  if(lr.stochK != null) {
    if(lr.stochK < 20)   { score += 2; details.push({name:"ストキャス",signal:"売られすぎ",score:+2,color:"#22c55e"}); }
    else if(lr.stochK > 80){ score -= 2; details.push({name:"ストキャス",signal:"買われすぎ",score:-2,color:"#ef4444"}); }
    else if(lr.stochK > lr.stochD){ score += 1; details.push({name:"ストキャス",signal:"上向き",score:+1,color:"#86efac"}); }
    else                  { score -= 1; details.push({name:"ストキャス",signal:"下向き",score:-1,color:"#fca5a5"}); }
  }

  // 移動平均
  if(lr.ma5 && lr.ma25) {
    if(lr.ma5 > lr.ma25 && prev?.ma5 <= prev?.ma25){ score += 2; details.push({name:"MA",signal:"ゴールデンクロス",score:+2,color:"#22c55e"}); }
    else if(lr.ma5 < lr.ma25 && prev?.ma5 >= prev?.ma25){ score -= 2; details.push({name:"MA",signal:"デッドクロス",score:-2,color:"#ef4444"}); }
    else if(lr.ma5 > lr.ma25){ score += 1; details.push({name:"MA",signal:"上昇トレンド",score:+1,color:"#86efac"}); }
    else { score -= 1; details.push({name:"MA",signal:"下降トレンド",score:-1,color:"#fca5a5"}); }
  }

  // ボリンジャー
  if(lr.bbUpper && lr.bbLower) {
    const range = lr.bbUpper - lr.bbLower;
    const pos = (lr.close - lr.bbLower) / range;
    if(pos < 0.1)       { score += 1; details.push({name:"BB",signal:"下限付近",score:+1,color:"#86efac"}); }
    else if(pos > 0.9)  { score -= 1; details.push({name:"BB",signal:"上限付近",score:-1,color:"#fca5a5"}); }
    else                { details.push({name:"BB",signal:"中間",score:0,color:"#94a3b8"}); }
  }

  const maxScore = 10;
  const prediction = score >= 2 ? "up" : score <= -2 ? "down" : "neutral";
  return { score, maxScore, prediction, details };
}

// ── ユーティリティ ──────────────────────────────────────
function fp(v,market,fxRate,showJPY){
  if(v==null)return"―";
  if(market==="JP") return `¥${Math.round(v).toLocaleString()}`;
  if(showJPY&&fxRate) return `¥${Math.round(v*fxRate).toLocaleString()} ($${v.toFixed(2)})`;
  return `$${v.toFixed(2)}`;
}
function fmtD(str,is1d){if(!str)return"";if(is1d){const t=str.slice(11,16);return t;}const d=new Date(str);return`${d.getMonth()+1}/${d.getDate()}`;}

const TT=({active,payload,label,market,is1d})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",fontSize:11}}><div style={{color:"#94a3b8",marginBottom:4}}>{is1d?label?.slice(11,16):label}</div>{payload.map((p,i)=>p.value!=null&&<div key={i} style={{color:p.color||"#e2e8f0",fontWeight:600}}>{p.name}: {p.value>10&&market?fp(p.value,market):p.value}</div>)}</div>);};
function Signal({label,value,type}){const c={buy:"#22c55e",sell:"#ef4444",neutral:"#94a3b8"}[type];return(<div style={{background:c+"22",border:`1px solid ${c}`,borderRadius:8,padding:"8px 10px",textAlign:"center"}}><div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{label}</div><div style={{fontSize:11,fontWeight:700,color:c}}>{value}</div></div>);}

// ── 予測記録ストレージ ──────────────────────────────────
function loadPredictions(){try{const s=localStorage.getItem("predictions-v1");return s?JSON.parse(s):[];}catch{return[];}}
function savePredictions(preds){try{localStorage.setItem("predictions-v1",JSON.stringify(preds));}catch{}}

// ── 予測・的中率コンポーネント ──────────────────────────
function PredictionPanel({symbol, name, market, signalScore, currentPrice, onSelectStock}){
  const [predictions, setPredictions] = useState(loadPredictions);
  const [verifying,   setVerifying]   = useState(false);
  const [dailyTab,    setDailyTab]    = useState("summary"); // summary | daily | history

  function savePrediction(){
    if(!signalScore||!currentPrice||!symbol)return;
    const newPred = {
      id: Date.now(),
      symbol, name, market,
      prediction: signalScore.prediction,
      score: signalScore.score,
      priceAtPrediction: currentPrice,
      predictedAt: new Date().toISOString(),
      verifiedAt: null,
      priceAtVerification: null,
      result: null,
      horizon: 7,
    };
    const updated = [newPred, ...predictions].slice(0, 200);
    setPredictions(updated);
    savePredictions(updated);
    alert("予測を記録しました！\n7日後に「結果を検証」を押してください。");
  }

  async function verifyAll(){
    setVerifying(true);
    const now = new Date();
    const updated = [...predictions];
    for(let i=0;i<updated.length;i++){
      const p = updated[i];
      if(p.result !== null) continue;
      const daysDiff = (now - new Date(p.predictedAt)) / 86400000;
      if(daysDiff < p.horizon) continue;
      try{
        const r = await fetch(`/api/stock?symbol=${p.symbol}&period=1mo`);
        const j = await r.json();
        if(j.meta?.current){
          const cur = j.meta.current;
          const change = (cur - p.priceAtPrediction) / p.priceAtPrediction * 100;
          const actualDir = change > 1 ? "up" : change < -1 ? "down" : "neutral";
          updated[i] = { ...p, verifiedAt: now.toISOString(), priceAtVerification: cur, actualChange: change,
            result: p.prediction === actualDir ? "hit" : p.prediction === "neutral" ? "neutral" : "miss" };
        }
      }catch{}
      await new Promise(r=>setTimeout(r,300));
    }
    setPredictions(updated);
    savePredictions(updated);
    setVerifying(false);
  }

  function clearAll(){if(window.confirm("全予測履歴を削除しますか？")){setPredictions([]);savePredictions([]);}}

  const verified = predictions.filter(p=>p.result!==null);
  const hits = verified.filter(p=>p.result==="hit");
  const hitRate = verified.length>0?(hits.length/verified.length*100):null;

  // 日別統計
  const dailyStats = {};
  verified.forEach(p=>{
    const day = p.verifiedAt?.slice(0,10) || p.predictedAt?.slice(0,10);
    if(!dailyStats[day]) dailyStats[day]={date:day,total:0,hits:0,misses:0};
    dailyStats[day].total++;
    if(p.result==="hit") dailyStats[day].hits++;
    else if(p.result==="miss") dailyStats[day].misses++;
  });
  const dailyList = Object.values(dailyStats).sort((a,b)=>b.date.localeCompare(a.date));

  // 銘柄別ランキング
  const bySymbol = {};
  verified.forEach(p=>{
    if(!bySymbol[p.symbol]) bySymbol[p.symbol]={symbol:p.symbol,name:p.name,market:p.market,total:0,hits:0};
    bySymbol[p.symbol].total++;
    if(p.result==="hit") bySymbol[p.symbol].hits++;
  });
  const ranking = Object.values(bySymbol).map(s=>({...s,rate:s.hits/s.total*100})).sort((a,b)=>b.rate-a.rate);
  const pending = predictions.filter(p=>p.result===null);

  return(
    <div>
      {/* シグナルスコア */}
      {signalScore&&(
        <div style={{background:"#1e293b",borderRadius:10,padding:14,marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>🎯 シグナルスコア</span>
            <button onClick={savePrediction}
              style={{background:"#3b82f6",border:"none",borderRadius:7,padding:"5px 14px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              📝 予測を記録
            </button>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:12,color:"#94a3b8"}}>総合スコア</span>
              <span style={{fontSize:20,fontWeight:700,color:signalScore.score>=2?"#22c55e":signalScore.score<=-2?"#ef4444":"#94a3b8"}}>
                {signalScore.score>0?"+":""}{signalScore.score} / {signalScore.maxScore}
              </span>
            </div>
            <div style={{background:"#0f172a",borderRadius:999,height:8,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:999,
                width:`${Math.abs(signalScore.score)/signalScore.maxScore*100}%`,
                background:signalScore.score>=2?"#22c55e":signalScore.score<=-2?"#ef4444":"#94a3b8",
                marginLeft:signalScore.score<0?`${(signalScore.maxScore+signalScore.score)/signalScore.maxScore*100}%`:"0"}}/>
            </div>
            <div style={{textAlign:"center",marginTop:8}}>
              <span style={{fontSize:14,fontWeight:700,color:signalScore.prediction==="up"?"#22c55e":signalScore.prediction==="down"?"#ef4444":"#94a3b8"}}>
                {signalScore.prediction==="up"?"📈 上昇予測":signalScore.prediction==="down"?"📉 下降予測":"➡️ 中立"}
              </span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {signalScore.details.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#0f172a",borderRadius:6,padding:"6px 10px"}}>
                <span style={{fontSize:12,color:"#64748b"}}>{d.name}</span>
                <span style={{fontSize:12,fontWeight:700,color:d.color}}>{d.signal} {d.score>0?`+${d.score}`:d.score===0?"±0":d.score}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:8,fontSize:10,color:"#475569"}}>※テクニカル分析に基づく参考情報。投資判断はご自身の責任で。</div>
        </div>
      )}

      {/* 予測成績 */}
      <div style={{background:"#1e293b",borderRadius:10,padding:14,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>📊 予測成績</span>
          <div style={{display:"flex",gap:6}}>
            <button onClick={verifyAll} disabled={verifying}
              style={{background:verifying?"#334155":"#10b981",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:verifying?"default":"pointer"}}>
              {verifying?"検証中...":"🔄 結果を検証"}
            </button>
            <button onClick={clearAll} style={{background:"#450a0a",border:"none",borderRadius:6,padding:"5px 10px",color:"#ef4444",fontSize:11,cursor:"pointer"}}>クリア</button>
          </div>
        </div>

        {predictions.length===0?(
          <div style={{textAlign:"center",color:"#475569",padding:20,fontSize:12}}>まだ予測がありません。</div>
        ):(
          <>
            {/* サマリー */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {[["総予測数",predictions.length,null],["検証済",verified.length,null],["的中率",hitRate!==null?`${hitRate.toFixed(1)}%`:"―",hitRate!==null?hitRate>=60:null]].map(([lb,val,good])=>(
                <div key={lb} style={{background:"#0f172a",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{lb}</div>
                  <div style={{fontSize:18,fontWeight:700,color:good===null?"#f1f5f9":good?"#22c55e":good===false&&hitRate<40?"#ef4444":"#f59e0b"}}>{val}</div>
                </div>
              ))}
            </div>

            {/* タブ切替 */}
            <div style={{display:"flex",background:"#0f172a",borderRadius:8,padding:3,marginBottom:12}}>
              {[["summary","🏆 ランキング"],["daily","📅 日別統計"],["history","📋 履歴"]].map(([k,lb])=>(
                <button key={k} onClick={()=>setDailyTab(k)}
                  style={{flex:1,background:dailyTab===k?"#1e293b":"transparent",border:"none",borderRadius:6,
                    padding:"6px 0",color:dailyTab===k?"#f1f5f9":"#64748b",fontSize:11,cursor:"pointer",fontWeight:700}}>{lb}</button>
              ))}
            </div>

            {/* ランキング */}
            {dailyTab==="summary"&&(
              <div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:8,fontWeight:700}}>🏆 銘柄別的中率ランキング</div>
                {ranking.length===0?<div style={{color:"#475569",fontSize:12,textAlign:"center",padding:20}}>検証済みデータがありません</div>:
                ranking.map((s,i)=>(
                  <button key={s.symbol} onClick={()=>onSelectStock(s)}
                    style={{width:"100%",background:"#0f172a",border:"none",borderRadius:6,padding:"8px 10px",marginBottom:5,
                      display:"flex",alignItems:"center",gap:8,cursor:"pointer",textAlign:"left"}}>
                    <span style={{fontSize:12,color:"#f59e0b",fontWeight:700,width:20}}>{i+1}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#3b82f6",textDecoration:"underline"}}>{s.name}</div>
                      <div style={{fontSize:10,color:"#64748b"}}>{s.total}回中{s.hits}回的中</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:15,fontWeight:700,color:s.rate>=60?"#22c55e":s.rate>=40?"#f59e0b":"#ef4444"}}>{s.rate.toFixed(1)}%</div>
                    </div>
                    <div style={{width:50,background:"#1e293b",borderRadius:999,height:6}}>
                      <div style={{height:"100%",borderRadius:999,background:s.rate>=60?"#22c55e":s.rate>=40?"#f59e0b":"#ef4444",width:`${s.rate}%`}}/>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 日別統計 */}
            {dailyTab==="daily"&&(
              <div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:8,fontWeight:700}}>📅 日別的中率</div>
                {dailyList.length===0?<div style={{color:"#475569",fontSize:12,textAlign:"center",padding:20}}>検証済みデータがありません</div>:
                dailyList.map(d=>{
                  const rate=d.total>0?d.hits/d.total*100:0;
                  return(
                    <div key={d.date} style={{background:"#0f172a",borderRadius:6,padding:"10px 12px",marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>{d.date}</span>
                        <span style={{fontSize:14,fontWeight:700,color:rate>=60?"#22c55e":rate>=40?"#f59e0b":"#ef4444"}}>{rate.toFixed(1)}%</span>
                      </div>
                      <div style={{display:"flex",gap:10,fontSize:11,color:"#64748b",marginBottom:6}}>
                        <span>予測: {d.total}件</span>
                        <span style={{color:"#22c55e"}}>的中: {d.hits}件</span>
                        <span style={{color:"#ef4444"}}>外れ: {d.misses}件</span>
                      </div>
                      <div style={{background:"#1e293b",borderRadius:999,height:6}}>
                        <div style={{height:"100%",borderRadius:999,background:rate>=60?"#22c55e":rate>=40?"#f59e0b":"#ef4444",width:`${rate}%`,transition:"width 0.3s"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 履歴 */}
            {dailyTab==="history"&&(
              <div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:8,fontWeight:700}}>📋 予測履歴</div>
                {predictions.slice(0,20).map(p=>{
                  const days=Math.floor((new Date()-new Date(p.predictedAt))/86400000);
                  const resColor=p.result==="hit"?"#22c55e":p.result==="miss"?"#ef4444":"#94a3b8";
                  const resLabel=p.result==="hit"?"✅ 的中":p.result==="miss"?"❌ 外れ":p.result==="neutral"?"➡️ 中立":`⏳ ${days}日経過`;
                  return(
                    <div key={p.id} style={{background:"#0f172a",borderRadius:6,padding:"8px 10px",marginBottom:5}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{flex:1}}>
                          <button onClick={()=>onSelectStock({symbol:p.symbol,name:p.name,market:p.market})}
                            style={{background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}>
                            <div style={{fontSize:12,fontWeight:700,color:"#3b82f6",textDecoration:"underline"}}>{p.name}</div>
                          </button>
                          <div style={{fontSize:10,color:"#64748b",marginTop:1}}>
                            {p.prediction==="up"?"📈 上昇予測":p.prediction==="down"?"📉 下降予測":"➡️ 中立"} · {new Date(p.predictedAt).toLocaleDateString("ja-JP")}
                          </div>
                          {p.result&&<div style={{fontSize:10,color:"#64748b",marginTop:1}}>
                            {p.market==="JP"?`¥${Math.round(p.priceAtPrediction).toLocaleString()}`:`$${p.priceAtPrediction?.toFixed(2)}`}
                            {" → "}
                            {p.market==="JP"?`¥${Math.round(p.priceAtVerification).toLocaleString()}`:`$${p.priceAtVerification?.toFixed(2)}`}
                            {p.actualChange!=null&&<span style={{color:p.actualChange>=0?"#22c55e":"#ef4444",marginLeft:4}}>({p.actualChange>=0?"+":""}{p.actualChange?.toFixed(2)}%)</span>}
                          </div>}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:resColor,marginLeft:8,whiteSpace:"nowrap"}}>{resLabel}</span>
                      </div>
                    </div>
                  );
                })}
                {pending.length>0&&<div style={{fontSize:11,color:"#64748b",marginTop:8}}>⏳ 検証待ち: {pending.length}件</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── 日本語銘柄辞書 ────────────────────────────────────
const JP_STOCKS = [
  { symbol:"7203.T", name:"トヨタ自動車",          kana:"とよたじどうしゃ",    abbr:["とよた","toyota","トヨタ"] },
  { symbol:"6758.T", name:"ソニーグループ",          kana:"そにーぐるーぷ",      abbr:["そにー","sony","ソニー"] },
  { symbol:"7974.T", name:"任天堂",                  kana:"にんてんどう",        abbr:["にんてん","nintendo","任天堂"] },
  { symbol:"8306.T", name:"三菱UFJフィナンシャル",  kana:"みつびしゆーえふじぇい", abbr:["みつびし","三菱","mufg"] },
  { symbol:"285A.T", name:"キオクシアHD",            kana:"きおくしあ",          abbr:["きおく","kioxia","キオクシア"] },
  { symbol:"9984.T", name:"ソフトバンクグループ",    kana:"そふとばんく",        abbr:["そふと","softbank","ソフトバンク"] },
  { symbol:"6861.T", name:"キーエンス",              kana:"きーえんす",          abbr:["きー","keyence","キーエンス"] },
  { symbol:"4063.T", name:"信越化学工業",            kana:"しんえつかがく",      abbr:["しんえつ","信越"] },
  { symbol:"8035.T", name:"東京エレクトロン",        kana:"とうきょうえれくとろん", abbr:["とうきょう","tel","東エレ"] },
  { symbol:"6098.T", name:"リクルートHD",            kana:"りくるーと",          abbr:["りく","recruit","リクルート"] },
  { symbol:"9432.T", name:"NTT",                    kana:"えぬてぃてぃ",        abbr:["ntt","エヌティティ"] },
  { symbol:"9433.T", name:"KDDI",                   kana:"けーでぃーでぃーあい", abbr:["kddi","au"] },
  { symbol:"4519.T", name:"中外製薬",                kana:"ちゅうがいせいやく",  abbr:["ちゅうがい","中外"] },
  { symbol:"6367.T", name:"ダイキン工業",            kana:"だいきんこうぎょう",  abbr:["だいきん","daikin","ダイキン"] },
  { symbol:"7267.T", name:"ホンダ",                  kana:"ほんだ",              abbr:["ほん","honda","本田"] },
  { symbol:"6954.T", name:"ファナック",              kana:"ふぁなっく",          abbr:["ふぁな","fanuc","ファナック"] },
  { symbol:"6981.T", name:"村田製作所",              kana:"むらたせいさくしょ",  abbr:["むらた","murata","村田"] },
  { symbol:"4568.T", name:"第一三共",                kana:"だいいちさんきょう",  abbr:["だいいち","第一三共"] },
  { symbol:"8058.T", name:"三菱商事",                kana:"みつびししょうじ",    abbr:["みつびし","三菱商事"] },
  { symbol:"8316.T", name:"三井住友FG",              kana:"みついすみとも",      abbr:["みつい","smfg","三井"] },
  { symbol:"7751.T", name:"キヤノン",                kana:"きやのん",            abbr:["きや","canon","キャノン"] },
  { symbol:"6702.T", name:"富士通",                  kana:"ふじつう",            abbr:["ふじ","fujitsu","富士通"] },
  { symbol:"2802.T", name:"味の素",                  kana:"あじのもと",          abbr:["あじ","ajinomoto","味の素"] },
  { symbol:"9022.T", name:"東海旅客鉄道",            kana:"とうかいりょかくてつどう", abbr:["とうかい","jrとうかい","jrc"] },
  { symbol:"6503.T", name:"三菱電機",                kana:"みつびしでんき",      abbr:["みつびし","三菱電機"] },
  { symbol:"4661.T", name:"オリエンタルランド",      kana:"おりえんたるらんど",  abbr:["おり","disney","ディズニー","tdr"] },
  { symbol:"9983.T", name:"ファーストリテイリング",  kana:"ふぁーすとりてーりんぐ", abbr:["ふぁ","ユニクロ","uniqlo","ファスト"] },
  { symbol:"4901.T", name:"富士フイルムHD",          kana:"ふじふいるむ",        abbr:["ふじ","fujifilm","富士フイルム"] },
  { symbol:"9020.T", name:"JR東日本",               kana:"じぇいあーるひがしにほん", abbr:["jr","東日本","jre"] },
  { symbol:"7832.T", name:"バンダイナムコ",          kana:"ばんだいなむこ",      abbr:["ばんだい","bandai","バンダイ"] },
  // 水処理・環境
  { symbol:"6368.T", name:"オルガノ",                kana:"おるがの",            abbr:["おる","organo","オルガノ"] },
  { symbol:"6326.T", name:"クボタ",                  kana:"くぼた",              abbr:["くぼ","kubota","クボタ"] },
  { symbol:"6370.T", name:"栗田工業",                kana:"くりたこうぎょう",    abbr:["くりた","kurita","栗田"], market:"JP" },
  { symbol:"9551.T", name:"メタウォーター",          kana:"めたうぉーたー",      abbr:["めた","metawater","メタウォ"] },
  // 化学・素材
  { symbol:"4901.T", name:"富士フイルムHD",          kana:"ふじふいるむ",        abbr:["ふじ","fujifilm"] },
  { symbol:"3407.T", name:"旭化成",                  kana:"あさひかせい",        abbr:["あさひ","asahi","旭化成"] },
  { symbol:"4182.T", name:"三菱ガス化学",            kana:"みつびしがすかがく",  abbr:["三菱ガス"] },
  // 半導体
  { symbol:"6645.T", name:"オムロン",                kana:"おむろん",            abbr:["おむ","omron","オムロン"] },
  { symbol:"6723.T", name:"ルネサスエレクトロニクス", kana:"るねさす",           abbr:["るね","renesas","ルネサス"] },
  { symbol:"4062.T", name:"イビデン",                kana:"いびでん",            abbr:["いび","ibiden"] },
  // その他主要
  { symbol:"2413.T", name:"エムスリー",              kana:"えむすりー",          abbr:["えむ","m3","エムスリー"] },
  { symbol:"4543.T", name:"テルモ",                  kana:"てるも",              abbr:["てる","terumo","テルモ"] },
  { symbol:"7733.T", name:"オリンパス",              kana:"おりんぱす",          abbr:["おりん","olympus","オリンパス"] },
  { symbol:"9021.T", name:"JR西日本",               kana:"じぇいあーるにしにほん", abbr:["jr西","jrw"] },
  { symbol:"8411.T", name:"みずほFG",               kana:"みずほ",              abbr:["みず","mizuho","みずほ"] },
  { symbol:"8766.T", name:"東京海上HD",              kana:"とうきょうかいじょう", abbr:["東京海上","tokiomarine"] },
  { symbol:"4502.T", name:"武田薬品工業",            kana:"たけだやくひん",      abbr:["たけだ","takeda","武田"] },
  { symbol:"2914.T", name:"JT",                     kana:"じぇいてぃ",          abbr:["jt","日本たばこ"] },
  { symbol:"9101.T", name:"日本郵船",                kana:"にっぽんゆうせん",    abbr:["郵船","nyk"] },
  { symbol:"5108.T", name:"ブリヂストン",            kana:"ぶりぢすとん",        abbr:["ブリジ","bridgestone"] },
  { symbol:"7267.T", name:"本田技研工業",            kana:"ほんだぎけん",        abbr:["ほんだ","honda"] },
];

function searchJPStocks(query) {
  if(!query || query.length < 1) return [];
  const q = query.toLowerCase().replace(/\s/g, "");
  return JP_STOCKS.filter(s => {
    const symbol = s.symbol.toLowerCase();
    const name   = s.name.toLowerCase();
    const kana   = (s.kana||"").toLowerCase();
    const abbrs  = (s.abbr||[]).map(a=>a.toLowerCase());
    return (
      symbol.includes(q) ||
      name.includes(q) ||
      kana.includes(q) ||
      abbrs.some(a => a.startsWith(q) || a.includes(q))
    );
  }).slice(0, 6).map(s => ({ ...s, market: s.symbol.endsWith(".T") ? "JP" : "US" }));
}

// ── 検索ボックス ────────────────────────────────────────
function SearchBox({onSelect}){
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [searching,   setSearching]   = useState(false);
  let timer = null;

  async function fetchSuggestions(q){
    if(!q.trim()){ setSuggestions([]); return; }

    // まず日本語辞書で検索（即時）
    const jpResults = searchJPStocks(q);

    // Yahoo Finance APIでも検索（非同期）
    setSearching(true);
    try{
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      const apiResults = (j.results||[]).filter(s=>!jpResults.some(jp=>jp.symbol===s.symbol));
      // 日本語辞書の結果を優先、APIの結果を後ろに追加
      const combined = [...jpResults, ...apiResults].slice(0, 8);
      setSuggestions(combined);
      setShowSuggest(true);
    }catch{
      setSuggestions(jpResults);
      setShowSuggest(jpResults.length > 0);
    }finally{ setSearching(false); }
  }

  function handleChange(e){
    const v = e.target.value;
    setQuery(v);

    // 日本語辞書は即時表示
    const jpResults = searchJPStocks(v);
    if(jpResults.length > 0){ setSuggestions(jpResults); setShowSuggest(true); }

    clearTimeout(timer);
    timer = setTimeout(()=>fetchSuggestions(v), 400);
  }

  function handleSelect(s){
    onSelect({ symbol: s.symbol, name: s.name, market: s.market||(s.symbol.endsWith(".T")?"JP":"US"), label: s.name });
    setQuery(s.name);
    setSuggestions([]);
    setShowSuggest(false);
  }

  function handleKeyDown(e){
    if(e.key==="Enter"&&query.trim()){
      const sym = query.trim().toUpperCase();
      const market = sym.endsWith(".T")?"JP":"US";
      onSelect({ symbol:sym, name:sym, market });
      setSuggestions([]); setShowSuggest(false);
    }
    if(e.key==="Escape") setShowSuggest(false);
  }

  return(
    <div style={{position:"relative",marginBottom:10}}>
      <div style={{display:"flex",gap:6}}>
        <input value={query} onChange={handleChange} onKeyDown={handleKeyDown}
          onFocus={()=>{ if(query){ const jp=searchJPStocks(query); if(jp.length>0){setSuggestions(jp);setShowSuggest(true);} } }}
          onBlur={()=>setTimeout(()=>setShowSuggest(false),200)}
          placeholder="銘柄名で検索（おるがの / オルガノ / 7203 / AAPL）"
          style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:7,padding:"8px 12px",color:"#f1f5f9",fontSize:13,outline:"none"}}/>
        {searching&&<div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#64748b",fontSize:11}}>検索中...</div>}
      </div>
      {showSuggest&&suggestions.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#1e293b",border:"1px solid #334155",
          borderRadius:8,zIndex:100,marginTop:4,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
          {suggestions.map((s,i)=>(
            <button key={i} onMouseDown={()=>handleSelect(s)}
              style={{width:"100%",background:"transparent",border:"none",borderBottom:"1px solid #0f172a",
                padding:"10px 14px",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{s.name}</span>
                <span style={{fontSize:11,color:"#64748b",marginLeft:8}}>{s.symbol}</span>
              </div>
              <span style={{fontSize:10,color:"#475569",background:"#0f172a",borderRadius:4,padding:"2px 6px"}}>
                {(s.market||(s.symbol.endsWith(".T")?"JP":"US"))==="JP"?"🇯🇵":"🇺🇸"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ポートフォリオ ──────────────────────────────────────
function Portfolio({onSelectStock}){
  const [holdings,setHoldings]=useState(()=>{try{const s=localStorage.getItem("portfolio-v1");return s?JSON.parse(s):[];}catch{return[];}});
  const [prices,setPrices]=useState({});
  const [form,setForm]=useState({symbol:"",name:"",shares:"",buyPrice:""});
  const [showForm,setShowForm]=useState(false);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{try{localStorage.setItem("portfolio-v1",JSON.stringify(holdings));}catch{}},[holdings]);

  async function fetchPrices(){
    if(!holdings.length)return;
    setLoading(true);
    const np={};
    for(const h of holdings){try{const r=await fetch(`/api/stock?symbol=${h.symbol}&period=1mo`);const j=await r.json();if(j.meta?.current)np[h.symbol]=j.meta.current;}catch{}}
    setPrices(np);setLoading(false);
  }
  useEffect(()=>{if(holdings.length)fetchPrices();},[holdings.length]);

  function addHolding(){
    if(!form.symbol||!form.shares||!form.buyPrice)return;
    const sym=form.symbol.trim().toUpperCase();
    setHoldings([...holdings,{symbol:sym,name:form.name||sym,shares:parseFloat(form.shares),buyPrice:parseFloat(form.buyPrice),market:sym.endsWith(".T")?"JP":"US",addedAt:new Date().toISOString()}]);
    setForm({symbol:"",name:"",shares:"",buyPrice:""});setShowForm(false);
  }
  function removeHolding(sym){if(window.confirm("削除しますか？"))setHoldings(holdings.filter(h=>h.symbol!==sym));}

  const totalCost=holdings.reduce((s,h)=>s+h.buyPrice*h.shares,0);
  const totalValue=holdings.reduce((s,h)=>s+(prices[h.symbol]||h.buyPrice)*h.shares,0);
  const totalPnL=totalValue-totalCost;
  const totalPnLPct=totalCost>0?totalPnL/totalCost*100:0;

  return(
    <div style={{padding:"14px 20px"}}>
      <div style={{background:"#1e293b",borderRadius:10,padding:14,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>💼 ポートフォリオ</span>
          <div style={{display:"flex",gap:6}}>
            <button onClick={fetchPrices} disabled={loading} style={{background:"#334155",border:"none",borderRadius:6,padding:"5px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer"}}>{loading?"更新中...":"🔄 価格更新"}</button>
            <button onClick={()=>setShowForm(!showForm)} style={{background:"#3b82f6",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>＋ 追加</button>
          </div>
        </div>
        {holdings.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {[["評価額合計",`¥${Math.round(totalValue).toLocaleString()}`,null],[`損益`,`${totalPnL>=0?"▲":"▼"}¥${Math.abs(Math.round(totalPnL)).toLocaleString()}`,totalPnL>=0],[`損益率`,`${totalPnLPct>=0?"▲":"▼"}${Math.abs(totalPnLPct).toFixed(2)}%`,totalPnLPct>=0]].map(([label,val,isUp])=>(
              <div key={label} style={{background:"#0f172a",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{label}</div>
                <div style={{fontSize:13,fontWeight:700,color:isUp===null?"#f1f5f9":isUp?"#22c55e":"#ef4444"}}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showForm&&(
        <div style={{background:"#1e293b",borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>銘柄を追加</div>
          {[["ティッカー (例: 7203.T)","symbol","text"],["銘柄名 (例: トヨタ自動車)","name","text"],["保有株数","shares","number"],["購入単価","buyPrice","number"]].map(([ph,key,type])=>(
            <input key={key} type={type} placeholder={ph} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}
              style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:7,padding:"8px 10px",color:"#f1f5f9",fontSize:13,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
          ))}
          <div style={{display:"flex",gap:8}}><button onClick={addHolding} style={{flex:1,background:"#3b82f6",border:"none",borderRadius:7,padding:"9px 0",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>追加</button><button onClick={()=>setShowForm(false)} style={{flex:1,background:"#334155",border:"none",borderRadius:7,padding:"9px 0",color:"#94a3b8",fontWeight:600,fontSize:13,cursor:"pointer"}}>キャンセル</button></div>
        </div>
      )}
      {holdings.length===0?<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>「＋ 追加」から保有銘柄を登録してください</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {holdings.map(h=>{
            const cur=prices[h.symbol]||null,pnl=cur?(cur-h.buyPrice)*h.shares:null,pnlPct=cur?(cur-h.buyPrice)/h.buyPrice*100:null,isUp=(pnlPct??0)>=0;
            return(<div key={h.symbol} style={{background:"#1e293b",borderRadius:10,padding:"12px 14px",borderLeft:`3px solid ${isUp?"#22c55e":"#ef4444"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <button onClick={()=>onSelectStock(h)} style={{background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#3b82f6",textDecoration:"underline"}}>{h.name}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{h.symbol} · {h.shares}株 · {fp(h.buyPrice,h.market)}</div>
                </button>
                <button onClick={()=>removeHolding(h.symbol)} style={{background:"#450a0a",border:"none",borderRadius:5,padding:"3px 8px",color:"#ef4444",fontSize:11,cursor:"pointer"}}>削除</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:10}}>
                {[["現在値",cur?fp(cur,h.market):"―",null],["評価損益",pnl!==null?(isUp?"▲":"▼")+"¥"+Math.abs(Math.round(pnl)).toLocaleString():"―",pnl===null?null:isUp],["損益率",pnlPct!==null?(isUp?"▲":"▼")+Math.abs(pnlPct).toFixed(2)+"%":"―",pnl===null?null:isUp]].map(([lb,val,u])=>(
                  <div key={lb} style={{background:"#0f172a",borderRadius:6,padding:"6px 8px"}}><div style={{fontSize:9,color:"#64748b"}}>{lb}</div><div style={{fontSize:12,fontWeight:700,color:u===null?"#f1f5f9":u?"#22c55e":"#ef4444"}}>{val}</div></div>
                ))}
              </div>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

// ── スキャナー ──────────────────────────────────────────
function Scanner({onSelect}){
  const [stocks,    setStocks]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [period,    setPeriod]    = useState("day");
  const [thresh,    setThresh]    = useState(3);
  const [scanned,   setScanned]   = useState(false);
  const [scannerTab,setScannerTab]= useState("ranking"); // ranking | scanner

  async function runScan(){
    setLoading(true);setError("");setStocks([]);
    try{const r=await fetch("/api/scan");const j=await r.json();if(j.error)throw new Error(j.error);setStocks(j.stocks);setScanned(true);}
    catch(e){setError("スキャン失敗。時間をおいて再試行してください。");}
    finally{setLoading(false);}
  }

  const key={day:"changeDay",week:"changeWeek",month:"changeMonth"}[period];
  const plabel={day:"当日",week:"1週間",month:"1ヶ月"}[period];

  // ランキング用：全銘柄を変動率でソート
  const allSorted = [...stocks].sort((a,b)=>b[key]-a[key]);
  const risersAll = allSorted.filter(s=>s[key]>0);
  const fallersAll= [...allSorted].filter(s=>s[key]<0).sort((a,b)=>a[key]-b[key]);

  // スキャナー用：閾値フィルター
  const filtered  = stocks.filter(s=>Math.abs(s[key])>=thresh).sort((a,b)=>Math.abs(b[key])-Math.abs(a[key]));
  const risers    = filtered.filter(s=>s[key]>0);
  const fallers   = filtered.filter(s=>s[key]<0);

  function StockRow({s, rank}){
    const isUp = s[key] >= 0;
    return(
      <button onClick={()=>onSelect(s)}
        style={{width:"100%",background:"#0f172a",border:`1px solid ${isUp?"#22c55e33":"#ef444433"}`,borderRadius:8,
          padding:"10px 14px",cursor:"pointer",textAlign:"left",
          display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
        {rank&&<span style={{fontSize:13,fontWeight:700,color:"#64748b",width:22,textAlign:"center"}}>{rank}</span>}
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{s.name}</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{s.symbol} · ¥{Math.round(s.current).toLocaleString()}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:16,fontWeight:700,color:isUp?"#22c55e":"#ef4444"}}>{isUp?"▲":"▼"}{Math.abs(s[key]).toFixed(2)}%</div>
          <div style={{fontSize:10,color:"#64748b"}}>{plabel}</div>
        </div>
        {/* バー */}
        <div style={{width:40,background:"#1e293b",borderRadius:999,height:6}}>
          <div style={{height:"100%",borderRadius:999,background:isUp?"#22c55e":"#ef4444",width:`${Math.min(Math.abs(s[key])/10*100,100)}%`}}/>
        </div>
      </button>
    );
  }

  return(
    <div style={{padding:"14px 20px"}}>
      {/* 期間切替（共通） */}
      <div style={{background:"#1e293b",borderRadius:10,padding:14,marginBottom:12}}>
        <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
          {[["day","当日"],["week","1週間"],["month","1ヶ月"]].map(([k,lb])=>(
            <button key={k} onClick={()=>setPeriod(k)}
              style={{background:period===k?"#3b82f6":"#0f172a",border:`1px solid ${period===k?"#3b82f6":"#334155"}`,
                borderRadius:6,padding:"5px 14px",color:period===k?"#fff":"#94a3b8",fontSize:12,cursor:"pointer",fontWeight:600}}>{lb}</button>
          ))}
        </div>

        {/* タブ切替 */}
        <div style={{display:"flex",background:"#0f172a",borderRadius:8,padding:3,marginBottom:10}}>
          {[["ranking","📊 値動きランキング"],["scanner","⚡ スキャナー"]].map(([k,lb])=>(
            <button key={k} onClick={()=>setScannerTab(k)}
              style={{flex:1,background:scannerTab===k?"#1e293b":"transparent",border:"none",borderRadius:6,
                padding:"6px 0",color:scannerTab===k?"#f1f5f9":"#64748b",fontSize:12,cursor:"pointer",fontWeight:700}}>
              {lb}
            </button>
          ))}
        </div>

        {scannerTab==="scanner"&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#64748b"}}>閾値:</span>
              {[2,3,5,10].map(v=>(
                <button key={v} onClick={()=>setThresh(v)}
                  style={{background:thresh===v?"#f59e0b22":"#0f172a",border:`1px solid ${thresh===v?"#f59e0b":"#334155"}`,
                    borderRadius:6,padding:"3px 10px",color:thresh===v?"#f59e0b":"#64748b",fontSize:11,cursor:"pointer",fontWeight:700}}>±{v}%</button>
              ))}
            </div>
          </>
        )}

        <button onClick={runScan} disabled={loading}
          style={{width:"100%",background:loading?"#334155":"#3b82f6",border:"none",borderRadius:8,
            padding:"10px 0",color:loading?"#64748b":"#fff",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer"}}>
          {loading?"スキャン中... (30秒ほどかかります)":"🔍 スキャン開始"}
        </button>
      </div>

      {error&&<div style={{background:"#450a0a",border:"1px solid #ef4444",borderRadius:8,padding:12,color:"#fca5a5",fontSize:13,marginBottom:12}}>{error}</div>}

      {scanned&&!loading&&(
        <>
          {/* 値動きランキング */}
          {scannerTab==="ranking"&&(
            <>
              <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>
                {plabel}の値動きランキング（日経225主要30銘柄）
              </div>

              {risersAll.length>0&&(
                <div style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>📈 上昇ランキング</span>
                    <span style={{fontSize:11,color:"#64748b"}}>{risersAll.length}銘柄</span>
                  </div>
                  {risersAll.map((s,i)=><StockRow key={s.symbol} s={s} rank={i+1}/>)}
                </div>
              )}

              {fallersAll.length>0&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#ef4444"}}>📉 下落ランキング</span>
                    <span style={{fontSize:11,color:"#64748b"}}>{fallersAll.length}銘柄</span>
                  </div>
                  {fallersAll.map((s,i)=><StockRow key={s.symbol} s={s} rank={i+1}/>)}
                </div>
              )}

              {stocks.length===0&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>「スキャン開始」を押して銘柄を取得してください</div>}
            </>
          )}

          {/* スキャナー（閾値フィルター） */}
          {scannerTab==="scanner"&&(
            <>
              <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>
                {plabel}に±{thresh}%以上: <span style={{color:"#f1f5f9",fontWeight:700}}>{filtered.length}件</span>
              </div>
              {risers.length>0&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#22c55e",marginBottom:8}}>📈 上昇銘柄 ({risers.length}件)</div>
                  {risers.map(s=><StockRow key={s.symbol} s={s}/>)}
                </div>
              )}
              {fallers.length>0&&(
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#ef4444",marginBottom:8}}>📉 下落銘柄 ({fallers.length}件)</div>
                  {fallers.map(s=><StockRow key={s.symbol} s={s}/>)}
                </div>
              )}
              {filtered.length===0&&<div style={{textAlign:"center",color:"#475569",padding:40,fontSize:13}}>±{thresh}%以上動いた銘柄はありませんでした</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── メイン ──────────────────────────────────────────────
export default function App() {
  const [tab,        setTab]       = useState("chart");
  const [selected,   setSelected]  = useState(null);
  const [periodIdx,  setPeriodIdx] = useState(2);
  const [rawData,    setRawData]   = useState([]);
  const [metaInfo,   setMetaInfo]  = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState("");
  const [showMA5,    setShowMA5]   = useState(true);
  const [showMA25,   setShowMA25]  = useState(true);
  const [showBB,     setShowBB]    = useState(false);
  const [panels,     setPanels]    = useState({macd:true,bb:false,vol:true,stoch:false,rsi:false});
  const [news,       setNews]      = useState([]);
  const [newsLoading,setNewsLoading]=useState(false);
  const [showPred,   setShowPred]  = useState(false);
  const [fxRate,     setFxRate]    = useState(150.0);
  const [showJPY,    setShowJPY]   = useState(false);

  const period=PERIODS[periodIdx];
  const is1d=period.value==="1d";

  const fetchStock=useCallback(async(preset)=>{
    if(!preset)return;
    setLoading(true);setError("");setRawData([]);setMetaInfo(null);setNews([]);
    try{
      const r=await fetch(`/api/stock?symbol=${preset.symbol}&period=${period.value}`);
      const j=await r.json();
      if(j.error)throw new Error(j.error);
      setRawData(j.rows);setMetaInfo(j.meta);
      if(!is1d){
        setNewsLoading(true);
        try{const nr=await fetch(`/api/news?symbol=${preset.symbol}&name=${encodeURIComponent(preset.name||preset.symbol)}`);const nj=await nr.json();setNews(nj.news||[]);}catch{}
        setNewsLoading(false);
      }
    }catch(e){setError("データ取得失敗。時間をおいて再試行してください。");}
    finally{setLoading(false);}
  },[period]);

  useEffect(()=>{if(selected)fetchStock(selected);},[selected,periodIdx]);

  // 為替レート取得
  useEffect(()=>{
    fetch("/api/fx").then(r=>r.json()).then(j=>{ if(j.rate) setFxRate(j.rate); }).catch(()=>{});
  },[]);

  const data=is1d?rawData:applyIndicators(rawData);
  const first=data[0]?.close,last=data[data.length-1]?.close;
  const change=first&&last?((last-first)/first*100):null;
  const isUp=(change??0)>=0;
  const minY=data.length?Math.min(...data.map(d=>(!is1d&&d.bbLower)||d.low))*0.995:0;
  const maxY=data.length?Math.max(...data.map(d=>(!is1d&&d.bbUpper)||d.high))*1.005:0;
  const lr=data[data.length-1];
  const signalScore=!is1d&&data.length>=26?calcSignalScore(data):null;
  const rsiSig=lr?.rsi>70?{v:"買われすぎ",t:"sell"}:lr?.rsi<30?{v:"売られすぎ",t:"buy"}:{v:"中立",t:"neutral"};
  const macdSig=lr?.macd>lr?.macdSig?{v:"上昇",t:"buy"}:{v:"下降",t:"sell"};
  const stochSig=lr?.stochK>80?{v:"買われすぎ",t:"sell"}:lr?.stochK<20?{v:"売られすぎ",t:"buy"}:{v:"中立",t:"neutral"};
  const trendSig=isUp?{v:"上昇",t:"buy"}:{v:"下降",t:"sell"};
  const togglePanel=key=>setPanels(p=>({...p,[key]:!p[key]}));

  function selectStock(s){
    const market=s.symbol?.endsWith(".T")?"JP":"US";
    setSelected({...s,market:s.market||market});
    setTab("chart");
  }

  const TABS=[["chart","📊 チャート"],["portfolio","💼 ポートフォリオ"],["scanner","⚡ スキャナー"]];

  return(
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'Hiragino Sans','Meiryo',sans-serif"}}>
      <div style={{background:"#1e293b",borderBottom:"1px solid #334155",padding:"14px 20px"}}>
        <div style={{fontSize:17,fontWeight:700,color:"#f1f5f9"}}>📈 株価テクニカル分析</div>
        <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>日本株・米国株対応 / 投資助言ではありません</div>
        <div style={{display:"flex",gap:5,marginTop:10,flexWrap:"wrap"}}>
          {TABS.map(([k,lb])=>(<button key={k} onClick={()=>setTab(k)} style={{background:tab===k?"#3b82f6":"transparent",border:`1px solid ${tab===k?"#3b82f6":"#334155"}`,borderRadius:7,padding:"5px 14px",color:tab===k?"#fff":"#64748b",fontSize:12,cursor:"pointer",fontWeight:700}}>{lb}</button>))}
        </div>
      </div>

      {tab==="portfolio"&&<Portfolio onSelectStock={selectStock}/>}
      {tab==="scanner"&&<Scanner onSelect={selectStock}/>}

      {tab==="chart"&&(<>
        <div style={{padding:"12px 20px",borderBottom:"1px solid #1e293b"}}>
          <SearchBox onSelect={selectStock}/>
          <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>🇯🇵 日本株</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {PRESETS.filter(p=>p.market==="JP").map(p=>(<button key={p.symbol} onClick={()=>selectStock(p)} style={{background:selected?.symbol===p.symbol?"#3b82f6":"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 11px",color:selected?.symbol===p.symbol?"#fff":"#94a3b8",fontSize:12,cursor:"pointer",fontWeight:600}}>{p.label}</button>))}
          </div>
          <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>🇺🇸 米国株</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {PRESETS.filter(p=>p.market==="US").map(p=>(<button key={p.symbol} onClick={()=>selectStock(p)} style={{background:selected?.symbol===p.symbol?"#3b82f6":"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"5px 11px",color:selected?.symbol===p.symbol?"#fff":"#94a3b8",fontSize:12,cursor:"pointer",fontWeight:600}}>{p.label}</button>))}
          </div>
        </div>

        {!selected&&!loading&&<div style={{textAlign:"center",color:"#475569",marginTop:60,fontSize:14}}><div style={{fontSize:40}}>📈</div><div style={{marginTop:12}}>銘柄を選んでください</div></div>}
        {loading&&<div style={{textAlign:"center",color:"#64748b",padding:60,fontSize:14}}>データ取得中...</div>}
        {error&&<div style={{margin:"16px 20px",background:"#450a0a",border:"1px solid #ef4444",borderRadius:10,padding:14,color:"#fca5a5",fontSize:13}}>{error}</div>}

        {data.length>0&&!loading&&(<div style={{padding:"14px 20px"}}>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span style={{fontSize:17,fontWeight:700}}>{metaInfo?.name||selected?.name}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{selected?.symbol}</span>
              </div>
              {selected?.market==="US"&&(
                <button onClick={()=>setShowJPY(!showJPY)}
                  style={{background:showJPY?"#f59e0b22":"#1e293b",border:`1px solid ${showJPY?"#f59e0b":"#334155"}`,
                    borderRadius:6,padding:"3px 10px",color:showJPY?"#f59e0b":"#64748b",fontSize:11,cursor:"pointer",fontWeight:700}}>
                  {showJPY?"¥ 円換算中":"$ → ¥"}
                </button>
              )}
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:10,marginTop:4,flexWrap:"wrap"}}>
              <span style={{fontSize:26,fontWeight:700}}>{fp(last,selected?.market,fxRate,showJPY)}</span>
              {change!==null&&<span style={{fontSize:14,fontWeight:700,color:isUp?"#22c55e":"#ef4444"}}>{isUp?"▲":"▼"} {Math.abs(change).toFixed(2)}%（{period.label}）</span>}
            </div>
            {selected?.market==="US"&&showJPY&&<div style={{fontSize:11,color:"#f59e0b",marginTop:2}}>💱 1$ = ¥{fxRate.toFixed(1)}（リアルタイム）</div>}
            <div style={{fontSize:11,color:"#64748b",marginTop:4}}>高値 {fp(Math.max(...data.map(d=>d.high)),selected?.market,fxRate,showJPY)} ／ 安値 {fp(Math.min(...data.map(d=>d.low)),selected?.market,fxRate,showJPY)}</div>
          </div>

          {!is1d&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
            <Signal label="トレンド" value={trendSig.v} type={trendSig.t}/>
            <Signal label="MACD" value={macdSig.v} type={macdSig.t}/>
            <Signal label="RSI" value={rsiSig.v} type={rsiSig.t}/>
            <Signal label="ストキャス" value={stochSig.v} type={stochSig.t}/>
          </div>}

          <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
            {PERIODS.map((p,i)=>(<button key={p.label} onClick={()=>setPeriodIdx(i)} style={{background:periodIdx===i?"#3b82f6":"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"4px 12px",color:periodIdx===i?"#fff":"#94a3b8",fontSize:12,cursor:"pointer",fontWeight:600}}>{p.label}</button>))}
          </div>

          {!is1d&&<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            {[["MA5",showMA5,setShowMA5,"#f59e0b"],["MA25",showMA25,setShowMA25,"#8b5cf6"],["BB",showBB,setShowBB,"#a855f7"]].map(([lb,val,setter,color])=>(<button key={lb} onClick={()=>setter(!val)} style={{background:val?color+"33":"#1e293b",border:`1px solid ${val?color:"#334155"}`,borderRadius:6,padding:"3px 10px",color:val?color:"#64748b",fontSize:11,cursor:"pointer",fontWeight:700}}>{lb}</button>))}
          </div>}

          <div style={{background:"#1e293b",borderRadius:10,padding:"12px 6px 6px",marginBottom:8}}>
            <div style={{fontSize:11,color:"#64748b",marginLeft:8,marginBottom:4}}>{is1d?"日中チャート（5分足）":"価格チャート（終値）"}</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data} margin={{top:4,right:14,left:0,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                <XAxis dataKey="date" tickFormatter={s=>fmtD(s,is1d)} tick={{fill:"#64748b",fontSize:10}} interval="preserveStartEnd"/>
                <YAxis domain={[minY,maxY]} tick={{fill:"#64748b",fontSize:10}} width={70} tickFormatter={v=>selected?.market==="JP"?`¥${Math.round(v).toLocaleString()}`:`$${v.toFixed(0)}`}/>
                <Tooltip content={<TT market={selected?.market} is1d={is1d}/>}/>
                {!is1d&&showBB&&<><Area type="monotone" dataKey="bbUpper" stroke="#a855f7" strokeWidth={1} fill="#a855f733" name="BB上限" dot={false}/><Area type="monotone" dataKey="bbLower" stroke="#a855f7" strokeWidth={1} fill="#0f172a" name="BB下限" dot={false}/><Line type="monotone" dataKey="bbMid" stroke="#a855f7" strokeWidth={1} strokeDasharray="3 2" dot={false} name="BB中央"/></>}
                <Line type="monotone" dataKey="close" stroke={isUp?"#22c55e":"#ef4444"} strokeWidth={2} dot={false} name="終値"/>
                {!is1d&&showMA5&&<Line type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="MA5"/>}
                {!is1d&&showMA25&&<Line type="monotone" dataKey="ma25" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="MA25"/>}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {!is1d&&<>
            <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
              {PANELS.map(p=>(<button key={p.key} onClick={()=>togglePanel(p.key)} style={{background:panels[p.key]?p.color+"33":"#1e293b",border:`1px solid ${panels[p.key]?p.color:"#334155"}`,borderRadius:6,padding:"3px 10px",color:panels[p.key]?p.color:"#64748b",fontSize:11,cursor:"pointer",fontWeight:700}}>{p.label}</button>))}
            </div>
            {panels.macd&&<div style={{background:"#1e293b",borderRadius:10,padding:"12px 6px 6px",marginBottom:8}}><div style={{fontSize:11,color:"#3b82f6",marginLeft:8,marginBottom:4,fontWeight:700}}>MACD (12,26,9)</div><ResponsiveContainer width="100%" height={110}><ComposedChart data={data} margin={{top:4,right:14,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="date" tickFormatter={s=>fmtD(s,false)} tick={{fill:"#64748b",fontSize:9}} interval="preserveStartEnd"/><YAxis tick={{fill:"#64748b",fontSize:9}} width={36}/><Tooltip content={<TT/>}/><ReferenceLine y={0} stroke="#475569"/><Bar dataKey="macdHist" name="ヒストグラム" fill="#3b82f6" opacity={0.7}/><Line type="monotone" dataKey="macd" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MACD"/><Line type="monotone" dataKey="macdSig" stroke="#ef4444" strokeWidth={1.5} dot={false} name="シグナル"/></ComposedChart></ResponsiveContainer></div>}
            {panels.bb&&<div style={{background:"#1e293b",borderRadius:10,padding:"12px 6px 6px",marginBottom:8}}><div style={{fontSize:11,color:"#8b5cf6",marginLeft:8,marginBottom:4,fontWeight:700}}>ボリンジャーバンド（±2σ）</div><ResponsiveContainer width="100%" height={110}><AreaChart data={data} margin={{top:4,right:14,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="date" tickFormatter={s=>fmtD(s,false)} tick={{fill:"#64748b",fontSize:9}} interval="preserveStartEnd"/><YAxis tick={{fill:"#64748b",fontSize:9}} width={70} tickFormatter={v=>selected?.market==="JP"?`¥${Math.round(v).toLocaleString()}`:`$${v.toFixed(0)}`}/><Tooltip content={<TT market={selected?.market}/>}/><Area type="monotone" dataKey="bbUpper" stroke="#a855f7" fill="#a855f722" strokeWidth={1.5} name="上限"/><Area type="monotone" dataKey="bbLower" stroke="#a855f7" fill="#0f172a" strokeWidth={1.5} name="下限"/><Line type="monotone" dataKey="close" stroke="#e2e8f0" strokeWidth={1} dot={false} name="終値"/></AreaChart></ResponsiveContainer></div>}
            {panels.vol&&<div style={{background:"#1e293b",borderRadius:10,padding:"12px 6px 6px",marginBottom:8}}><div style={{fontSize:11,color:"#10b981",marginLeft:8,marginBottom:4,fontWeight:700}}>出来高</div><ResponsiveContainer width="100%" height={90}><BarChart data={data} margin={{top:4,right:14,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="date" tickFormatter={s=>fmtD(s,false)} tick={{fill:"#64748b",fontSize:9}} interval="preserveStartEnd"/><YAxis tick={{fill:"#64748b",fontSize:9}} width={40} tickFormatter={v=>`${(v/1000000).toFixed(0)}M`}/><Tooltip content={<TT/>}/><Bar dataKey="volume" name="出来高" fill="#10b981" opacity={0.7}/></BarChart></ResponsiveContainer></div>}
            {panels.stoch&&<div style={{background:"#1e293b",borderRadius:10,padding:"12px 6px 6px",marginBottom:8}}><div style={{fontSize:11,color:"#f97316",marginLeft:8,marginBottom:4,fontWeight:700}}>ストキャスティクス (14,3)</div><ResponsiveContainer width="100%" height={100}><LineChart data={data} margin={{top:4,right:14,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="date" tickFormatter={s=>fmtD(s,false)} tick={{fill:"#64748b",fontSize:9}} interval="preserveStartEnd"/><YAxis domain={[0,100]} tick={{fill:"#64748b",fontSize:9}} width={28}/><Tooltip content={<TT/>}/><ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3"/><ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3"/><Line type="monotone" dataKey="stochK" stroke="#f97316" strokeWidth={1.5} dot={false} name="%K"/><Line type="monotone" dataKey="stochD" stroke="#fbbf24" strokeWidth={1.5} dot={false} name="%D" strokeDasharray="3 2"/></LineChart></ResponsiveContainer></div>}
            {panels.rsi&&<div style={{background:"#1e293b",borderRadius:10,padding:"12px 6px 6px",marginBottom:8}}><div style={{fontSize:11,color:"#06b6d4",marginLeft:8,marginBottom:4,fontWeight:700}}>RSI (14)</div><ResponsiveContainer width="100%" height={100}><LineChart data={data} margin={{top:4,right:14,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="date" tickFormatter={s=>fmtD(s,false)} tick={{fill:"#64748b",fontSize:9}} interval="preserveStartEnd"/><YAxis domain={[0,100]} tick={{fill:"#64748b",fontSize:9}} width={28}/><Tooltip content={<TT/>}/><ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3"/><ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3"/><Line type="monotone" dataKey="rsi" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="RSI"/></LineChart></ResponsiveContainer></div>}

            {/* シグナルスコア・予測 */}
            <button onClick={()=>setShowPred(!showPred)} style={{width:"100%",background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"12px 14px",cursor:"pointer",textAlign:"left",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>🎯 シグナルスコア・予測管理</span>
              <span style={{color:"#64748b"}}>{showPred?"▲":"▼"}</span>
            </button>
            {showPred&&<PredictionPanel symbol={selected?.symbol} name={metaInfo?.name||selected?.name} market={selected?.market} signalScore={signalScore} currentPrice={last} onSelectStock={selectStock}/>}

            {/* ニュース */}
            <div style={{background:"#1e293b",borderRadius:10,padding:14,marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>📰 関連ニュース</div>
              {newsLoading&&<div style={{color:"#64748b",fontSize:12}}>取得中...</div>}
              {!newsLoading&&news.length>0?(<div style={{display:"flex",flexDirection:"column",gap:8}}>{news.map((n,i)=>(<a key={i} href={n.url} target="_blank" rel="noopener noreferrer" style={{background:"#0f172a",borderRadius:8,padding:"10px 12px",textDecoration:"none",display:"block",borderLeft:"3px solid #3b82f6"}}><div style={{fontSize:12,color:"#93c5fd",lineHeight:1.6}}>{n.title}</div></a>))}</div>):(!newsLoading&&<div style={{fontSize:12,color:"#475569"}}>ニュースが見つかりませんでした</div>)}
            </div>
          </>}

          <div style={{background:"#1e293b",borderRadius:10,padding:14}}>
            <div style={{marginTop:0,padding:"6px 10px",background:"#0f172a",borderRadius:6,fontSize:10,color:"#475569"}}>⚠️ 参考情報のみ。投資判断はご自身の責任で。</div>
          </div>
        </div>)}
      </>)}
    </div>
  );
}
