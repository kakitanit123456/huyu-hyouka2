console.log("app.js loaded v20260122");
/******************************************************
 * app.js（4年理科 評価記録ツール）
 * - localStorageのみ（オフライン）
 * - 名簿、グループ(2・2・3)、12時間チェック（個人）
 * - 12時間ラベル編集（共通テンプレ / 児童別上書き / 適用範囲）
 * - 画面切替（個人 / 一覧）
 * - 一覧：12時間チェック一覧 + 提出物提出率一覧（提出物マスタ + 提出状況）
 * - Export / Import / Reset
 ******************************************************/

/* =========================
   1) Storage keys
========================= */
const THEME_KEY = "rika4_theme_v3";
const DATA_KEY  = "rika4_evaltool_v2"; // ★ v1でも動くが、破壊的変更が増えるならv2推奨

/* =========================
   2) Themeƒ
========================= */
function applyTheme(mode){
  document.documentElement.dataset.theme = mode;
  localStorage.setItem(THEME_KEY, mode);

  const btn = document.getElementById("btnTheme");
  if(btn){
    btn.textContent = (mode === "light") ? "☀️" : "🌙";
    btn.title = (mode === "light") ? "ダークに切り替え" : "ライトに切り替え";
  }
}

function toggleTheme(){
  const cur = document.documentElement.dataset.theme || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
}

/* =========================
   3) Default data（初期データ）
   - ここを増やすと「データ構造の仕様」が増える
========================= */
const defaultData = {
  // 名簿
  students: [
    "（サンプル）児童A","（サンプル）児童B","（サンプル）児童C",
    "（サンプル）児童D","（サンプル）児童E","（サンプル）児童F","（サンプル）児童G"
  ],

  // グループ： studentName -> "G1/G2/G3/''"
  studentGroup: {},

  // 12時間チェック： studentName -> [true/false x12]
  stepsByStudent: {},

  // 12時間ラベル（共通テンプレ）
  stepLabelsGlobal: [
    "調べる①","調べる②","調べる③",
    "まとめる①","まとめる②","まとめる③",
    "発表①","発表②","発表③",
    "ふり返り①","ふり返り②","ふり返り③"
  ],

  // 12時間ラベル（児童別上書き）： studentName -> [labels x12]
  stepLabelsByStudent: {},

  // ーーーーーーーーーーーーーーーーーーーー
  // ★ 提出物（一覧提出率のための土台）
  // 提出物マスタ： [{id,title}, ...]
  // ここは「単元で必要な提出物」を並べるイメージ
  // ーーーーーーーーーーーーーーーーーーーー
  assignments: [
    { id:"a1", title:"ノート提出" },
    { id:"a2", title:"まとめシート" },
    { id:"a3", title:"ふり返りカード" }
  ],

  // 提出状況： studentName -> { assignmentId -> { submitted:boolean } }
  // 例: assignStatusByStudent["（サンプル）児童A"]["a1"].submitted = true
  assignStatusByStudent: {}
};

/* =========================
   4) util
========================= */
function safeClone(obj){
  return JSON.parse(JSON.stringify(obj));
}
function readAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// maxWidth を超える場合だけ縮小（JPEGにして容量も削減）
async function resizeDataURL(dataUrl, maxWidth = 1280){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const w = img.width;
      const h = img.height;

      // 縮小不要
      if(w <= maxWidth){
        resolve(dataUrl);
        return;
      }

      const ratio = maxWidth / w;
      const nw = Math.round(w * ratio);
      const nh = Math.round(h * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = nw;
      canvas.height = nh;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, nw, nh);

      // jpeg 0.85（必要なら調整）
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = ()=> resolve(dataUrl);
    img.src = dataUrl;
  });
}
/* ====================================================
   5) loadData / saveData
   - ここが「古い保存データでも壊れない」ための心臓部
==================================================== */
function loadData(){
  try{
    const raw = localStorage.getItem(DATA_KEY);
    const d = raw ? JSON.parse(raw) : safeClone(defaultData);

    // --- まずトップレベルの型を補正（無い/壊れてる時に復元） ---
    if(!Array.isArray(d.students)) d.students = safeClone(defaultData.students);

    if(!d.studentGroup || typeof d.studentGroup !== "object") d.studentGroup = {};
    if(!d.stepsByStudent || typeof d.stepsByStudent !== "object") d.stepsByStudent = {};

    // step labels
    if(!Array.isArray(d.stepLabelsGlobal) || d.stepLabelsGlobal.length !== 12){
      d.stepLabelsGlobal = safeClone(defaultData.stepLabelsGlobal);
    }
    if(!d.stepLabelsByStudent || typeof d.stepLabelsByStudent !== "object"){
      d.stepLabelsByStudent = {};
    }

    // --- ★提出物（assignments）補完 ---
    if(!Array.isArray(d.assignments)) d.assignments = safeClone(defaultData.assignments);
    d.assignments = d.assignments
      .filter(a => a && typeof a === "object")
      .map(a => ({
        id: String(a.id || "").trim() || ("a" + Math.random().toString(36).slice(2, 8)),
        title: String(a.title || "").trim() || "（無題）"
      }));
    if(d.assignments.length === 0){
      d.assignments = safeClone(defaultData.assignments);
    }

    // --- ★提出状況補完 ---
    if(!d.assignStatusByStudent || typeof d.assignStatusByStudent !== "object"){
      d.assignStatusByStudent = {};
    }

    // --- 児童ごとの不足を補完 ---
    d.students.forEach(name=>{
      // グループ
      if(d.studentGroup[name] == null) d.studentGroup[name] = "";

      // 12時間チェック
      if(!Array.isArray(d.stepsByStudent[name]) || d.stepsByStudent[name].length !== 12){
        d.stepsByStudent[name] = Array.from({length:12}, ()=> false);
      }

      // 提出状況（児童）
      if(!d.assignStatusByStudent[name] || typeof d.assignStatusByStudent[name] !== "object"){
        d.assignStatusByStudent[name] = {};
      }

      // 提出状況（提出物ごと）…存在しなければ作る（提出/メモ/写真3枚）
d.assignments.forEach(a=>{
  const id = a.id;

  if(!d.assignStatusByStudent[name][id] || typeof d.assignStatusByStudent[name][id] !== "object"){
    d.assignStatusByStudent[name][id] = { submitted:false, memo:"", photos:["","",""] };
  }else{
    const obj = d.assignStatusByStudent[name][id];

    if(typeof obj.submitted !== "boolean") obj.submitted = false;
    if(typeof obj.memo !== "string") obj.memo = "";
    if(!Array.isArray(obj.photos)) obj.photos = ["","",""];

    // 3枚に正規化
    obj.photos = obj.photos.slice(0,3).map(x => (typeof x === "string" ? x : ""));
    while(obj.photos.length < 3) obj.photos.push("");
  }
});
    });

    // 名簿が空なら最低1人
    if(d.students.length === 0){
  d.students = ["児童1"];
  d.studentGroup["児童1"] = "";
  d.stepsByStudent["児童1"] = Array.from({length:12}, ()=> false);
  d.assignStatusByStudent["児童1"] = {};
  d.assignments.forEach(a=>{
    d.assignStatusByStudent["児童1"][a.id] = { submitted:false, memo:"", photos:["","",""] };
  });
}

    return d;

  }catch(e){
    console.warn("loadData error:", e);
    return safeClone(defaultData);
  }
}

function saveData(){
  localStorage.setItem(DATA_KEY, JSON.stringify(state.data));
}

/* =========================
   6) state
========================= */
const state = {
  data: loadData(),
  currentStudent: null,
  // 一覧提出率の「現在選択中の提出物」
  currentAssignId: null
};

/* ====================================================
   7) Helpers（ここから下はUI操作のための部品）
==================================================== */
function ensureStudent(name){
  // 名簿にいる児童のデータが壊れていたら復元する
  if(state.data.studentGroup[name] == null) state.data.studentGroup[name] = "";

  if(!state.data.stepsByStudent) state.data.stepsByStudent = {};
  if(!Array.isArray(state.data.stepsByStudent[name]) || state.data.stepsByStudent[name].length !== 12){
    state.data.stepsByStudent[name] = Array.from({length:12}, ()=> false);
  }

  // 提出状況
  if(!state.data.assignStatusByStudent) state.data.assignStatusByStudent = {};
  if(!state.data.assignStatusByStudent[name] || typeof state.data.assignStatusByStudent[name] !== "object"){
    state.data.assignStatusByStudent[name] = {};
  }

  // 現在の提出物マスタに合わせて「不足分」を作る
  const list = getAssignments();
  list.forEach(a=>{
  const id = a.id;

  if(!state.data.assignStatusByStudent[name][id] || typeof state.data.assignStatusByStudent[name][id] !== "object"){
    state.data.assignStatusByStudent[name][id] = { submitted:false, memo:"", photos:["","",""] };
  }

  const obj = state.data.assignStatusByStudent[name][id];
  if(typeof obj.submitted !== "boolean") obj.submitted = false;
  if(typeof obj.memo !== "string") obj.memo = "";
  if(!Array.isArray(obj.photos)) obj.photos = ["","",""];

  obj.photos = obj.photos.slice(0,3).map(x => (typeof x === "string" ? x : ""));
  while(obj.photos.length < 3) obj.photos.push("");
});
}

function getGroupMembers(studentName){
  const g = (state.data.studentGroup && state.data.studentGroup[studentName]) || "";
  if(!g) return [studentName];
  return state.data.students.filter(n => ((state.data.studentGroup && state.data.studentGroup[n]) || "") === g);
}

/* =========================
   Assignments helpers（提出物マスタ）
   ※ Step Aでは「一覧で提出率計算」まで使う
   ※ 追加/編集/削除のUIは次ステップで入れる
========================= */
function getAssignments(){
  if(!Array.isArray(state.data.assignments)) state.data.assignments = [];
  return state.data.assignments;
}

function getAssignTitle(assignId){
  const a = getAssignments().find(x => x.id === assignId);
  return a ? a.title : "（不明）";
}

/* ====================================================
   8) View switch（個人 / 一覧）
==================================================== */
function setView(mode){
  const personal = document.getElementById("viewPersonal");
  const overview = document.getElementById("viewOverview");
  const bP = document.getElementById("btnViewPersonal");
  const bO = document.getElementById("btnViewOverview");
  if(!personal || !overview || !bP || !bO) return;

  const isOverview = (mode === "overview");
  personal.style.display = isOverview ? "none" : "block";
  overview.style.display = isOverview ? "block" : "none";

  // ボタン見た目
  bP.classList.toggle("primary", !isOverview);
  bO.classList.toggle("primary", isOverview);

  if(isOverview){
    renderOverviewSteps();         // 12時間チェック一覧
    renderOverviewAssignments();   // 提出物提出率一覧
  }
}

/* ====================================================
   ★画面切替（メイン / 名簿設定 / 提出物設定）
==================================================== */
function setScreen(screen){
  const main   = document.getElementById("screenMain");
  const roster = document.getElementById("screenRoster");
  const assign = document.getElementById("screenAssignments");
  const back   = document.getElementById("btnBackMain");

  if(!main || !roster || !assign) return;

  main.style.display   = (screen === "main") ? "block" : "none";
  roster.style.display = (screen === "roster") ? "block" : "none";
  assign.style.display = (screen === "assignments") ? "block" : "none";

  if(back){
    back.style.display = (screen === "main") ? "none" : "inline-flex";
  }

  // （今は箱だけなので、ここでは何もしなくてOK）
  // いずれここで renderRosterScreen() / renderAssignmentsScreen() を呼ぶ
}

function bindScreenButtons(){
  const bR = document.getElementById("btnOpenRoster");
  const bA = document.getElementById("btnOpenAssign");
  const bB = document.getElementById("btnBackMain");

  if(bR) bR.onclick = ()=> setScreen("roster");
  if(bA) bA.onclick = ()=> setScreen("assignments");
  if(bB) bB.onclick = ()=> setScreen("main");
}

function renderAssignPhotoGrid(student, assignId){
  const grid = document.getElementById("personalAssignPhotoGrid");
  if(!grid) return;

  ensureStudent(student);
  const obj = state.data.assignStatusByStudent[student][assignId];
  const photos = obj.photos || ["","",""];

  grid.innerHTML = "";

  for(let i=0;i<3;i++){
    const cell = document.createElement("div");
    cell.className = "card";
    cell.style.padding = "8px";

    const img = document.createElement("img");
    img.style.width = "100%";
    img.style.height = "120px";
    img.style.objectFit = "contain";
    img.style.border = "1px solid var(--line)";
    img.style.borderRadius = "10px";
    img.style.display = photos[i] ? "block" : "none";
    if(photos[i]) img.src = photos[i];

    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "8px";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    const label = document.createElement("div");
    label.className = "small";
    label.textContent = `写真${i+1}`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn";
    del.textContent = "削除";
    del.onclick = ()=>{
      ensureStudent(student);
      state.data.assignStatusByStudent[student][assignId].photos[i] = "";
      saveData();
      renderSideOverview();
      renderAssignPhotoGrid(student, assignId);
    };

    row.appendChild(label);
    row.appendChild(del);

    cell.appendChild(img);
    cell.appendChild(row);
    grid.appendChild(cell);
  }
}

/* ====================================================
   Step B：個人ビュー 提出物（提出：済/未）
==================================================== */

function initPersonalAssignments(){
  const sel = document.getElementById("personalAssignSelect");
  if(!sel) return;

  const list = getAssignments();
  if(list.length === 0){
    state.currentAssignId = null;
    return;
  }

  // まだ選択がなければ先頭
  if(!state.currentAssignId || !list.some(a => a.id === state.currentAssignId)){
    state.currentAssignId = list[0].id;
  }
}

function renderPersonalAssignments(){
  const sel = document.getElementById("personalAssignSelect");
  const badge = document.getElementById("personalAssignBadge");
  const statusText = document.getElementById("personalAssignStatusText");
  const toggleBtn = document.getElementById("btnToggleSubmitted");
  if(!sel || !badge || !statusText || !toggleBtn) return;

  initPersonalAssignments();

  const assigns = getAssignments();
   if(!state.currentAssignId || !assigns.some(a => a.id === state.currentAssignId)){
  state.currentAssignId = assigns[0].id;
}
  sel.innerHTML = "";

  assigns.forEach(a=>{
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.title;
    sel.appendChild(o);
  });

  if(state.currentAssignId){
    sel.value = state.currentAssignId;
  }

  // 提出物を選び直したら再描画
  sel.onchange = ()=>{
    state.currentAssignId = sel.value;
    saveData();
    renderPersonalAssignments();
    renderSideOverview(); // ★追加
  };

  // ← →
  const prevBtn = document.getElementById("btnPersonalPrevAssign");
  const nextBtn = document.getElementById("btnPersonalNextAssign");

  if(prevBtn){
    prevBtn.onclick = ()=>{
      if(assigns.length === 0) return;
      const idx = assigns.findIndex(a => a.id === state.currentAssignId);
      const nextIdx = (idx <= 0) ? assigns.length - 1 : idx - 1;
      state.currentAssignId = assigns[nextIdx].id;
      saveData();
      renderPersonalAssignments();
      renderSideOverview(); // ★追加
    };
  }

  if(nextBtn){
    nextBtn.onclick = ()=>{
      if(assigns.length === 0) return;
      const idx = assigns.findIndex(a => a.id === state.currentAssignId);
      const nextIdx = (idx >= assigns.length - 1) ? 0 : idx + 1;
      state.currentAssignId = assigns[nextIdx].id;
      saveData();
      renderPersonalAssignments();
      renderSideOverview(); // ★追加
    };
  }

  // 児童×提出物の提出状況
  const student = state.currentStudent;
  const assignId = state.currentAssignId;

  if(!student || !assignId){
    badge.textContent = "提出：-";
    statusText.textContent = "---";
    toggleBtn.disabled = true;
    return;
  }

  ensureStudent(student);

  const st = state.data.assignStatusByStudent?.[student]?.[assignId];
  const submitted = !!(st && st.submitted);

   // 追加：メモ
const memoEl = document.getElementById("personalAssignMemo");
if(memoEl){
  const memo = (st && typeof st.memo === "string") ? st.memo : "";
  memoEl.value = memo;

  memoEl.oninput = ()=>{
    ensureStudent(student);
    state.data.assignStatusByStudent[student][assignId].memo = memoEl.value;
    saveData();
  };
}
  badge.textContent = submitted ? "提出：済" : "提出：未";
  statusText.textContent = `提出物「${getAssignTitle(assignId)}」：${submitted ? "提出済み" : "未提出"}`;

  toggleBtn.disabled = false;
  toggleBtn.textContent = submitted ? "提出：済 → 未に戻す" : "提出：未 → 済にする";

  // ボタンで提出状況をトグル
  toggleBtn.onclick = ()=>{
    ensureStudent(student);

    // submitted を反転（最新値で）
   const cur = !!state.data.assignStatusByStudent?.[student]?.[assignId]?.submitted;
   state.data.assignStatusByStudent[student][assignId].submitted = !cur;

    saveData();
    renderPersonalAssignments();
     renderSideOverview(); // ★追加（提出率・一覧も更新）
     
    // 一覧表示中なら提出率カードも更新
    const overview = document.getElementById("viewOverview");
    if(overview && overview.style.display !== "none"){
      renderOverviewAssignments();
    }
  };
   // 追加：写真
const photoInput = document.getElementById("personalAssignPhotoInput");
const clearPhotosBtn = document.getElementById("btnClearAssignPhotos");

if(photoInput){
  photoInput.onchange = async ()=>{
    const file = photoInput.files && photoInput.files[0];
    if(!file) return;

    ensureStudent(student);
    const obj = state.data.assignStatusByStudent[student][assignId];

    const idx = (obj.photos || ["","",""]).findIndex(x => !x);
    if(idx === -1){
      alert("写真は最大3枚までです。削除してから追加してください。");
      photoInput.value = "";
      return;
    }

    // ★ここが既存関数に依存
    const dataUrl = await readAsDataURL(file);
    const resized = await resizeDataURL(dataUrl, 1280);

    obj.photos[idx] = resized;

    saveData();
    renderSideOverview();
    renderAssignPhotoGrid(student, assignId);
    photoInput.value = "";
  };
}

if(clearPhotosBtn){
  clearPhotosBtn.onclick = ()=>{
    if(!confirm("この提出物の写真をすべて削除しますか？")) return;
    ensureStudent(student);
    state.data.assignStatusByStudent[student][assignId].photos = ["","",""];
    saveData();
    renderSideOverview();
    renderAssignPhotoGrid(student, assignId);
  };
}

// 最後に描画
renderAssignPhotoGrid(student, assignId);
}


function openSideDrawer(){
  const d = document.getElementById("sideDrawer");
  const o = document.getElementById("drawerOverlay");
  if(!d || !o) return;

  d.classList.add("isOpen");
  o.classList.add("isOpen");
  d.setAttribute("aria-hidden", "false");
  o.setAttribute("aria-hidden", "false");

  // ★開いたタイミングでサイド一覧を描画
  renderSideOverview(true);
}

function closeSideDrawer(){
  const d = document.getElementById("sideDrawer");
  const o = document.getElementById("drawerOverlay");
  if(!d || !o) return;

  d.classList.remove("isOpen");
  o.classList.remove("isOpen");
  d.setAttribute("aria-hidden", "true");
  o.setAttribute("aria-hidden", "true");
}

function bindSideDrawer(){
  const openBtn = document.getElementById("btnToggleSide");
  const closeBtn = document.getElementById("btnCloseSide");
  const overlay = document.getElementById("drawerOverlay");

  if(openBtn) openBtn.onclick = openSideDrawer;
  if(closeBtn) closeBtn.onclick = closeSideDrawer;
  if(overlay) overlay.onclick = closeSideDrawer;

  // ESCで閉じる
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      const d = document.getElementById("sideDrawer");
      if(d && d.classList.contains("isOpen")) closeSideDrawer();
    }
  });
}

/* ====================================================
   9) 名簿UI
==================================================== */
function renderStudentSelect(){
  const sel = document.getElementById("studentSelect");
  if(!sel) return;

  sel.innerHTML = "";
  state.data.students.forEach(name=>{
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });

  if(!state.currentStudent) state.currentStudent = state.data.students[0];
  if(!state.data.students.includes(state.currentStudent)) state.currentStudent = state.data.students[0];

  sel.value = state.currentStudent;

  sel.onchange = ()=>{
    state.currentStudent = sel.value;
    ensureStudent(state.currentStudent);

    renderGroupUI();
    renderSteps();
    updateStepCount();

   renderPersonalAssignments(); // ★追加：個人の提出物表示も児童に合わせて更新
   renderSideOverview(); // ★追加（児童切替に追従）
    saveData();
  };
}

/* ====================================================
   10) グループUI
==================================================== */
function renderGroupUI(){
  const sel = document.getElementById("groupSelect");
  const cnt = document.getElementById("groupCount");
  if(!sel || !cnt) return;

  ensureStudent(state.currentStudent);

  // 現在の児童のグループ
  const g = (state.data.studentGroup && state.data.studentGroup[state.currentStudent]) || "";
  sel.value = g;

  // 人数集計
  const counts = {G1:0, G2:0, G3:0, "":0};
  state.data.students.forEach(n=>{
    const gg = (state.data.studentGroup && state.data.studentGroup[n]) || "";
    counts[gg] = (counts[gg] ?? 0) + 1;
  });
  cnt.textContent = `人数：G1=${counts.G1} / G2=${counts.G2} / G3=${counts.G3}（未=${counts[""]}）`;

  sel.onchange = ()=>{
    if(!state.data.studentGroup) state.data.studentGroup = {};
    state.data.studentGroup[state.currentStudent] = sel.value;
    saveData();
    renderGroupUI(); // 再描画して人数更新
  };
}

function autoAssignGroups223(){
  const list = state.data.students.slice();
  const plan = ["G1","G1","G2","G2","G3","G3","G3"];

  if(!state.data.studentGroup) state.data.studentGroup = {};
  list.forEach((n,i)=>{
    state.data.studentGroup[n] = plan[i] || "G3";
  });

  saveData();
  renderGroupUI();
}

/* ====================================================
   11) 12時間チェック（個人）
==================================================== */
function updateStepCount(){
  const badge = document.getElementById("stepCount");
  if(!badge) return;

  ensureStudent(state.currentStudent);
  const arr = state.data.stepsByStudent[state.currentStudent] || [];
  const done = arr.filter(Boolean).length;
  badge.textContent = `${done}/12`;
}

function getStepLabelsFor(studentName){
  // 児童別上書きがあるならそれ、なければ共通テンプレ
  const per = state.data.stepLabelsByStudent && state.data.stepLabelsByStudent[studentName];
  if(Array.isArray(per) && per.length === 12) return per;
  return state.data.stepLabelsGlobal || safeClone(defaultData.stepLabelsGlobal);
}

function renderSteps(){
  const wrap = document.getElementById("stepsWrap");
  if(!wrap) return;

  ensureStudent(state.currentStudent);

  const arr = state.data.stepsByStudent[state.currentStudent];
  const labels = getStepLabelsFor(state.currentStudent);

  wrap.innerHTML = "";

  for(let i=0;i<12;i++){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn stepBtn";
    btn.dataset.stepIndex = String(i);

    btn.innerHTML = `
      <div style="font-weight:700">${i+1}</div>
      <div style="font-size:11px;color:var(--muted);line-height:1.2; margin-top:2px; overflow-wrap:anywhere">
        ${labels[i] || ""}
      </div>
    `;

    if(arr[i]) btn.classList.add("isDone");
    wrap.appendChild(btn);
  }

  updateStepCount();
}

function bindSteps(){
  const wrap = document.getElementById("stepsWrap");
  const clearBtn = document.getElementById("btnClearSteps");
  if(!wrap) return;

  // 12ボタンのON/OFF（イベント委任）
  wrap.addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn || !wrap.contains(btn)) return;

    const idxStr = btn.dataset.stepIndex;
    if(idxStr == null) return;

    const idx = Number(idxStr);
    if(Number.isNaN(idx) || idx < 0 || idx > 11) return;

    ensureStudent(state.currentStudent);
    const arr = state.data.stepsByStudent[state.currentStudent];

    arr[idx] = !arr[idx];

    saveData();
    renderSteps(); // 再描画で色とカウントが更新される
    renderSideOverview(); // ★追加（サイド一覧も更新）
  });

  // 全解除
  if(clearBtn){
    clearBtn.onclick = ()=>{
      if(!confirm("この児童の12時間チェックをすべて外しますか？")) return;
      ensureStudent(state.currentStudent);
      state.data.stepsByStudent[state.currentStudent] = Array.from({length:12}, ()=> false);
      saveData();
      renderSteps();
      renderSideOverview(); // ★追加
    };
  }
}

/* ====================================================
   12) 12時間ラベル編集
==================================================== */
function renderStepLabelInputs(labels){
  const box = document.getElementById("stepLabelInputs");
  if(!box) return;
  box.innerHTML = "";

  for(let i=0;i<12;i++){
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.padding = "10px";

    const t = document.createElement("div");
    t.className = "sub";
    t.textContent = `${i+1}番`;

    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = labels[i] || "";
    inp.dataset.idx = String(i);

    wrap.appendChild(t);
    wrap.appendChild(inp);
    box.appendChild(wrap);
  }
}

function readStepLabelInputs(){
  const box = document.getElementById("stepLabelInputs");
  const inputs = box ? Array.from(box.querySelectorAll("input")) : [];
  const arr = Array.from({length:12}, ()=> "");

  inputs.forEach(inp=>{
    const idx = Number(inp.dataset.idx);
    if(!Number.isNaN(idx) && idx>=0 && idx<12){
      arr[idx] = (inp.value || "").trim();
    }
  });

  // 空欄は見づらいので最低限の保険（不要なら消してOK）
  for(let i=0;i<12;i++){
    if(!arr[i]) arr[i] = `${i+1}`;
  }
  return arr;
}

function getTargetsByScope(scope){
  if(scope === "all"){
    return state.data.students.slice();
  }
  if(scope === "group"){
    return getGroupMembers(state.currentStudent);
  }
  if(scope === "selected"){
    const list = document.getElementById("selectedStudentsList");
    if(!list) return [state.currentStudent];
    const checks = Array.from(list.querySelectorAll("input[type=checkbox]"));
    const names = checks.filter(c=>c.checked).map(c=>c.value);
    return (names.length ? names : [state.currentStudent]);
  }
  // current
  return [state.currentStudent];
}

function applyStepLabelsToTargets(labels, targetNames){
  if(!state.data.stepLabelsByStudent) state.data.stepLabelsByStudent = {};
  targetNames.forEach(n=>{
    state.data.stepLabelsByStudent[n] = labels.slice();
  });
  saveData();
}

function renderSelectedStudentsList(){
  const list = document.getElementById("selectedStudentsList");
  if(!list) return;

  list.innerHTML = "";
  state.data.students.forEach(name=>{
    const label = document.createElement("label");
    label.className = "pill";
    label.style.justifyContent = "space-between";

    const span = document.createElement("span");
    span.textContent = name;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.style.width = "auto";

    // 初期：現在の児童はON
    if(name === state.currentStudent) cb.checked = true;

    label.appendChild(span);
    label.appendChild(cb);
    list.appendChild(label);
  });
}

function openStepEditor(){
  const panel = document.getElementById("stepEditor");
  if(!panel) return;

  panel.style.display = "block";

  // 現在の児童のラベルを読み込む
  const labels = getStepLabelsFor(state.currentStudent);
  renderStepLabelInputs(labels);

  // 「選択した児童だけ」用チェックリスト
  renderSelectedStudentsList();

  // selected のときだけ表示
  const scopeSel = document.getElementById("stepApplyScope");
  const box = document.getElementById("selectedStudentsBox");
  if(scopeSel && box){
    box.style.display = (scopeSel.value === "selected") ? "block" : "none";
    scopeSel.onchange = ()=>{
      box.style.display = (scopeSel.value === "selected") ? "block" : "none";
    };
  }
}

function closeStepEditor(){
  const panel = document.getElementById("stepEditor");
  if(panel) panel.style.display = "none";
}

function bindStepEditor(){
  const btn = document.getElementById("btnEditSteps");
  const btnClose = document.getElementById("btnCloseStepEditor");
  const btnSave = document.getElementById("btnSaveStepLabels");
  const btnLoadGlobal = document.getElementById("btnLoadGlobalLabels");
  const btnSaveGlobal = document.getElementById("btnSaveGlobalLabels");
  const scopeSel = document.getElementById("stepApplyScope");

  if(btn) btn.onclick = openStepEditor;
  if(btnClose) btnClose.onclick = closeStepEditor;

  // 共通テンプレを読み込み（表示だけ）
  if(btnLoadGlobal){
    btnLoadGlobal.onclick = ()=>{
      const labels = state.data.stepLabelsGlobal || safeClone(defaultData.stepLabelsGlobal);
      renderStepLabelInputs(labels);
    };
  }

  // 共通テンプレとして保存（全員の上書きをクリア）
  if(btnSaveGlobal){
    btnSaveGlobal.onclick = ()=>{
      if(!confirm("今の内容を共通テンプレとして保存しますか？\n（全員の個別上書きは解除されます）")) return;
      const labels = readStepLabelInputs();
      state.data.stepLabelsGlobal = labels.slice();
      state.data.stepLabelsByStudent = {};
      saveData();
      renderSteps();
      alert("共通テンプレを保存しました！");
    };
  }

  // 保存して適用
  if(btnSave){
    btnSave.onclick = ()=>{
      const labels = readStepLabelInputs();
      const scope = scopeSel ? scopeSel.value : "current";
      const targets = getTargetsByScope(scope);

      applyStepLabelsToTargets(labels, targets);

      renderSteps();
      closeStepEditor();
      alert(`保存しました（適用：${targets.length}人）`);
    };
  }
}

/* ====================================================
   13) 一覧：12時間チェック一覧
==================================================== */
function renderOverviewSteps(){
  const host = document.getElementById("overviewTable");
  if(!host) return;

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  state.data.students.forEach(name=>{
    ensureStudent(name);

    const arr = state.data.stepsByStudent[name] || [];
    const done = arr.filter(Boolean).length;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "btn";
    row.style.textAlign = "left";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "12px";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:800">${name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${done}/12 完了</div>
    `;

    const right = document.createElement("div");
    right.className = "badge";
    right.textContent = `${done}/12`;

    // 行クリック → その児童へ切替して「個人」に戻る
    row.onclick = ()=>{
  state.currentStudent = name;
  saveData();

  renderStudentSelect();
  renderGroupUI();
  renderSteps();
  renderPersonalAssignments(); // ★追加

  setView("personal");
};

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });

  host.innerHTML = "";
  host.appendChild(wrap);
}

/* ====================================================
   14) 一覧：提出物提出率（overviewAssign〜）
   - index.htmlに追加した以下IDに依存
     overviewAssignRateBadge
     overviewAssignSelect
     btnOverviewPrevAssign
     btnOverviewNextAssign
     overviewAssignTable
==================================================== */
function initOverviewAssignments(){
  const sel = document.getElementById("overviewAssignSelect");
  if(!sel) return;

  const list = getAssignments();
  if(list.length === 0){
    state.currentAssignId = null;
    return;
  }

  // まだ選択がなければ先頭
  if(!state.currentAssignId || !list.some(a => a.id === state.currentAssignId)){
    state.currentAssignId = list[0].id;
  }
}

function renderOverviewAssignments(){
  const sel = document.getElementById("overviewAssignSelect");
  const badge = document.getElementById("overviewAssignRateBadge");
  const table = document.getElementById("overviewAssignTable");
  if(!sel || !badge || !table) return;

  initOverviewAssignments();

  const assigns = getAssignments();
  sel.innerHTML = "";

  assigns.forEach(a=>{
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.title;
    sel.appendChild(o);
  });

  if(state.currentAssignId){
    sel.value = state.currentAssignId;
  }

  // 選択が変わったら再描画
  sel.onchange = ()=>{
    state.currentAssignId = sel.value;
    saveData();
    renderOverviewAssignments();
  };

  // ← → ボタン
  const prevBtn = document.getElementById("btnOverviewPrevAssign");
  const nextBtn = document.getElementById("btnOverviewNextAssign");

  if(prevBtn){
    prevBtn.onclick = ()=>{
      if(assigns.length === 0) return;
      const idx = assigns.findIndex(a => a.id === state.currentAssignId);
      const nextIdx = (idx <= 0) ? assigns.length - 1 : idx - 1;
      state.currentAssignId = assigns[nextIdx].id;
      saveData();
      renderOverviewAssignments();
    };
  }

  if(nextBtn){
    nextBtn.onclick = ()=>{
      if(assigns.length === 0) return;
      const idx = assigns.findIndex(a => a.id === state.currentAssignId);
      const nextIdx = (idx >= assigns.length - 1) ? 0 : idx + 1;
      state.currentAssignId = assigns[nextIdx].id;
      saveData();
      renderOverviewAssignments();
    };
  }

  // 提出率計算
  const assignId = state.currentAssignId;
  if(!assignId){
    badge.textContent = "提出率 -/-（-%）";
    table.innerHTML = `<div class="small">提出物がありません。</div>`;
    return;
  }

  let submittedCount = 0;
  const total = state.data.students.length;

  state.data.students.forEach(name=>{
    ensureStudent(name);
    const st = state.data.assignStatusByStudent?.[name]?.[assignId];
    if(st && st.submitted) submittedCount += 1;
  });

  const rate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;
  badge.textContent = `提出率 ${submittedCount}/${total}（${rate}%）`;

  // 表（児童ごとの提出状況）
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  state.data.students.forEach(name=>{
    ensureStudent(name);

    const st = state.data.assignStatusByStudent?.[name]?.[assignId];
    const submitted = !!(st && st.submitted);

    const row = document.createElement("button");
    row.type = "button";
    row.className = "btn";
    row.style.textAlign = "left";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "12px";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:800">${name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">
        ${submitted ? "提出：済" : "提出：未"}
      </div>
    `;

    const right = document.createElement("div");
    right.className = "badge";
    right.textContent = submitted ? "✅" : "—";

    // 行クリック → その児童へ切替して「個人」に戻る
    row.onclick = ()=>{
  state.currentStudent = name;
  saveData();

  renderStudentSelect();
  renderGroupUI();
  renderSteps();
  renderPersonalAssignments(); // ★追加

  setView("personal");
};

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });

  table.innerHTML = "";
  table.appendChild(wrap);
}

function renderSideOverview(force = false){
  const d = document.getElementById("sideDrawer");
  if(!d) return;
  if(!force && !d.classList.contains("isOpen")) return;

  renderSideOverviewSteps();
  renderSideOverviewAssignments();
}

function renderSideOverviewSteps(){
  const host = document.getElementById("sideOverviewSteps");
  if(!host) return;

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  state.data.students.forEach(name=>{
    ensureStudent(name);

    const arr = state.data.stepsByStudent[name] || [];
    const done = arr.filter(Boolean).length;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "btn";
    row.style.textAlign = "left";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "12px";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:800">${name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${done}/12 完了</div>
    `;

    const right = document.createElement("div");
    right.className = "badge";
    right.textContent = `${done}/12`;

    row.onclick = ()=>{
      state.currentStudent = name;
      saveData();

      renderStudentSelect();
      renderGroupUI();
      renderSteps();
      renderPersonalAssignments();

      // ここで閉じると気持ちいい
      closeSideDrawer();
    };

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });

  host.innerHTML = "";
  host.appendChild(wrap);
}

function renderSideOverviewAssignments(){
  const sel   = document.getElementById("sideOverviewAssignSelect");
  const badge = document.getElementById("sideOverviewAssignRateBadge");
  const table = document.getElementById("sideOverviewAssignTable");
  if(!sel || !badge || !table) return;

  // サイド側の ← → ボタン
  const prevBtn = document.getElementById("btnSideOverviewPrevAssign");
  const nextBtn = document.getElementById("btnSideOverviewNextAssign");

  const assigns = getAssignments();
  sel.innerHTML = "";

  assigns.forEach(a=>{
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.title;
    sel.appendChild(o);
  });

  if(assigns.length === 0){
    badge.textContent = "提出率 -/-（-%）";
    table.innerHTML = `<div class="small">提出物がありません。</div>`;
    return;
  }

  // currentAssignId を使い回し
  if(!state.currentAssignId || !assigns.some(a=>a.id===state.currentAssignId)){
    state.currentAssignId = assigns[0].id;
  }
  sel.value = state.currentAssignId;

  sel.onchange = ()=>{
    state.currentAssignId = sel.value;
    saveData();
    renderSideOverviewAssignments();
  };

  if(prevBtn){
    prevBtn.onclick = ()=>{
      const idx = assigns.findIndex(a => a.id === state.currentAssignId);
      const nextIdx = (idx <= 0) ? assigns.length - 1 : idx - 1;
      state.currentAssignId = assigns[nextIdx].id;
      saveData();
      renderSideOverviewAssignments();
    };
  }
  if(nextBtn){
    nextBtn.onclick = ()=>{
      const idx = assigns.findIndex(a => a.id === state.currentAssignId);
      const nextIdx = (idx >= assigns.length - 1) ? 0 : idx + 1;
      state.currentAssignId = assigns[nextIdx].id;
      saveData();
      renderSideOverviewAssignments();
    };
  }

  const assignId = state.currentAssignId;

  let submittedCount = 0;
  const total = state.data.students.length;

  state.data.students.forEach(name=>{
    ensureStudent(name);
    const st = state.data.assignStatusByStudent?.[name]?.[assignId];
    if(st && st.submitted) submittedCount += 1;
  });

  const rate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;
  badge.textContent = `提出率 ${submittedCount}/${total}（${rate}%）`;

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  state.data.students.forEach(name=>{
    ensureStudent(name);
    const st = state.data.assignStatusByStudent?.[name]?.[assignId];
    const submitted = !!(st && st.submitted);

    const row = document.createElement("button");
    row.type = "button";
    row.className = "btn";
    row.style.textAlign = "left";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "12px";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:800">${name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">
        ${submitted ? "提出：済" : "提出：未"}
      </div>
    `;

    const right = document.createElement("div");
    right.className = "badge";
    right.textContent = submitted ? "✅" : "—";

    row.onclick = ()=>{
      state.currentStudent = name;
      saveData();

      renderStudentSelect();
      renderGroupUI();
      renderSteps();
      renderPersonalAssignments();

      closeSideDrawer();
    };

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });

  table.innerHTML = "";
  table.appendChild(wrap);
}

/* ====================================================
   15) 名簿：追加 / 削除
==================================================== */
function bindRosterButtons(){
  const addBtn = document.getElementById("btnAddStudent");
  const delBtn = document.getElementById("btnDeleteStudent");
  const inp = document.getElementById("newStudentName");

  if(addBtn && inp){
    addBtn.onclick = ()=>{
      const name = (inp.value || "").trim();
      if(!name) return alert("児童名を入力してください。");
      if(state.data.students.includes(name)) return alert("同名の児童がすでにいます。");

      state.data.students.push(name);
      ensureStudent(name);

      state.currentStudent = name;
      inp.value = "";

      saveData();
      renderStudentSelect();
      renderGroupUI();
      renderSteps();
      renderPersonalAssignments(); // ←もし入れてるなら
      renderSideOverview();        // ★追加

      // 一覧を開いている最中なら一覧も更新
      //（今は個人操作が多いので省略してもOK）
    };

    inp.onkeydown = (e)=>{
      if(e.key === "Enter") addBtn.click();
    };
  }

  if(delBtn){
    delBtn.onclick = ()=>{
      if(state.data.students.length <= 1){
        return alert("最後の1人は削除できません。");
      }

      const target = state.currentStudent;
      if(!confirm(`「${target}」を名簿から削除しますか？\n（保存データも削除）`)) return;

      // 名簿から削除
      state.data.students = state.data.students.filter(n => n !== target);

      // 関連データ削除
      delete state.data.studentGroup[target];
      delete state.data.stepsByStudent[target];
      delete state.data.stepLabelsByStudent[target];
      delete state.data.assignStatusByStudent[target];

      // current を先頭に
      state.currentStudent = state.data.students[0];

      saveData();
      renderStudentSelect();
      renderGroupUI();
      renderSteps();
      renderPersonalAssignments(); // ★追加（今の児童に合わせて提出UIを再構築）
      renderSideOverview();        // ★追加（ドロワー開いてたら追従）
    };
  }

  // 自動グループ
  const autoBtn = document.getElementById("btnAutoGroup");
  if(autoBtn){
    autoBtn.onclick = ()=>{
      if(!confirm("児童順に 2・2・3（G1,G2,G3）で自動割り当てしますか？")) return;
      autoAssignGroups223();
    };
  }
}

/* ====================================================
   16) Export / Import / Reset
==================================================== */
function exportData(){
  try{
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: state.data
    };

    const json = JSON.stringify(payload, null, 2);

    // クリップボード優先
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(json)
        .then(()=> alert("エクスポートJSONをクリップボードにコピーしました。\n（メモ帳などに貼り付けて保存できます）"))
        .catch(()=> fallbackDownload(json));
    }else{
      fallbackDownload(json);
    }
  }catch(e){
    console.error(e);
    alert("エクスポートに失敗しました。");
  }
}

function fallbackDownload(text){
  const blob = new Blob([text], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rika4_hyouka_export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  alert("JSONファイルをダウンロードしました。");
}

async function importData(){
  const msg =
`インポート方法を選んでください：
1) クリップボードから貼り付け（推奨）
2) ファイル選択（JSON）

OK → 1) 貼り付け
キャンセル → 2) ファイル選択`;

  if(confirm(msg)){
    const pasted = prompt("エクスポートJSONを貼り付けてください");
    if(pasted == null) return;
    doImportFromText(pasted);
  }else{
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async ()=>{
      const file = input.files && input.files[0];
      if(!file) return;
      const text = await file.text();
      doImportFromText(text);
    };
    input.click();
  }
}

function doImportFromText(text){
  try{
    const obj = JSON.parse(text);
    const d = (obj && obj.data) ? obj.data : obj;

    if(!d || typeof d !== "object") throw new Error("invalid");
    if(!Array.isArray(d.students) || d.students.length === 0) throw new Error("students");

    // いったん state.data に入れて、loadDataの補完思想で補正する
    // → ここでは「最低限の代入」だけ
    state.data = {
      students: Array.isArray(d.students) ? d.students.slice() : safeClone(defaultData.students),
      studentGroup: (d.studentGroup && typeof d.studentGroup === "object") ? d.studentGroup : {},
      stepsByStudent: (d.stepsByStudent && typeof d.stepsByStudent === "object") ? d.stepsByStudent : {},
      stepLabelsGlobal: Array.isArray(d.stepLabelsGlobal) ? d.stepLabelsGlobal : safeClone(defaultData.stepLabelsGlobal),
      stepLabelsByStudent: (d.stepLabelsByStudent && typeof d.stepLabelsByStudent === "object") ? d.stepLabelsByStudent : {},

      assignments: Array.isArray(d.assignments) ? d.assignments : safeClone(defaultData.assignments),
      assignStatusByStudent: (d.assignStatusByStudent && typeof d.assignStatusByStudent === "object") ? d.assignStatusByStudent : {},
    };

    // 現在児童を先頭に
    state.currentStudent = state.data.students[0];

    // ここで補完を確実にしたいので、一度保存→読み直しでもOK
    saveData();
    state.data = loadData();

    state.currentStudent = state.data.students[0];
    state.data.students.forEach(n=> ensureStudent(n));

    saveData();

    // UI反映
    renderStudentSelect();
    renderGroupUI();
    renderSteps();

    alert("インポート完了！");
  }catch(e){
    console.error(e);
    alert("インポートに失敗しました。\nJSON形式が正しいか確認してください。");
  }
}

function resetAll(){
  if(!confirm("本当に全データを削除しますか？\n（名簿・チェック・提出状況などがすべて消えます）")) return;

  localStorage.removeItem(DATA_KEY);

  state.data = safeClone(defaultData);
  state.currentStudent = state.data.students[0];
  state.currentAssignId = state.data.assignments?.[0]?.id || null;

  saveData();

  renderStudentSelect();
  renderGroupUI();
  renderSteps();
  renderPersonalAssignments(); // 提出物UIも再構築

  alert("全データを削除しました。");

  // サイドが存在しているときだけ強制更新
  if(document.getElementById("sideDrawer")){
    renderSideOverview(true);
  }
}

/* =========================
   View buttons
========================= */
function bindViewButtons(){
  const bP = document.getElementById("btnViewPersonal");
  const bO = document.getElementById("btnViewOverview");
  if(bP) bP.onclick = ()=> setView("personal");
  if(bO) bO.onclick = ()=> setView("overview");
}
   
/* ====================================================
   17) Init（起動）
==================================================== */
document.addEventListener("DOMContentLoaded", ()=>{
  // テーマ
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  const tbtn = document.getElementById("btnTheme");
  if(tbtn) tbtn.addEventListener("click", toggleTheme);

  // データ読み込み
  state.data = loadData();
  state.currentStudent = state.data.students[0];
  state.currentAssignId = state.data.assignments?.[0]?.id || null;

  // 児童データ補完
  state.data.students.forEach(n=> ensureStudent(n));
  saveData();

  // 初期描画
  renderStudentSelect();
  renderGroupUI();
  renderSteps();
  renderPersonalAssignments(); // ★追加（Step B）

  // bind
  bindRosterButtons();
  bindSteps();
  bindStepEditor();
  bindViewButtons();
  bindScreenButtons(); // ★追加：画面切替ボタン
  bindSideDrawer();

  // 初期表示はメイン画面
  setScreen("main");
  setView("personal");

  // Export / Import / Reset
  const exBtn = document.getElementById("btnExport");
  if(exBtn) exBtn.onclick = exportData;

  const imBtn = document.getElementById("btnImport");
  if(imBtn) imBtn.onclick = importData;

  const rsBtn = document.getElementById("btnReset");
  if(rsBtn) rsBtn.onclick = resetAll;
});
