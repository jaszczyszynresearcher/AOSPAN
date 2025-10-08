// AOSPAN FULL — faithful browser implementation (PL UI, EN code comments)
// GitHub Pages + Qualtrics parent postMessage + Google Sheets logging
// IMPORTANT: Replace LOG_ENDPOINT below with your own Google Apps Script Web App URL.

// === LOGGING ENDPOINT (Google Apps Script) ===
// Paste your Web App URL here, e.g. "https://script.google.com/macros/s/AKfycbx.../exec"
const LOG_ENDPOINT = "https://script.google.com/macros/s/AKfycbxQBGs8cBPaTiYavfCtudpE3CHJP_Cry1Ct4NQCDlmwZ_pPF-90G_-Z6guolZ8Prqpw/exec";

// === CONFIG (timings & structure) ===
const CFG = {
  letterMs: 800,
  postLetterBlankMs: 200,
  interSeriesBreakMs: 1500,
  calibMinMs: 3000,
  calibMaxMs: 6000,
  mathTrainTrials: 15,         // recommended: 15-20
  mixedTrainSeries: 3,
  mixedTrainSetSize: 2,
  mainSetSizes: [3,4,5,6,7],
  mainSeriesPerSize: 3,
  lettersPool: ["F","H","J","K","L","N","P","Q","R","S","T","Y"]
};

// === GLOBAL STATE ===
let letters = [...CFG.lettersPool];
let mathPool = [];              // loaded from data/math_pool.json
let processLimitMs = 4500;      // set after math training (mean + 2.5 SD, clamped)
let state = { phase: "START" };

// Logging containers
const logData = {
  participant_id: `anon_${new Date().toISOString().replace(/[:.]/g,'-')}`,
  timestamp: new Date().toISOString(),
  process_limit_ms: null,
  math_trials: [],              // {expr, key, resp, correct, rt_ms, timeout, context}
  series_logs: [],              // {context, set_size, presented[], recalled[], correct_positions}
  scores: null
};

// Utility: shuffle, sample, clamp
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function sample(arr, n){ const cp=[...arr]; shuffle(cp); return cp.slice(0,n); }
const clamp = (x,min,max)=>Math.max(min,Math.min(max,x));

// Render helpers
const app = ()=>document.getElementById("app");
function screen(html){ app().innerHTML = `<div class="fade">${html}</div><footer>AOSPAN • PL • GitHub Pages</footer>`; }
function btn(label, attrs=""){ return `<button ${attrs}>${label}</button>`; }

// START screen
function showStart(){
  state.phase = "START";
  screen(`
    <h2>Badanie AOSPAN</h2>
    <p>Aby rozpocząć badanie, kliknij przycisk START. Podczas badania będziesz rozwiązywać krótkie działania arytmetyczne (prawda/fałsz) oraz zapamiętywać litery. 
    Ekrany przechodzą automatycznie — nie ma liczników czasu.</p>
    <div class="actions">${btn("START","onclick='startLetterTraining()' aria-label='Rozpocznij badanie'")}</div>
  `);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// LETTER-ONLY training (2 sequences: sizes 3 & 5)
async function startLetterTraining(){
  state.phase = "LETTER_TRAIN";
  const sizes = [3,5];
  for (const n of sizes){
    await runLetterOnlySequence(n);
  }
  screen(`<h2>Trening liter zakończony</h2><p>Za chwilę krótki trening działań arytmetycznych.</p>`);
  setTimeout(startMathTraining, 1200);
}

async function runLetterOnlySequence(n){
  const seq = sample(letters, n);
  for (const L of seq){
    screen(`<div class="center"><div class="letter" aria-label="Litera">${L}</div></div>`);
    await sleep(CFG.letterMs);
    screen(`<div class="center"><div class="badge">...</div></div>`);
    await sleep(CFG.postLetterBlankMs);
  }
  const recalled = await recallScreen(seq);
  logData.series_logs.push({
    context: "letter_practice",
    set_size: n,
    presented: seq,
    recalled,
    correct_positions: recalled.reduce((acc, ch, i)=>acc + (ch===seq[i]?1:0), 0)
  });
}

// MATH-ONLY training (determine processLimitMs)
async function startMathTraining(){
  state.phase = "MATH_TRAIN";
  const trials = sample(mathPool, CFG.mathTrainTrials);
  const rts = [];
  for (const t of trials){
    const res = await presentMathTrial(t, /*useLimit*/ false);
    logData.math_trials.push({ ...res, context:"math_only" });
    if (res.correct && res.rt_ms!=null && res.rt_ms>=200) rts.push(res.rt_ms);
    await sleep(250);
  }
  if (rts.length >= 3){
    const mean = rts.reduce((a,b)=>a+b,0)/rts.length;
    const sd = Math.sqrt(rts.map(x=>(x-mean)**2).reduce((a,b)=>a+b,0)/rts.length);
    processLimitMs = clamp(Math.round(mean + 2.5*sd), CFG.calibMinMs, CFG.calibMaxMs);
  } else {
    processLimitMs = 5000; // fallback
  }
  logData.process_limit_ms = processLimitMs;
  screen(`<h2>Ustalono limit czasu</h2><p>Przechodzimy do krótkiego treningu zadania z literami.</p><p class="mono badge">Limit: ${processLimitMs} ms</p>`);
  setTimeout(startMixedTraining, 1200);
}

// PRESENT one math trial
function presentMathTrial(t, useLimit=true){
  return new Promise(async (resolve)=>{
    state.phase = "MATH";
    const start = performance.now();
    let finished = false, timeoutId=null;

    function finish(resp){
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      const rt = resp.time - start;
      const correct = t.key === resp.key;
      resolve({expr:t.expr, key:t.key, resp:resp.key, correct, rt_ms: resp.timedOut? null: Math.round(rt), timeout: resp.timedOut===true});
    }

    screen(`<h2>Rozwiąż działanie</h2>
      <p class="mono" aria-label="Działanie">${t.expr}</p>
      <div class="actions">
        ${btn("Prawda",`onclick='__mathAnswer(true)'`)}
        ${btn("Fałsz",`onclick='__mathAnswer(false)'`)}
      </div>`);

    // expose handler
    window.__mathAnswer = (ans)=> finish({key: !!ans, time: performance.now(), timedOut:false});

    // optional timeout
    if (useLimit){
      timeoutId = setTimeout(()=>finish({key:null, time: performance.now(), timedOut:true}), processLimitMs);
    }
  });
}

// MIXED practice (3 sequences of size 2)
async function startMixedTraining(){
  state.phase = "MIXED_TRAIN";
  for (let i=0;i<CFG.mixedTrainSeries;i++){
    await runSeries(CFG.mixedTrainSetSize, "mixed_practice");
  }
  screen(`<h2>Trening zakończony</h2><p>Za chwilę rozpocznie się właściwe badanie.</p>`);
  setTimeout(startMainTest, 1200);
}

// MAIN TEST
async function startMainTest(){
  state.phase = "MAIN";
  const plan = [];
  for (const s of CFG.mainSetSizes){
    for (let i=0;i<CFG.mainSeriesPerSize;i++) plan.push(s);
  }
  shuffle(plan);
  for (const n of plan){
    await runSeries(n, "main");
    screen(`<div class="center"><span class="badge">Przerwa...</span></div>`);
    await sleep(CFG.interSeriesBreakMs);
  }
  finalizeAndSend();
}

// RUN one series (n items: math -> letter -> blank, then recall)
async function runSeries(n, context){
  const seqLetters = sample(letters, n);
  for (let i=0;i<n;i++){
    const mt = await presentMathTrial(sample(mathPool,1)[0], true);
    logData.math_trials.push({...mt, context});
    const L = seqLetters[i];
    screen(`<div class="center"><div class="letter">${L}</div></div>`);
    await sleep(CFG.letterMs);
    screen(`<div class="center"><div class="badge">...</div></div>`);
    await sleep(CFG.postLetterBlankMs);
  }
  const recalled = await recallScreen(seqLetters);
  const correctPositions = recalled.reduce((acc,ch,i)=>acc+(ch===seqLetters[i]?1:0),0);
  logData.series_logs.push({context, set_size:n, presented:seqLetters, recalled, correct_positions:correctPositions});
}

// Recall UI (grid 4x3, click to build response, with back/clear/confirm)
function recallScreen(target){
  return new Promise((resolve)=>{
    state.phase = "RECALL";
    const chosen = [];
    function render(){
      const poolHtml = CFG.lettersPool.map(L=>{
        const disabled = chosen.includes(L) ? "disabled" : "";
        return `<button ${disabled} onclick="__pick('${L}')">${L}</button>`;
      }).join("");
      const seq = chosen.join(" ");
      screen(`
        <h2>Odtwórz litery w kolejności</h2>
        <p>Wybrane: <strong class="mono">${seq || "—"}</strong></p>
        <div class="grid">${poolHtml}</div>
        <div class="actions">
          ${btn("Cofnij","class='secondary' onclick='__undo()'")}
          ${btn("Wyczyść","class='secondary' onclick='__clearSel()'")}
          ${btn("Zatwierdź","onclick='__confirm()'")}
        </div>
      `);
    }
    window.__pick = (L)=>{ if(!chosen.includes(L) && chosen.length<target.length){ chosen.push(L); render(); } };
    window.__undo = ()=>{ chosen.pop(); render(); };
    window.__clearSel = ()=>{ chosen.length=0; render(); };
    window.__confirm = ()=>{ 
      const out = [...chosen];
      while(out.length<target.length) out.push(null);
      resolve(out);
    };
    render();
  });
}

// Compute PCU and other scores
function computeScores(){
  const totalPositions = logData.series_logs.filter(s=>s.context==="main").reduce((a,s)=>a+s.set_size,0);
  const totalCorrect = logData.series_logs.filter(s=>s.context==="main").reduce((a,s)=>a+s.correct_positions,0);
  const partialCreditScore = totalCorrect; // PCU (0..75)
  const mathMain = logData.math_trials.filter(t=>t.context==="main");
  const correctMain = mathMain.filter(t=>t.correct===true).length;
  const validRTs = mathMain.filter(t=>t.correct && t.rt_ms!=null).map(t=>t.rt_ms);
  const meanRT = validRTs.length? Math.round(validRTs.reduce((a,b)=>a+b,0)/validRTs.length) : null;
  const timeouts = mathMain.filter(t=>t.timeout===true).length;
  const mathAcc = mathMain.length? (correctMain/mathMain.length) : null;
  return {
    absolute_span: totalPositions,
    partial_credit_score: partialCreditScore,
    partial_credit_ratio: totalPositions? partialCreditScore/totalPositions : null,
    math_accuracy: mathAcc,
    mean_reaction_time_ms: meanRT,
    timeouts: timeouts,
    process_limit_ms: processLimitMs
  };
}

// Finalize, send to Qualtrics and Google Sheets
function finalizeAndSend(){
  state.phase = "END";
  const scores = computeScores();
  logData.scores = scores;
  try{ localStorage.setItem("AOSPAN_LOG_FULL", JSON.stringify(logData)); }catch(e){}
  if (LOG_ENDPOINT && LOG_ENDPOINT.startsWith("http")){
    fetch(LOG_ENDPOINT, { method:"POST", body: JSON.stringify(logData) }).catch(()=>{});
  }
  try{
    window.parent.postMessage(JSON.stringify({type:"AOSPAN_RESULT", result: scores}), "*");
  }catch(e){}
  setTimeout(()=>{ try{ localStorage.removeItem("AOSPAN_LOG_FULL"); }catch(e){} }, 1500);
  screen(`<p>Dziękuję za wykonanie testu.<br> Kliknij strzałkę na dole strony, aby przejść dalej.</p>`);
}

// Boot
async function boot(){
  try{
    const [lettersResp, mathResp] = await Promise.all([
      fetch("data/letters.json"), fetch("data/math_pool.json")
    ]);
    const lettersData = await lettersResp.json();
    const mathData = await mathResp.json();
    if (Array.isArray(lettersData) && lettersData.length>=12) letters = lettersData;
    mathPool = mathData.filter(x=>x && typeof x.expr==="string" && typeof x.key==="boolean");
  }catch(e){
    letters = [...CFG.lettersPool];
    mathPool = [
      {expr:"(6*2)-5=7", key:true},
      {expr:"(8/2)+1=5", key:true},
      {expr:"3+4=9", key:false},
      {expr:"5-3=2", key:true},
      {expr:"2*3=7", key:false}
    ];
  }
  showStart();
}
window.addEventListener("load", boot);
