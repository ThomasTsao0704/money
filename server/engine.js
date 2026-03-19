// ══════════════════════════════════════════
// 🧠 行為分析引擎（純函數，可獨立測試）
// ══════════════════════════════════════════

const BAD_MOODS = new Set(["焦躁", "衝動", "FOMO", "恐懼"])

// ─── 風險評分（單筆，下單前攔截用）───
// score 0~10，越高越危險
export function riskScore(trade, recentTrades = []) {
  let score = 0
  const reasons = []

  if (trade.mistake) {
    score += 3
    reasons.push("自認是錯誤交易 (+3)")
  }
  if (trade.confidence && trade.confidence <= 2) {
    score += 2
    reasons.push("信心指數過低 (+2)")
  }
  if (BAD_MOODS.has(trade.mood)) {
    score += 2
    reasons.push(`情緒狀態：${trade.mood} (+2)`)
  }
  if (!trade.setup) {
    score += 2
    reasons.push("沒有策略 Setup (+2)")
  }
  if (trade.planned === false) {
    score += 2
    reasons.push("計畫外交易 (+2)")
  }
  const warnTags = (trade.tags || []).filter(t => ["追高","情緒單","報復性"].includes(t))
  if (warnTags.length) {
    score += warnTags.length * 2
    reasons.push(`高風險標籤：${warnTags.join(", ")} (+${warnTags.length * 2})`)
  }

  // 結合歷史：連虧後繼續 → 加分
  if (recentTrades.length >= 2) {
    const lastTwo = recentTrades.slice(-2)
    if (lastTwo.every(t => t.profit < 0)) {
      score += 2
      reasons.push("連虧後繼續下單 (+2)")
    }
  }

  score = Math.min(score, 10)

  let decision = "OK"
  let level    = "safe"
  if (score >= 7) { decision = "BLOCK";   level = "danger" }
  else if (score >= 4) { decision = "WARNING"; level = "warning" }

  return { score, decision, level, reasons }
}

// ─── 連虧 / Revenge trading 偵測 ───
export function detectRevenge(trades) {
  if (trades.length < 3) return false
  const last3 = trades.slice(-3)
  return last3[0].profit < 0 &&
         last3[1].profit < 0 &&
         last3[2].confidence != null && last3[2].confidence < 3
}

// ─── Equity Curve ───
export function buildEquityCurve(trades) {
  let cum = 0
  return trades
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((t, i) => {
      cum += t.profit
      return { index: i + 1, symbol: t.symbol, equity: parseFloat(cum.toFixed(2)) }
    })
}

// ─── Tag 勝率分析 ───
export function analyzeByTag(trades) {
  const map = {}
  trades.forEach(t => {
    ;(t.tags || []).forEach(tag => {
      if (!map[tag]) map[tag] = { total: 0, win: 0, pnl: 0 }
      map[tag].total++
      if (t.profit > 0) map[tag].win++
      map[tag].pnl += t.profit
    })
  })
  return Object.entries(map).map(([name, d]) => ({
    name,
    total:   d.total,
    win:     d.win,
    winRate: parseFloat((d.win / d.total * 100).toFixed(1)),
    avgPnl:  parseFloat((d.pnl / d.total).toFixed(2)),
    totalPnl: parseFloat(d.pnl.toFixed(2))
  })).sort((a, b) => b.avgPnl - a.avgPnl)
}

// ─── Tag 組合分析（找複合 edge）───
export function analyzeTagCombos(trades) {
  const map = {}
  trades.forEach(t => {
    const tags = (t.tags || []).sort().join(" + ")
    if (!tags) return
    if (!map[tags]) map[tags] = { total: 0, pnl: 0, win: 0 }
    map[tags].total++
    map[tags].pnl += t.profit
    if (t.profit > 0) map[tags].win++
  })
  return Object.entries(map)
    .filter(([, d]) => d.total >= 2)  // 至少 2 筆才有意義
    .map(([combo, d]) => ({
      combo,
      total:   d.total,
      winRate: parseFloat((d.win / d.total * 100).toFixed(1)),
      avgPnl:  parseFloat((d.pnl / d.total).toFixed(2))
    }))
    .sort((a, b) => b.avgPnl - a.avgPnl)
    .slice(0, 10)  // 只取前10
}

// ─── 情緒分析 ───
export function analyzeByMood(trades) {
  const map = {}
  trades.filter(t => t.mood).forEach(t => {
    if (!map[t.mood]) map[t.mood] = { total: 0, win: 0, pnl: 0 }
    map[t.mood].total++
    if (t.profit > 0) map[t.mood].win++
    map[t.mood].pnl += t.profit
  })
  return Object.entries(map).map(([mood, d]) => ({
    mood,
    total:   d.total,
    winRate: parseFloat((d.win / d.total * 100).toFixed(1)),
    avgPnl:  parseFloat((d.pnl / d.total).toFixed(2)),
    totalPnl: parseFloat(d.pnl.toFixed(2))
  })).sort((a, b) => b.avgPnl - a.avgPnl)
}

// ─── 時段分析 ───
export function analyzeBySession(trades) {
  const map = {}
  trades.filter(t => t.session).forEach(t => {
    if (!map[t.session]) map[t.session] = { total: 0, win: 0, pnl: 0 }
    map[t.session].total++
    if (t.profit > 0) map[t.session].win++
    map[t.session].pnl += t.profit
  })
  return Object.entries(map).map(([session, d]) => ({
    session,
    total:   d.total,
    winRate: parseFloat((d.win / d.total * 100).toFixed(1)),
    avgPnl:  parseFloat((d.pnl / d.total).toFixed(2)),
    totalPnl: parseFloat(d.pnl.toFixed(2))
  })).sort((a, b) => b.avgPnl - a.avgPnl)
}

// ─── 信心 vs 結果 ───
export function analyzeByConfidence(trades) {
  const groups = { high: [], mid: [], low: [] }
  trades.filter(t => t.confidence).forEach(t => {
    if (t.confidence >= 4) groups.high.push(t)
    else if (t.confidence === 3) groups.mid.push(t)
    else groups.low.push(t)
  })
  const calc = (arr, label) => {
    if (!arr.length) return null
    const wins = arr.filter(t => t.profit > 0).length
    const pnl  = arr.reduce((s, t) => s + t.profit, 0)
    return {
      label,
      count:   arr.length,
      winRate: parseFloat((wins / arr.length * 100).toFixed(1)),
      avgPnl:  parseFloat((pnl / arr.length).toFixed(2)),
      totalPnl: parseFloat(pnl.toFixed(2))
    }
  }
  return [
    calc(groups.high, "高信心 (4~5)"),
    calc(groups.mid,  "中信心 (3)"),
    calc(groups.low,  "低信心 (1~2)")
  ].filter(Boolean)
}

// ─── 連虧後分析（Revenge trading）───
export function analyzeAfterLoss(trades) {
  const afterLoss = []
  for (let i = 1; i < trades.length; i++) {
    if (trades[i - 1].profit < 0) afterLoss.push(trades[i])
  }
  if (!afterLoss.length) return null
  const wins = afterLoss.filter(t => t.profit > 0).length
  return {
    count:   afterLoss.length,
    winRate: parseFloat((wins / afterLoss.length * 100).toFixed(1)),
    avgPnl:  parseFloat((afterLoss.reduce((s, t) => s + t.profit, 0) / afterLoss.length).toFixed(2))
  }
}

// ─── 風險指標 ───
export function calcRiskMetrics(trades) {
  if (!trades.length) return {}

  // Max drawdown
  let peak = 0, cum = 0, maxDD = 0
  trades.forEach(t => {
    cum += t.profit
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDD) maxDD = dd
  })

  // Max consecutive losses
  let maxLossStreak = 0, curLoss = 0
  trades.forEach(t => {
    if (t.profit < 0) { curLoss++; if (curLoss > maxLossStreak) maxLossStreak = curLoss }
    else curLoss = 0
  })

  const wins   = trades.filter(t => t.profit > 0)
  const losses = trades.filter(t => t.profit < 0)
  const totalWin  = wins.reduce((s, t) => s + t.profit, 0)
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0))

  return {
    maxDrawdown:    parseFloat(maxDD.toFixed(2)),
    maxLossStreak,
    profitFactor:   totalLoss > 0 ? parseFloat((totalWin / totalLoss).toFixed(2)) : null,
    bestTrade:      parseFloat(Math.max(...trades.map(t => t.profit)).toFixed(2)),
    worstTrade:     parseFloat(Math.min(...trades.map(t => t.profit)).toFixed(2)),
    avgWin:         wins.length   ? parseFloat((totalWin  / wins.length).toFixed(2))   : 0,
    avgLoss:        losses.length ? parseFloat((totalLoss / losses.length).toFixed(2)) : 0,
    plannedRate:    parseFloat((trades.filter(t => t.planned !== false).length / trades.length * 100).toFixed(1)),
    mistakeRate:    parseFloat((trades.filter(t => t.mistake).length / trades.length * 100).toFixed(1))
  }
}

// ─── 行為警告（基於最近紀錄）───
export function buildWarnings(trades) {
  const warnings = []
  if (trades.length < 3) return warnings

  const recent = trades.slice(-5)
  const last3  = trades.slice(-3)

  // 連虧
  const losses3 = last3.filter(t => t.profit < 0).length
  if (losses3 === 3)
    warnings.push({ level: "danger", icon: "🚨", msg: "連續虧損 3 筆，系統建議你暫停交易、離開螢幕。" })
  else if (losses3 === 2)
    warnings.push({ level: "warning", icon: "⚠️", msg: "最近 3 筆有 2 筆虧損，注意是否過度交易。" })

  // Revenge trading
  if (detectRevenge(trades))
    warnings.push({ level: "danger", icon: "🔁", msg: "偵測到報復性交易模式：連虧後低信心繼續進場。" })

  // 計畫外過多
  const unplanned = recent.filter(t => t.planned === false).length
  if (unplanned >= 3)
    warnings.push({ level: "warning", icon: "📋", msg: `最近 5 筆有 ${unplanned} 筆計畫外交易，你在追市場。` })

  // 負面情緒連續
  const BAD = ["衝動","焦躁","FOMO","恐懼"]
  const badMoodCount = recent.filter(t => BAD.includes(t.mood)).length
  if (badMoodCount >= 3)
    warnings.push({ level: "danger", icon: "🧠", msg: `最近 ${badMoodCount} 筆都在情緒不佳時交易，這是虧損的主因之一。` })

  // 低信心連續
  const lowConf = recent.filter(t => t.confidence && t.confidence <= 2).length
  if (lowConf >= 3)
    warnings.push({ level: "warning", icon: "📉", msg: `最近 ${lowConf} 筆信心指數 ≤ 2，你不確定自己在做什麼。` })

  return warnings
}
