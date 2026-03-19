import { createClient } from '@supabase/supabase-js'

// ⚠️ 用 service_role key（後端專用，不要放前端）
// 在 Supabase → Project Settings → API → service_role
const SUPABASE_URL      = process.env.SUPABASE_URL      || "https://sqinymtmpesrxcpbdayt.supabase.co"
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxaW55bXRtcGVzcnhjcGJkYXl0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcwNTQ1NSwiZXhwIjoyMDg2MjgxNDU1fQ.50hVZhZA0IL7ZKZh6l_Kz29GGIAal4hRxBozCz2FsOI"

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
