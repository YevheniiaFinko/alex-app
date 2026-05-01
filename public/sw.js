// Alex — service worker for PWA notifications.
// Triggers: milestone streaks (P0.4), phase change + period prediction (P1.7).
// Scope: served from /sw.js, controls origin root.

const SW_VERSION = "alex-sw-v2"

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Push from server (future cloud-trigger via VAPID).
// Payload format: { title, body, url, tag }
self.addEventListener("push", (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || "Alex"
  const body  = data.body  || "🌟 Time to check in"
  const url   = data.url   || "/"
  const tag   = data.tag   || "alex-milestone"

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      requireInteraction: false,
    })
  )
})

// Receive trigger from app code: navigator.serviceWorker.controller.postMessage({...})
// Used for client-side detection (milestone, phase change, period prediction).
// Accepts SHOW_MILESTONE (legacy) and generic SHOW_NOTIFICATION.
self.addEventListener("message", (event) => {
  const msg = event.data || {}
  if (msg.type !== "SHOW_MILESTONE" && msg.type !== "SHOW_NOTIFICATION") return

  const title = msg.title || "🌟 Alex"
  const body  = msg.body  || ""
  const url   = msg.url   || "/"
  const tag   = msg.tag   || (msg.type === "SHOW_MILESTONE" ? "alex-milestone" : "alex-notif")

  self.registration.showNotification(title, {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url },
    requireInteraction: false,
  })
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
