import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ─── 設定 ───
const SUPABASE_URL  = "https://sqinymtmpesrxcpbdayt.supabase.co"
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxaW55bXRtcGVzcnhjcGJkYXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MDU0NTUsImV4cCI6MjA4NjI4MTQ1NX0.8dS36xXDnt_fox-CNUx_SUQJNw0JvRVl_AnEnFen6Yc"
const API_BASE      = "http://localhost:3000/api"   // Node.js server

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── State ───
let allTrades    = []
let selectedTags = []
let charts       = {}
let currentToken = null   // JWT，傳給 Node API

const MOOD_EMOJI = { 冷靜:"😌", 自信:"💪", 焦躁:"😤", 衝動:"🔥", 恐懼:"😰", FOMO:"😱" }
const WARN_TAGS  = new Set(["追高","情緒單","報復性"])

// ════════════════════════════════
// API HELPER（帶 JWT）
// ════════════════════════════════
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${currentToken}`,
      ...(options.headers || {})
    }
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ════════════════════════════════
// INIT DOM
// ════════════════════════════════
document.getElementById("confidence").oninput = function() {
  document.getElementById("confidenceDisplay").textContent = this.value
  updateRiskCard()
}

// 任何欄位變動都重新評分
;["mood","planned","mistake","setup"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", updateRiskCard)
})

document.querySelectorAll(".tag-option").forEach(el => {
  el.onclick = () => {
    const tag = el.dataset.tag
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag)
      el.classList.remove("selected")
    } else {
      selectedTags.push(tag)
      el.classList.add("selected")
    }
    updateRiskCard()
  }
})

document.getElementById("toggleForm").onclick = function() {
  const body = document.getElementById("formBody")
  const open = body.style.display !== "none"
  body.style.display = open ? "none" : "block"
  this.textContent   = open ? "▼ 展開" : "▲ 收起"
}

document.getElementById("authToggle").onclick = function() {
  const p    = document.getElementById("authPanel")
  const open = p.style.display !== "none"
  p.style.display = open ? "none" : "flex"
  this.textContent = open ? "登入" : "✕"
}

// Tab switching
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = async function() {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"))
    document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none")
    this.classList.add("active")
    const name = this.dataset.tab
    document.getElementById(`tab-${name}`).style.display = "block"
    if (name === "analysis") await renderAnalysis()
    if (name === "charts")   await renderCharts()
  }
})

// Chart tab switching
document.querySelectorAll(".chart-tab").forEach(tab => {
  tab.onclick = function() {
    document.querySelectorAll(".chart-tab").forEach(t => t.classList.remove("active"))
    this.classList.add("active")
    const which = this.dataset.chart
    ;["Equity","Tag","Mood","Session"].forEach(name => {
      document.getElementById(`chart${name}`).style.display = name === which ? "block" : "none"
    })
  }
})

// Filters
;["filterTag","filterMood","filterType"].forEach(id => {
  document.getElementById(id).onchange = renderFiltered
})

// ════════════════════════════════
// AUTH
// ════════════════════════════════
document.getElementById("loginBtn").onclick = async () => {
  const email    = document.getElementById("email").value
  const password = document.getElementById("password").value
  if (!email || !password) return alert("請輸入 Email 和密碼")

  let { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const r = await supabase.auth.signUp({ email, password })
    if (r.error) return alert("錯誤：" + r.error.message)
    alert("已發送確認信")
    return
  }
  currentToken = data.session.access_token
  document.getElementById("authPanel").style.display = "none"
  document.getElementById("authToggle").textContent  = "登入"
  load()
}

document.getElementById("logoutBtn").onclick = async () => {
  await supabase.auth.signOut()
  currentToken = null
  allTrades = []
  load()
}

// 監聽 session 變化（頁面重開自動恢復）
supabase.auth.onAuthStateChange((_event, session) => {
  currentToken = session?.access_token || null
})

// ════════════════════════════════
// RISK CARD（即時評分，純前端）
// ════════════════════════════════
function updateRiskCard() {
  const card = document.getElementById("riskCard")
  if (!card) return

  const tradeDraft = {
    mood:       document.getElementById("mood").value,
    confidence: Number(document.getElementById("confidence").value),
    setup:      document.getElementById("setup").value.trim(),
    planned:    document.getElementById("planned").checked,
    mistake:    document.getElementById("mistake").checked,
    tags:       selectedTags
  }

  // 本地快速評分（不等 API，即時反應）
  let score = 0
  const BAD_MOODS = new Set(["焦躁","衝動","FOMO","恐懼"])
  if (tradeDraft.mistake)                              score += 3
  if (tradeDraft.confidence <= 2)                      score += 2
  if (BAD_MOODS.has(tradeDraft.mood))                  score += 2
  if (!tradeDraft.setup)                               score += 2
  if (!tradeDraft.planned)                             score += 2
  const warnT = tradeDraft.tags.filter(t => ["追高","情緒單","報復性"].includes(t))
  score += warnT.length * 2

  // 加入連虧歷史
  const last2 = allTrades.slice(-2)
  if (last2.length === 2 && last2.every(t => t.profit < 0)) score += 2

  score = Math.min(score, 10)

  document.getElementById("riskScore").textContent = score

  let level = "safe", msg = "✅ 風險正常，可以執行"
  if (score >= 7) {
    level = "danger"
    msg   = "🚨 高風險！系統建議你不要執行這筆交易"
  } else if (score >= 4) {
    level = "warning"
    msg   = "⚠️ 中等風險，請再確認一次你的計畫"
  }

  card.className = `risk-card risk-${level}`
  document.getElementById("riskMsg").textContent = msg

  const addBtn = document.getElementById("addBtn")
  if (score >= 7) {
    addBtn.classList.add("blocked")
    addBtn.textContent = "🚨 高風險 — 確定還是要記錄？"
  } else {
    addBtn.classList.remove("blocked")
    addBtn.textContent = "＋ 記錄交易"
  }
}

// ════════════════════════════════
// ADD TRADE（送出前再過一次 API 評分）
// ════════════════════════════════
document.getElementById("addBtn").onclick = async () => {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return alert("請先登入")

  const entry  = Number(document.getElementById("entry").value)
  const exit   = Number(document.getElementById("exit").value)
  const qty    = Number(document.getElementById("qty").value)
  const symbol = document.getElementById("symbol").value.trim().toUpperCase()
  const type   = document.getElementById("type").value
  if (!symbol || !entry || !exit || !qty) return alert("請填寫標的、價格與數量")

  const tradeDraft = {
    mood:       document.getElementById("mood").value || null,
    confidence: Number(document.getElementById("confidence").value),
    setup:      document.getElementById("setup").value || null,
    planned:    document.getElementById("planned").checked,
    mistake:    document.getElementById("mistake").checked,
    tags:       selectedTags
  }

  // ── 送出前過 Node API 評分 ──
  try {
    const decision = await api('/analysis/decision', {
      method:  'POST',
      body:    JSON.stringify(tradeDraft)
    })

    if (decision.decision === "BLOCK") {
      const go = confirm(
        `🚨 高風險交易（評分 ${decision.score}/10）\n\n` +
        `原因：\n${decision.reasons.join('\n')}\n\n` +
        `系統建議你不要執行。確定還是要記錄？`
      )
      if (!go) return
    } else if (decision.decision === "WARNING") {
      const go = confirm(
        `⚠️ 中等風險（評分 ${decision.score}/10）\n\n` +
        `${decision.reasons.join('\n')}\n\n確定繼續？`
      )
      if (!go) return
    }
  } catch (e) {
    console.warn("API 評分失敗，直接記錄", e)
  }

  const profit = type === "LONG" ? (exit - entry) * qty : (entry - exit) * qty

  const { error } = await supabase.from("trades").insert([{
    user_id:    user.id,
    symbol, type,
    entry_price: entry, exit_price: exit, qty, profit,
    note:        document.getElementById("note").value,
    tags:        selectedTags.length ? selectedTags : null,
    mood:        tradeDraft.mood,
    confidence:  tradeDraft.confidence,
    reason:      document.getElementById("reason").value || null,
    setup:       tradeDraft.setup,
    session:     document.getElementById("session").value || null,
    planned:     tradeDraft.planned,
    mistake:     tradeDraft.mistake,
  }])

  if (error) return alert("新增失敗：" + error.message)

  // Reset
  ;["symbol","entry","exit","qty","note","reason","setup"].forEach(id => {
    document.getElementById(id).value = ""
  })
  document.getElementById("mood").value    = ""
  document.getElementById("session").value = ""
  document.getElementById("confidence").value = 3
  document.getElementById("confidenceDisplay").textContent = "3"
  document.getElementById("planned").checked  = true
  document.getElementById("mistake").checked  = false
  selectedTags = []
  document.querySelectorAll(".tag-option").forEach(el => el.classList.remove("selected"))
  updateRiskCard()

  load()
}

// ════════════════════════════════
// LOAD（Supabase 直接取資料）
// ════════════════════════════════
async function load() {
  const { data: { user } } = await supabase.auth.getUser()
  document.getElementById("userInfo").textContent = user ? user.email : "未登入"

  if (!user) {
    document.getElementById("list").innerHTML = ""
    allTrades = []
    updateStats([])
    document.getElementById("warningZone").innerHTML = ""
    return
  }

  const { data } = await supabase
    .from("trades").select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  allTrades = data || []
  updateStats(allTrades)
  updateTagFilter(allTrades)
  renderFiltered()
  updateRiskCard()

  // 從 Node API 拉警告
  try {
    const warnings = await api('/analysis/warnings')
    renderWarnings(warnings)
  } catch {
    // Node 未啟動時不影響主功能
  }
}

// ════════════════════════════════
// WARNINGS
// ════════════════════════════════
function renderWarnings(warnings) {
  const zone = document.getElementById("warningZone")
  zone.innerHTML = ""
  const levelClass = { danger: "red", warning: "orange", info: "yellow" }
  warnings.forEach(w => {
    const div = document.createElement("div")
    div.className = `warning-card ${levelClass[w.level] || "yellow"}`
    div.innerHTML = `<span class="warning-icon">${w.icon}</span><span>${w.msg}</span>`
    zone.appendChild(div)
  })
}

// ════════════════════════════════
// RENDER LIST
// ════════════════════════════════
function renderFiltered() {
  const tagF  = document.getElementById("filterTag").value
  const moodF = document.getElementById("filterMood").value
  const typeF = document.getElementById("filterType").value

  const filtered = [...allTrades].reverse().filter(t => {
    if (tagF  && !(t.tags||[]).includes(tagF)) return false
    if (moodF && t.mood !== moodF)              return false
    if (typeF && t.type !== typeF)              return false
    return true
  })
  renderList(filtered)
}

function renderList(data) {
  const listEl  = document.getElementById("list")
  const emptyEl = document.getElementById("emptyState")
  listEl.innerHTML = ""

  if (!data.length) { emptyEl.style.display = "block"; return }
  emptyEl.style.display = "none"

  data.forEach(t => {
    const li = document.createElement("li")
    li.className = "trade-item" +
      (t.mistake ? " is-mistake" : "") +
      (!t.planned ? " not-planned" : "")

    const date   = new Date(t.created_at).toLocaleDateString("zh-TW", { month:"2-digit", day:"2-digit" })
    const sign   = t.profit >= 0 ? "+" : ""
    const pCls   = t.profit >= 0 ? "pos" : "neg"
    const dots   = t.confidence
      ? Array.from({length:5},(_,i)=>`<span class="dot ${i<t.confidence?"filled":""}"></span>`).join("")
      : ""
    const tagsHtml = (t.tags||[]).map(tag => {
      const cls = WARN_TAGS.has(tag) ? (tag==="報復性"?"danger":"warn") : ""
      return `<span class="trade-tag ${cls}">${tag}</span>`
    }).join("")

    li.innerHTML = `
      <div>
        <span class="trade-symbol">${t.symbol}</span>
        <span class="trade-type-badge ${t.type==="LONG"?"badge-long":"badge-short"}">${t.type}</span>
      </div>
      <div class="trade-meta">
        <div class="trade-prices">
          ${t.setup ? `<span style="color:var(--accent);margin-right:8px">[${t.setup}]</span>` : ""}
          進 ${t.entry_price} → 出 ${t.exit_price} × ${t.qty}
          ${t.session ? `<span style="color:var(--text-dim)"> ${t.session}</span>` : ""}
          ${t.reason  ? `<br/><span style="color:var(--text-dim);font-size:.72rem">${t.reason}</span>` : ""}
        </div>
        <div class="trade-tags">
          ${tagsHtml}
          ${t.mood ? `<span class="trade-mood-badge">${MOOD_EMOJI[t.mood]||""} ${t.mood}</span>` : ""}
          ${!t.planned ? `<span class="trade-tag warn">計畫外</span>` : ""}
          ${t.mistake  ? `<span class="trade-tag danger">錯誤</span>` : ""}
          ${dots ? `<span class="confidence-dots">${dots}</span>` : ""}
        </div>
      </div>
      <div class="trade-right">
        <span class="trade-profit ${pCls}">${sign}${t.profit.toFixed(2)}</span>
        <span class="trade-date">${date}</span>
      </div>
    `
    listEl.appendChild(li)
  })
}

// ════════════════════════════════
// STATS
// ════════════════════════════════
function updateStats(data) {
  const set = (id, val, cls) => {
    const el = document.getElementById(id)
    el.textContent = val
    el.className   = "stat-value " + (cls||"")
  }
  if (!data.length) {
    ;["val-total","val-winrate","val-trades","val-dd"].forEach(id => set(id,"—"))
    return
  }
  const total   = data.reduce((s,t) => s + t.profit, 0)
  const wins    = data.filter(t => t.profit > 0).length
  const winRate = (wins/data.length*100).toFixed(1)

  let peak = 0, cum = 0, maxDD = 0
  data.forEach(t => {
    cum += t.profit
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDD) maxDD = dd
  })

  set("val-total",   (total>=0?"+":"")+total.toFixed(2), total>=0?"positive":"negative")
  set("val-winrate", winRate+"%", winRate>=50?"positive":"negative")
  set("val-trades",  data.length)
  set("val-dd",      maxDD > 0 ? "-"+maxDD.toFixed(2) : "—", maxDD>0?"negative":"")
}

// ════════════════════════════════
// 🔬 行為分析（呼叫 Node API）
// ════════════════════════════════
async function renderAnalysis() {
  const el = document.getElementById("analysisContent")
  el.innerHTML = '<div class="empty-state" style="padding:24px">分析中...</div>'

  try {
    const d = await api('/analysis/full')

    if (d.insufficient) {
      el.innerHTML = `<div class="empty-state">至少需要 5 筆交易（目前 ${d.count} 筆）</div>`
      return
    }

    el.innerHTML = [
      buildTagSection(d.tags, d.tagCombos),
      buildConditionSection(d.mood, d.confidence, d.session),
      buildBehaviorSection(d.afterLoss, d.risk),
      buildRiskSection(d.risk)
    ].join("")
  } catch (e) {
    el.innerHTML = `<div class="empty-state">⚠️ 無法連線到分析伺服器<br/><small>請確認 Node.js server 是否在跑：npm run dev</small></div>`
  }
}

function row(label, val, cls) {
  return `<div class="analysis-row">
    <span class="analysis-label">${label}</span>
    <span class="analysis-val ${cls||""}">${val}</span>
  </div>`
}

function buildTagSection(tags, combos) {
  if (!tags.length) return ""
  const tagRows = tags.slice(0,8).map(t =>
    `<div class="analysis-row">
      <span class="analysis-label">${t.name} <span style="color:var(--text-dim);font-size:.7rem">(${t.total}筆)</span></span>
      <span style="display:flex;gap:12px">
        <span class="analysis-val ${t.winRate>=50?"pos":"neg"}">${t.winRate}%</span>
        <span class="analysis-val ${t.avgPnl>=0?"pos":"neg"}" style="font-size:.78rem">${t.avgPnl>=0?"+":""}${t.avgPnl}</span>
      </span>
    </div>`
  ).join("")

  const comboRows = combos.slice(0,5).map(c =>
    `<div class="analysis-row">
      <span class="analysis-label" style="font-size:.78rem">${c.combo} <span style="color:var(--text-dim)">(${c.total}筆)</span></span>
      <span style="display:flex;gap:12px">
        <span class="analysis-val ${c.winRate>=50?"pos":"neg"}">${c.winRate}%</span>
        <span class="analysis-val ${c.avgPnl>=0?"pos":"neg"}" style="font-size:.78rem">${c.avgPnl>=0?"+":""}${c.avgPnl}</span>
      </span>
    </div>`
  ).join("")

  return `
    <div class="analysis-grid" style="grid-template-columns:1fr;margin-bottom:14px">
      <div class="analysis-card">
        <h3>Tag 勝率分析</h3>${tagRows}
        ${combos.length ? `<h3 style="margin-top:16px">Tag 組合（複合 Edge）</h3>${comboRows}` : ""}
      </div>
    </div>`
}

function buildConditionSection(mood, confidence, session) {
  const moodRows = (mood||[]).map(m =>
    `<div class="analysis-row">
      <span class="analysis-label">${MOOD_EMOJI[m.mood]||""} ${m.mood} <span style="color:var(--text-dim);font-size:.7rem">(${m.total}筆)</span></span>
      <span style="display:flex;gap:12px">
        <span class="analysis-val ${m.winRate>=50?"pos":"neg"}">${m.winRate}%</span>
        <span class="analysis-val ${m.avgPnl>=0?"pos":"neg"}" style="font-size:.78rem">${m.avgPnl>=0?"+":""}${m.avgPnl}</span>
      </span>
    </div>`
  ).join("")

  const confRows = (confidence||[]).map(c =>
    row(c.label + ` (${c.count}筆)`,
      `${c.winRate}% ／ avg ${c.avgPnl>=0?"+":""}${c.avgPnl}`,
      c.winRate >= 50 ? "pos" : "neg")
  ).join("")

  const sessRows = (session||[]).map(s =>
    row(`${s.session} (${s.total}筆)`,
      `${s.winRate}% ／ ${s.totalPnl>=0?"+":""}${s.totalPnl}`,
      s.winRate >= 50 ? "pos" : "neg")
  ).join("")

  return `
    <div class="analysis-grid" style="margin-bottom:14px">
      <div class="analysis-card"><h3>情緒表現</h3>${moodRows||"<div style='color:var(--text-muted);font-size:.82rem'>記錄情緒後出現</div>"}</div>
      <div class="analysis-card">
        <h3>信心 vs 結果</h3>${confRows||"<div style='color:var(--text-muted);font-size:.82rem'>記錄信心後出現</div>"}
        ${sessRows ? `<h3 style="margin-top:14px">時段分析</h3>${sessRows}` : ""}
      </div>
    </div>`
}

function buildBehaviorSection(afterLoss, risk) {
  const items = []
  if (afterLoss) {
    items.push({
      icon: "🔁",
      text: `虧損後下一筆勝率 <strong>${afterLoss.winRate}%</strong>，共 ${afterLoss.count} 筆，平均 ${afterLoss.avgPnl>=0?"+":""}${afterLoss.avgPnl}。${afterLoss.winRate < 50 ? "你可能有報復性交易傾向。" : "你虧損後能保持冷靜。"}`
    })
  }
  if (risk) {
    if (risk.planRate < 70)
      items.push({ icon: "📋", text: `計畫內交易佔比只有 <strong>${risk.plannedRate}%</strong>，大量計畫外交易會侵蝕你的 edge。` })
    if (risk.mistakeRate > 20)
      items.push({ icon: "❌", text: `你有 <strong>${risk.mistakeRate}%</strong> 的交易自認是錯誤的，這些交易值得深入覆盤。` })
    if (risk.profitFactor)
      items.push({ icon: risk.profitFactor >= 1.5 ? "💪" : "📉",
        text: `獲利因子 (PF) = <strong>${risk.profitFactor}</strong>。${risk.profitFactor >= 1.5 ? "系統有正向期望值。" : "PF < 1.5 代表需要改善勝率或賠率比。"}` })
  }

  if (!items.length) return ""
  const html = items.map(i =>
    `<div class="insight-item"><span class="insight-icon">${i.icon}</span><div class="insight-text">${i.text}</div></div>`
  ).join("")

  return `<div class="insight-card" style="margin-bottom:14px"><h3>🔍 行為洞察</h3>${html}</div>`
}

function buildRiskSection(risk) {
  if (!risk) return ""
  return `
    <div class="analysis-grid">
      <div class="analysis-card">
        <h3>風險指標</h3>
        ${row("最大回撤",    "-"+risk.maxDrawdown, "neg")}
        ${row("最大連虧",    risk.maxLossStreak+" 筆", risk.maxLossStreak>=4?"neg":"neutral")}
        ${row("獲利因子 PF", risk.profitFactor ?? "—", risk.profitFactor>=1?"pos":"neg")}
        ${row("最佳單筆",    "+"+risk.bestTrade,  "pos")}
        ${row("最差單筆",    risk.worstTrade,     "neg")}
      </div>
      <div class="analysis-card">
        <h3>交易品質</h3>
        ${row("計畫內比例",   risk.plannedRate+"%", risk.plannedRate>=80?"pos":"warning")}
        ${row("錯誤交易比例", risk.mistakeRate+"%", risk.mistakeRate>20?"neg":"pos")}
        ${row("平均獲利筆",  "+"+risk.avgWin,  "pos")}
        ${row("平均虧損筆",  "-"+risk.avgLoss, "neg")}
      </div>
    </div>`
}

// ════════════════════════════════
// 📊 圖表（呼叫 Node API）
// ════════════════════════════════
const CO = { grid:"rgba(56,189,248,0.07)", text:"#e2e8f0", green:"#22c55e", red:"#ef4444", blue:"#38bdf8" }

function destroyCharts() { Object.values(charts).forEach(c => c?.destroy()); charts = {} }

function sharedOpts(maxY) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{
      backgroundColor:"#0d1420", borderColor:"rgba(56,189,248,.3)",
      borderWidth:1, titleColor:CO.blue, bodyColor:CO.text
    }},
    scales:{
      x:{ ticks:{color:CO.text,font:{size:10},maxRotation:45}, grid:{color:CO.grid} },
      y:{ ticks:{color:CO.text,font:{size:10}}, grid:{color:CO.grid}, ...(maxY?{max:maxY,min:0}:{}) }
    }
  }
}

async function renderCharts() {
  destroyCharts()
  try {
    const d = await api('/analysis/full')
    if (d.insufficient) return

    // Equity curve
    const eq = d.equity
    charts.Equity = new Chart(document.getElementById("chartEquity"), {
      type:"line",
      data:{ labels: eq.map((_,i)=>`#${i+1}`), datasets:[{
        data: eq.map(e=>e.equity),
        borderColor: CO.blue, backgroundColor:"rgba(56,189,248,.08)",
        pointBackgroundColor: eq.map(e=>e.equity>=0?CO.green:CO.red),
        pointRadius:4, tension:.3, fill:true
      }]},
      options: sharedOpts()
    })

    // Tag winrate
    if (d.tags.length) {
      charts.Tag = new Chart(document.getElementById("chartTag"), {
        type:"bar",
        data:{ labels: d.tags.map(t=>t.name), datasets:[{
          data: d.tags.map(t=>t.winRate),
          backgroundColor: d.tags.map(t=>t.winRate>=50?"rgba(34,197,94,.6)":"rgba(239,68,68,.6)"),
          borderRadius:6
        }]},
        options: sharedOpts(100)
      })
    }

    // Mood avg pnl
    if (d.mood.length) {
      charts.Mood = new Chart(document.getElementById("chartMood"), {
        type:"bar",
        data:{ labels: d.mood.map(m=>`${MOOD_EMOJI[m.mood]||""} ${m.mood}`), datasets:[{
          data: d.mood.map(m=>m.avgPnl),
          backgroundColor: d.mood.map(m=>m.avgPnl>=0?"rgba(34,197,94,.6)":"rgba(239,68,68,.6)"),
          borderRadius:6
        }]},
        options: sharedOpts()
      })
    }

    // Session
    if (d.session.length) {
      charts.Session = new Chart(document.getElementById("chartSession"), {
        type:"bar",
        data:{ labels: d.session.map(s=>s.session), datasets:[{
          data: d.session.map(s=>s.totalPnl),
          backgroundColor: d.session.map(s=>s.totalPnl>=0?"rgba(34,197,94,.6)":"rgba(239,68,68,.6)"),
          borderRadius:6
        }]},
        options: sharedOpts()
      })
    }
  } catch {
    document.querySelector(".chart-wrap").innerHTML =
      '<div class="empty-state">⚠️ 無法連線到 Node server<br/><small>npm run dev</small></div>'
  }
}

// ════════════════════════════════
// TAG FILTER
// ════════════════════════════════
function updateTagFilter(data) {
  const tags = new Set()
  data.forEach(t=>(t.tags||[]).forEach(tag=>tags.add(tag)))
  const sel = document.getElementById("filterTag")
  const cur = sel.value
  sel.innerHTML = '<option value="">全部標籤</option>'
  tags.forEach(tag=>{
    const opt = document.createElement("option")
    opt.value = tag; opt.textContent = tag
    if (tag === cur) opt.selected = true
    sel.appendChild(opt)
  })
}

// ════════════════════════════════
// 🔔 提醒
// ════════════════════════════════
const NOTIFY_KEY = "tradelog_notify_time"
const REMIND_KEY = "tradelog_last_reminded"

function initNotification() {
  const saved = localStorage.getItem(NOTIFY_KEY)
  if (saved) showNotifyBanner(saved)
  document.getElementById("notifyBtn").classList.toggle("active", !!saved)
  setInterval(checkReminder, 60000)
  checkReminder()
}

document.getElementById("notifyBtn").onclick = async () => {
  const saved = localStorage.getItem(NOTIFY_KEY)
  if (saved) {
    if (confirm("要關閉每日提醒嗎？")) {
      localStorage.removeItem(NOTIFY_KEY)
      document.getElementById("notifyBanner").style.display = "none"
      document.getElementById("notifyBtn").classList.remove("active")
    }
    return
  }
  if (!("Notification" in window)) return alert("此瀏覽器不支援通知")
  const perm = await Notification.requestPermission()
  if (perm !== "granted") return alert("請允許通知權限")
  const time = prompt("設定每日提醒時間（24hr，例如 20:00）：","20:00")
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return
  localStorage.setItem(NOTIFY_KEY, time)
  showNotifyBanner(time)
  document.getElementById("notifyBtn").classList.add("active")
}

document.getElementById("notifyOff").onclick = () => {
  localStorage.removeItem(NOTIFY_KEY)
  document.getElementById("notifyBanner").style.display = "none"
  document.getElementById("notifyBtn").classList.remove("active")
}

function showNotifyBanner(time) {
  document.getElementById("notifyTimeDisplay").textContent = time
  document.getElementById("notifyBanner").style.display = "flex"
}

function checkReminder() {
  const saved = localStorage.getItem(NOTIFY_KEY)
  if (!saved || Notification.permission !== "granted") return
  const now   = new Date()
  const hhmm  = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`
  const today = now.toDateString()
  if (hhmm === saved && localStorage.getItem(REMIND_KEY) !== today) {
    localStorage.setItem(REMIND_KEY, today)
    new Notification("📈 TradeLog 每日回顧", { body:"今天的交易記錄了嗎？" })
  }
}

// ─── Start ───
initNotification()
load()
