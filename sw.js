const CACHE_NAME = 'tradelog-v1'
const STATIC_ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
]

// 安裝：快取靜態資源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// 啟動：清除舊快取
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// 攔截請求：靜態資源用快取，API 請求直接走網路
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Supabase API 請求不快取
  if (url.hostname.includes('supabase.co') || url.hostname.includes('jsdelivr.net')) {
    return
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // 只快取成功的 GET 請求
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})
