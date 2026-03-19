import express from 'express'
import { supabase } from '../db.js'
import {
  riskScore, buildEquityCurve, analyzeByTag, analyzeTagCombos,
  analyzeByMood, analyzeBySession, analyzeByConfidence,
  analyzeAfterLoss, calcRiskMetrics, buildWarnings
} from '../engine.js'

const router = express.Router()

// ─── 取得該使用者所有交易（內部 helper）───
async function getUserTrades(userId) {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// ─── 從 Authorization header 取得 user ───
async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

// ══════════════════════════════════════════
// GET /api/analysis/equity
// 累積盈虧曲線
// ══════════════════════════════════════════
router.get('/equity', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)
    res.json(buildEquityCurve(trades))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════
// GET /api/analysis/tags
// Tag 勝率 + 組合分析
// ══════════════════════════════════════════
router.get('/tags', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)
    res.json({
      single: analyzeByTag(trades),
      combos: analyzeTagCombos(trades)
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════
// GET /api/analysis/mood
// 情緒分析
// ══════════════════════════════════════════
router.get('/mood', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)
    res.json(analyzeByMood(trades))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════
// GET /api/analysis/session
// 時段分析
// ══════════════════════════════════════════
router.get('/session', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)
    res.json(analyzeBySession(trades))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════
// GET /api/analysis/full
// 完整分析報告（前端用一次 call 拿全部）
// ══════════════════════════════════════════
router.get('/full', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)

    if (trades.length < 3) {
      return res.json({ insufficient: true, count: trades.length })
    }

    res.json({
      equity:       buildEquityCurve(trades),
      tags:         analyzeByTag(trades),
      tagCombos:    analyzeTagCombos(trades),
      mood:         analyzeByMood(trades),
      session:      analyzeBySession(trades),
      confidence:   analyzeByConfidence(trades),
      afterLoss:    analyzeAfterLoss(trades),
      risk:         calcRiskMetrics(trades),
      warnings:     buildWarnings(trades),
      totalTrades:  trades.length
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════
// GET /api/analysis/warnings
// 即時行為警告
// ══════════════════════════════════════════
router.get('/warnings', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)
    res.json(buildWarnings(trades))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ══════════════════════════════════════════
// POST /api/analysis/decision
// 下單前風險評分（送出前攔截）
// body: { mood, confidence, setup, planned, mistake, tags }
// ══════════════════════════════════════════
router.post('/decision', async (req, res) => {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: '請先登入' })

    const trades = await getUserTrades(user.id)
    const result = riskScore(req.body, trades)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
