// ===== Storage keys =====
const THEME_KEY = "rika4_theme_v3";
const DATA_KEY  = "rika4_evaltool_v1";

// ===== Theme =====
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

// ===== Data model =====
const defaultData = {
  students: [
    "（サンプル）児童A","（サンプル）児童B","（サンプル）児童C",
    "（サンプル）児童D","（サンプル）児童E","（サンプル）児童F","（サンプル）児童G"
  ],
  studentGroup: {},
  noteByStudent: {},
  photosByStudent: {},
  stepsByStudent: {},

  stepLabelsGlobal: [
    "調べる①","調べる②","調べる③",
    "まとめる①","まとめる②","まとめる③",
    "発表①","発表②","発表③",
    "ふり返り①","ふり返り②","ふり返り③"
  ],
  stepLabelsByStudent: {}
};

function safeClone(obj){ return JSON.parse(JSON.stringify(obj)); }

const state = { data: null, currentStudent: null };

function loadData(){
  try{
    const raw = localStorage.getItem(DATA_KEY);
    const d = raw ? JSON.parse(raw) : safeClone(defaultData);

    if(!Array.isArray(d.students)) d.students = safeClone(defaultData.students);
    if(!d.studentGroup || typeof d.studentGroup !== "object") d.studentGroup = {};
    if(!d.noteByStudent || typeof d.noteByStudent !== "object") d.noteByStudent = {};
    if(!d.photosByStudent || typeof d.photosByStudent !== "object") d.photosByStudent = {};
    if(!d.stepsByStudent || typeof d.stepsByStudent !== "object") d.stepsByStudent = {};

    if(!Array.isArray(d.stepLabelsGlobal) || d.stepLabelsGlobal.length !== 12){
      d.stepLabelsGlobal = safeClone(defaultData.stepLabelsGlobal);
    }
    if(!d.stepLabelsByStudent || typeof d.stepLabelsByStudent !== "object"){
      d.stepLabelsByStudent = {};
    }

    if(d.students.length === 0) d.students = ["児童1"];

    d.students.forEach(ensureStudentWith(d));

    return d;
  }catch(e){
    console.warn("loadData error:", e);
    const d = safeClone(defaultData);
    d.students.forEach(ensureStudentWith(d));
    return d;
  }
}

function saveData(){ localStorage.setItem(DATA_KEY, JSON.stringify(state.data)); }

function ensureStudentWith(d){
  return (name)=>{
    if(d.studentGroup[name] == null) d.studentGroup[name] = "";
    if(d.noteByStudent[name] == null) d.noteByStudent[name] = "";
    if(d.photosByStudent[name] == null) d.photosByStudent[name] = "";
    if(!Array.isArray(d.stepsByStudent[name]) || d.stepsByStudent[name].length !== 12){
      d.stepsByStudent[name] = Array.from({length:12}, ()=> false);
    }
  };
}
function ensureStudent(name){ ensureStudentWith(state.data)(name); }

function getGroupMembers(studentName){
  const g = (state.data.studentGroup && state.data.studentGroup[studentName]) || "";
  if(!g) return [studentName];
  return state.data.students.filter(n => ((state.data.studentGroup && state.data.studentGroup[n]) || "") === g);
}

// ===== View switch (personal / overview) =====
function setView(mode){
  const personal = document.getElementById("viewPersonal");
  const overview = document.getElementById("viewOverview");
  const bP = document.getElementById("btnViewPersonal");
  const bO = document.getElementById("btnViewOverview");
  if(!personal || !overview || !bP || !bO) return;

  const isOverview = (mode === "overview");
  personal.style.display = isOverview ? "none" : "block";
  overview.style.display = isOverview ? "block" : "none";

  bP.classList.toggle("primary", !isOverview);
  bO.classList.toggle("primary", isOverview);

  if(isOverview) renderOverview();
}

function bindViewButtons(){
  const bP = document.getElementById("btnViewPersonal");
  const bO = document.getElementById("btnViewOverview");
  if(bP) bP.onclick = ()=> setView("personal");
  if(bO) bO.onclick = ()=> setView("overview");
}

function renderOverview(){
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

    row.onclick = ()=>{
      state.currentStudent = name;
      saveData();
      renderStudentSelect();
      renderGroupUI();
      renderSteps();
      renderNote();
      renderPhotoPreview();
      setView("personal");
    };

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });

  host.innerHTML = "";
  host.appendChild(wrap);
}

// ===== Student select =====
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
    saveData();
    renderGroupUI();
    renderSteps();
    renderNote();
    renderPhotoPreview();
  };
}

// ===== Group UI =====
function renderGroupUI(){
  const sel = document.getElementById("groupSelect");
  const cnt = document.getElementById("groupCount");
  if(!sel || !cnt) return;

  ensureStudent(state.currentStudent);

  const g = (state.data.studentGroup && state.data.studentGroup[state.currentStudent]) || "";
  sel.value = g;

  const counts = {G1:0, G2:0, G3:0, "":0};
  state.data.students.forEach(n=>{
    const gg = (state.data.studentGroup && state.data.studentGroup[n]) || "";
    counts[gg] = (counts[gg] ?? 0) + 1;
  });
  cnt.textContent = `人数：G1=${counts.G1} / G2=${counts.G2} / G3=${counts.G3}（未=${counts[""]}）`;

  sel.onchange = ()=>{
    state.data.studentGroup[state.currentStudent] = sel.value;
    saveData();
    renderGroupUI();
  };
}

function autoAssignGroups223(){
  const list = state.data.students.slice();
  const plan = ["G1","G1","G2","G2","G3","G3","G3"];
  list.forEach((n,i)=>{ state.data.studentGroup[n] = plan[i] || "G3"; });
  saveData();
  renderGroupUI();
}

// ===== Steps =====
function updateStepCount(){
  const badge = document.getElementById("stepCount");
  if(!badge) return;
  const arr = state.data.stepsByStudent[state.currentStudent] || [];
  badge.textContent = `${arr.filter(Boolean).length}/12`;
}

function getStepLabelsFor(studentName){
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

  wrap.addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn || !wrap.contains(btn)) return;
    const idx = Number(btn.dataset.stepIndex);
    if(Number.isNaN(idx) || idx < 0 || idx > 11) return;

    const arr = state.data.stepsByStudent[state.currentStudent];
    arr[idx] = !arr[idx];
    saveData();
    renderSteps();
  });

  if(clearBtn){
    clearBtn.onclick = ()=>{
      if(!confirm("この児童の12時間チェックをすべて外しますか？")) return;
      state.data.stepsByStudent[state.currentStudent] = Array.from({length:12}, ()=> false);
      saveData();
      renderSteps();
    };
  }
}

// ===== Step editor =====
function renderStepLabelInputs(labels){
  const box = document.getElementById("stepLabelInputs");
  if(!box) return;
  box.innerHTML = "";
  for(let i=0;i<12;i++){
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.padding = "10px";
    wrap.innerHTML = `
      <div class="sub">${i+1}番</div>
      <input type="text" data-idx="${i}" value="${(labels[i]||"").replace(/"/g,"&quot;")}" />
    `;
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
  for(let i=0;i<12;i++) if(!arr[i]) arr[i] = `${i+1}`;
  return arr;
}

function renderSelectedStudentsList(){
  const list = document.getElementById("selectedStudentsList");
  if(!list) return;
  list.innerHTML = "";
  state.data.students.forEach(name=>{
    const label = document.createElement("label");
    label.className = "pill";
    label.style.justifyContent = "space-between";
    label.innerHTML = `
      <span>${name}</span>
      <input type="checkbox" value="${name}" style="width:auto" ${name===state.currentStudent ? "checked" : ""}/>
    `;
    list.appendChild(label);
  });
}

function getTargetsByScope(scope){
  if(scope === "all") return state.data.students.slice();
  if(scope === "group") return getGroupMembers(state.currentStudent);
  if(scope === "selected"){
    const list = document.getElementById("selectedStudentsList");
    if(!list) return [state.currentStudent];
    const checks = Array.from(list.querySelectorAll("input[type=checkbox]"));
    const names = checks.filter(c=>c.checked).map(c=>c.value);
    return names.length ? names : [state.currentStudent];
  }
  return [state.currentStudent];
}

function openStepEditor(){
  const panel = document.getElementById("stepEditor");
  if(!panel) return;
  panel.style.display = "block";
  renderStepLabelInputs(getStepLabelsFor(state.currentStudent));
  renderSelectedStudentsList();

  const scopeSel = document.getElementById("stepApplyScope");
  const box = document.getElementById("selectedStudentsBox");
  if(scopeSel && box){
    box.style.display = (scopeSel.value === "selected") ? "block" : "none";
    scopeSel.onchange = ()=>{ box.style.display = (scopeSel.value === "selected") ? "block" : "none"; };
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

  if(btnLoadGlobal){
    btnLoadGlobal.onclick = ()=> renderStepLabelInputs(state.data.stepLabelsGlobal);
  }

  if(btnSaveGlobal){
    btnSaveGlobal.onclick = ()=>{
      if(!confirm("今の内容を共通テンプレとして保存しますか？")) return;
      state.data.stepLabelsGlobal = readStepLabelInputs();
      state.data.stepLabelsByStudent = {}; // 上書き解除
      saveData();
      renderSteps();
      alert("共通テンプレを保存しました！");
    };
  }

  if(btnSave){
    btnSave.onclick = ()=>{
      const labels = readStepLabelInputs();
      const scope = scopeSel ? scopeSel.value : "current";
      const targets = getTargetsByScope(scope);
      targets.forEach(n => { state.data.stepLabelsByStudent[n] = labels.slice(); });
      saveData();
      renderSteps();
      closeStepEditor();
      alert(`保存しました（適用：${targets.length}人）`);
    };
  }
}

// ===== Notes =====
function renderNote(){
  const ta = document.getElementById("noteInput");
  if(!ta) return;
  ensureStudent(state.currentStudent);
  ta.value = state.data.noteByStudent[state.currentStudent] || "";
}
function bindNote(){
  const ta = document.getElementById("noteInput");
  if(!ta) return;
  ta.addEventListener("input", ()=>{
    state.data.noteByStudent[state.currentStudent] = ta.value;
    saveData();
  });
}

// ===== Photo =====
function readAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function resizeDataURL(dataUrl, maxW){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, maxW / img.width);
      const nw = Math.round(img.width * scale);
      const nh = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = nw; canvas.height = nh;
      const ctx = canvas.getContext("2d");
      if(ctx) ctx.drawImage(img, 0, 0, nw, nh);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = ()=> resolve(dataUrl);
    img.src = dataUrl;
  });
}
function renderPhotoPreview(){
  const img = document.getElementById("photoPreview");
  if(!img) return;
  const url = state.data.photosByStudent[state.currentStudent] || "";
  if(url){
    img.src = url;
    img.style.display = "block";
  }else{
    img.removeAttribute("src");
    img.style.display = "none";
  }
}
function bindPhoto(){
  const input = document.getElementById("photoInput");
  const btnClear = document.getElementById("btnClearPhoto");
  if(!input || !btnClear) return;

  input.onchange = async ()=>{
    const file = input.files && input.files[0];
    if(!file) return;
    const dataUrl = await readAsDataURL(file);
    const resized = await resizeDataURL(dataUrl, 1280);
    state.data.photosByStudent[state.currentStudent] = resized;
    saveData();
    renderPhotoPreview();
    input.value = "";
  };

  btnClear.onclick = ()=>{
    if(!confirm("この児童の画像を削除しますか？")) return;
    state.data.photosByStudent[state.currentStudent] = "";
    saveData();
    renderPhotoPreview();
  };
}

// ===== Roster buttons =====
function bindRosterButtons(){
  const addBtn = document.getElementById("btnAddStudent");
  const delBtn = document.getElementById("btnDeleteStudent");
  const inp = document.getElementById("newStudentName");
  const autoBtn = document.getElementById("btnAutoGroup");

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
      renderNote();
      renderPhotoPreview();
    };
    inp.onkeydown = (e)=>{ if(e.key === "Enter") addBtn.click(); };
  }

  if(delBtn){
    delBtn.onclick = ()=>{
      if(state.data.students.length <= 1) return alert("最後の1人は削除できません。");
      const target = state.currentStudent;
      if(!confirm(`「${target}」を名簿から削除しますか？（保存データも削除）`)) return;

      state.data.students = state.data.students.filter(n => n !== target);
      delete state.data.studentGroup[target];
      delete state.data.noteByStudent[target];
      delete state.data.photosByStudent[target];
      delete state.data.stepsByStudent[target];
      delete state.data.stepLabelsByStudent[target];

      state.currentStudent = state.data.students[0];
      saveData();
      renderStudentSelect();
      renderGroupUI();
      renderSteps();
      renderNote();
      renderPhotoPreview();
    };
  }

  if(autoBtn){
    autoBtn.onclick = ()=>{
      if(!confirm("児童順に 2・2・3（G1,G2,G3）で自動割り当てしますか？")) return;
      autoAssignGroups223();
    };
  }
}

// ===== Export / Import / Reset =====
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
function exportData(){
  try{
    const payload = { version: 1, exportedAt: new Date().toISOString(), data: state.data };
    const json = JSON.stringify(payload, null, 2);
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
function doImportFromText(text){
  try{
    const obj = JSON.parse(text);
    const d = (obj && obj.data) ? obj.data : obj;
    if(!d || typeof d !== "object") throw new Error("invalid");
    if(!Array.isArray(d.students) || d.students.length === 0) throw new Error("students");

    state.data = {
      students: d.students.slice(),
      studentGroup: d.studentGroup || {},
      noteByStudent: d.noteByStudent || {},
      photosByStudent: d.photosByStudent || {},
      stepsByStudent: d.stepsByStudent || {},
      stepLabelsGlobal: Array.isArray(d.stepLabelsGlobal) ? d.stepLabelsGlobal : safeClone(defaultData.stepLabelsGlobal),
      stepLabelsByStudent: d.stepLabelsByStudent || {}
    };
    state.data.students.forEach(ensureStudentWith(state.data));
    state.currentStudent = state.data.students[0];

    saveData();
    renderStudentSelect(); renderGroupUI(); renderSteps(); renderNote(); renderPhotoPreview();
    alert("インポート完了！");
  }catch(e){
    console.error(e);
    alert("インポートに失敗しました。\nJSON形式が正しいか確認してください。");
  }
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
      doImportFromText(await file.text());
    };
    input.click();
  }
}
function resetAll(){
  if(!confirm("本当に全データを削除しますか？\n（名簿・画像・メモ・チェックがすべて消えます）")) return;
  localStorage.removeItem(DATA_KEY);
  state.data = safeClone(defaultData);
  state.data.students.forEach(ensureStudentWith(state.data));
  state.currentStudent = state.data.students[0];
  saveData();
  renderStudentSelect(); renderGroupUI(); renderSteps(); renderNote(); renderPhotoPreview();
  alert("全データを削除しました。");
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", ()=>{
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  document.getElementById("btnTheme")?.addEventListener("click", toggleTheme);

  state.data = loadData();
  state.currentStudent = state.data.students[0];

  renderStudentSelect();
  renderGroupUI();
  renderSteps();
  renderNote();
  renderPhotoPreview();

  bindRosterButtons();
  bindSteps();
  bindStepEditor();
  bindPhoto();
  bindNote();

  bindViewButtons();
  setView("personal");

  document.getElementById("btnExport")?.addEventListener("click", exportData);
  document.getElementById("btnImport")?.addEventListener("click", importData);
  document.getElementById("btnReset")?.addEventListener("click", resetAll);
});
