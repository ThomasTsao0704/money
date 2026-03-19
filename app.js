import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// ⚠️ 替換成你的 Supabase 資訊
const SUPABASE_URL = "https://sqinymtmpesrxcpbdayt.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxaW55bXRtcGVzcnhjcGJkYXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MDU0NTUsImV4cCI6MjA4NjI4MTQ1NX0.8dS36xXDnt_fox-CNUx_SUQJNw0JvRVl_AnEnFen6Yc"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── DOM refs ───
const listEl       = document.getElementById("list")
const userInfo     = document.getElementById("userInfo")
const emptyState   = document.getElementById("emptyState")
const moodBar      = document.getElementById("moodBar")
const moodGrid     = document.getElementById("moodGrid")
const confidenceEl = document.getElementById("confidence")
const confDisplay  = document.getElementById("confidenceDisplay")

// ─── Tag 選取狀態 ───
let selectedTags = []

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
  }
})

// ─── Confidence slider display ───
confidenceEl.oninput = () => {
  confDisplay.textContent = confidenceEl.value
}

// ─── Toggle form ───
document.getElementById("toggleForm").onclick = function() {
  const body = document.getElementById("formBody")
  const isOpen = body.style.display !== "none"
  body.style.display = isOpen ? "none" : "block"
  this.textContent = isOpen ? "▼ 展開" : "▲ 收起"
}

// ─── Auth ───
document.getElementById("loginBtn").onclick = async () => {
  const email    = document.getElementById("email").value
  const password = document.getElementById("password").value
  if (!email || !password) return alert("請輸入 Email 和密碼")

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const { error: signUpErr } = await supabase.auth.signUp({ email, password })
    if (signUpErr) return alert("錯誤：" + signUpErr.message)
    alert("已發送確認信，請確認後登入")
  }
  load()
}

document.getElementById("logoutBtn").onclick = async () => {
  await supabase.auth.signOut()
  load()
}

// ─── Add Trade ───
document.getElementById("addBtn").onclick = async () => {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return alert("請先登入")

  const entry  = Number(document.getElementById("entry").value)
  const exit   = Number(document.getElementById("exit").value)
  const qty    = Number(document.getElementById("qty").value)
  const symbol = document.getElementById("symbol").value.trim().toUpperCase()
  const type   = document.getElementById("type").value

  if (!symbol || !entry || !exit || !qty) return alert("請填寫標的、價格與數量")

  const profit = type === "LONG"
    ? (exit - entry) * qty
    : (entry - exit) * qty

  const { error } = await supabase.from("trades").insert([{
    user_id:      user.id,
    symbol,
    type,
    entry_price:  entry,
    exit_price:   exit,
    qty,
    profit,
    note:         document.getElementById("note").value,
    tags:         selectedTags.length ? selectedTags : null,
    mood:         document.getElementById("mood").value || null,
    confidence:   Number(confidenceEl.value),
    reason:       document.getElementById("reason").value || null,
  }])

  if (error) return alert("新增失敗：" + error.message)

  // Reset form
  ;["symbol","entry","exit","qty","note","reason"].forEach(id => {
    document.getElementById(id).value = ""
  })
  document.getElementById("mood").value = ""
  confidenceEl.value = 3
  confDisplay.textContent = "3"
  selectedTags = []
  document.querySelectorAll(".tag-option").forEach(el => el.classList.remove("selected"))

  load()
}

// ─── Filters ───
document.getElementById("filterTag").onchange  = renderFiltered
document.getElementById("filterMood").onchange = renderFiltered
document.getElementById("filterType").onchange = renderFiltered

let allTrades = []

// ─── Main Load ───
async function load() {
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user

  userInfo.textContent = user ? user.email : "未登入"

  if (!user) {
    listEl.innerHTML = ""
    allTrades = []
    updateStats([])
    moodBar.style.display = "none"
    return
  }

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) { console.error(error); return }

  allTrades = data || []
  updateStats(allTrades)
  updateMoodAnalysis(allTrades)
  updateTagFilter(allTrades)
  renderFiltered()
}

// ─── Render with filters ───
function renderFiltered() {
  const tagF  = document.getElementById("filterTag").value
  const moodF = document.getElementById("filterMood").value
  const typeF = document.getElementById("filterType").value

  let filtered = allTrades.filter(t => {
    if (tagF  && !(t.tags || []).includes(tagF))  return false
    if (moodF && t.mood !== moodF)                return false
    if (typeF && t.type !== typeF)                return false
    return true
  })

  renderList(filtered)
}

// ─── Render List ───
function renderList(data) {
  listEl.innerHTML = ""

  if (!data.length) {
    emptyState.style.display = "block"
    return
  }
  emptyState.style.display = "none"

  data.forEach(t => {
    const li = document.createElement("li")
    li.className = "trade-item"

    const date = new Date(t.created_at).toLocaleDateString("zh-TW", {
      month: "2-digit", day: "2-digit"
    })

    const tagsHtml = (t.tags || [])
      .map(tag => `<span class="trade-tag">${tag}</span>`)
      .join("")

    const dotsHtml = t.confidence
      ? Array.from({length: 5}, (_, i) =>
          `<span class="dot ${i < t.confidence ? 'filled' : ''}"></span>`
        ).join("")
      : ""

    const profitSign = t.profit >= 0 ? "+" : ""
    const profitClass = t.profit >= 0 ? "pos" : "neg"

    const moodEmoji = {
      冷靜: "😌", 自信: "💪", 焦躁: "😤", 衝動: "🔥", 恐懼: "😰", FOMO: "😱"
    }

    li.innerHTML = `
      <div>
        <span class="trade-symbol">${t.symbol}</span>
        <span class="trade-type-badge ${t.type === 'LONG' ? 'badge-long' : 'badge-short'}">${t.type}</span>
      </div>
      <div class="trade-meta">
        <div class="trade-prices">
          進 ${t.entry_price} → 出 ${t.exit_price} × ${t.qty}
          ${t.reason ? `<span style="color:var(--text-dim)"> ／ ${t.reason}</span>` : ""}
        </div>
        <div class="trade-tags">
          ${tagsHtml}
          ${t.mood ? `<span class="trade-mood-badge">${moodEmoji[t.mood] || ""} ${t.mood}</span>` : ""}
          ${dotsHtml ? `<span class="confidence-dots">${dotsHtml}</span>` : ""}
        </div>
      </div>
      <div class="trade-right">
        <span class="trade-profit ${profitClass}">${profitSign}${t.profit.toFixed(2)}</span>
        <span class="trade-date">${date}</span>
      </div>
    `
    listEl.appendChild(li)
  })
}

// ─── Stats ───
function updateStats(data) {
  const set = (id, val, cls) => {
    const el = document.getElementById(id)
    el.textContent = val
    el.className = "stat-value " + (cls || "")
  }

  if (!data.length) {
    set("val-total", "—"); set("val-winrate", "—")
    set("val-trades", "—"); set("val-avg", "—")
    return
  }

  const total   = data.reduce((s, t) => s + t.profit, 0)
  const wins    = data.filter(t => t.profit > 0).length
  const winRate = (wins / data.length * 100).toFixed(1)
  const avg     = (total / data.length).toFixed(2)

  set("val-total",   (total >= 0 ? "+" : "") + total.toFixed(2), total >= 0 ? "positive" : "negative")
  set("val-winrate", winRate + "%", winRate >= 50 ? "positive" : "negative")
  set("val-trades",  data.length)
  set("val-avg",     (avg >= 0 ? "+" : "") + avg, avg >= 0 ? "positive" : "negative")
}

// ─── Mood Analysis ───
function updateMoodAnalysis(data) {
  const moods = data.filter(t => t.mood)
  if (!moods.length) {
    moodBar.style.display = "none"
    return
  }

  moodBar.style.display = "block"

  const moodMap = {}
  moods.forEach(t => {
    if (!moodMap[t.mood]) moodMap[t.mood] = { profit: 0, count: 0 }
    moodMap[t.mood].profit += t.profit
    moodMap[t.mood].count++
  })

  moodGrid.innerHTML = ""
  const moodEmoji = {
    冷靜: "😌", 自信: "💪", 焦躁: "😤", 衝動: "🔥", 恐懼: "😰", FOMO: "😱"
  }

  Object.entries(moodMap)
    .sort((a, b) => b[1].profit - a[1].profit)
    .forEach(([mood, { profit, count }]) => {
      const div = document.createElement("div")
      div.className = "mood-stat"
      const sign = profit >= 0 ? "+" : ""
      const color = profit >= 0 ? "var(--green)" : "var(--red)"
      div.innerHTML = `
        <span class="mood-name">${moodEmoji[mood] || ""} ${mood}</span>
        <span class="mood-profit" style="color:${color}">${sign}${profit.toFixed(0)}</span>
        <span class="mood-count">${count} 筆</span>
      `
      moodGrid.appendChild(div)
    })
}

// ─── Tag Filter Options ───
function updateTagFilter(data) {
  const tags = new Set()
  data.forEach(t => (t.tags || []).forEach(tag => tags.add(tag)))

  const sel = document.getElementById("filterTag")
  const cur = sel.value
  sel.innerHTML = '<option value="">全部標籤</option>'
  tags.forEach(tag => {
    const opt = document.createElement("option")
    opt.value = tag
    opt.textContent = tag
    if (tag === cur) opt.selected = true
    sel.appendChild(opt)
  })
}

load()
