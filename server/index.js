import express from 'express'
import cors    from 'cors'
import analysisRoutes from './routes/analysis.js'

const app  = express()
const PORT = process.env.PORT || 3000

app.use(cors({ origin: '*' }))  // 開發用，正式上線再限制
app.use(express.json())

// Health check
app.get('/api/ping', (_, res) => res.json({ ok: true }))

// Analysis routes
app.use('/api/analysis', analysisRoutes)

app.listen(PORT, () => {
  console.log(`✅ TradeLog server running → http://localhost:${PORT}`)
})
