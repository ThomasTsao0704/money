# Trading Journal v2（升級版）

## 新增功能
- ✅ Tag 策略標籤系統（多選）
- ✅ 情緒記錄（冷靜/自信/焦躁/衝動/恐懼/FOMO）
- ✅ 信心指數（1~5）
- ✅ 進場理由欄位
- ✅ 情緒分析面板（哪種情緒最賺/最虧）
- ✅ 三維篩選（標籤 / 情緒 / 多空）
- ✅ 交易終端機風格 UI
- ✅ 做空盈虧計算修正（SHORT 時 profit = entry - exit）

---

## 快速啟動

### 1. 建立 Supabase 專案 → 取得 URL + anon key

### 2. 執行新的 schema.sql（注意：升級版新增欄位）

```sql
-- 如果是全新專案，直接執行 schema.sql
-- 如果舊專案要升級，執行：
alter table trades add column tags text[];
alter table trades add column mood text;
alter table trades add column confidence int;
alter table trades add column reason text;
```

### 3. 修改 app.js 第 4~5 行
```js
const SUPABASE_URL = "你的URL"
const SUPABASE_KEY = "你的KEY"
```

### 4. 用 VSCode Live Server 開啟 index.html

---

## 情緒分析怎麼看？
記錄 10 筆以上後，「情緒分析」面板會顯示：
- 你在哪種情緒下賺最多
- 你在哪種情緒下虧最多
- 常見模式：衝動/FOMO 交易通常是虧損主因

## 下一步（建議順序）
1. 連續使用 2 週，累積 20 筆+
2. 觀察情緒分析：哪個情緒狀態盈虧最差？
3. 設定「某情緒不交易」的規則
4. 下一版：圖表分析 + AI 行為建議
