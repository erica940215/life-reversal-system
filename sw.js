/* 序光計畫：Service Worker（只負責推播通知，不快取網頁，網站更新不會被卡住） */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "序光計畫", {
    body: d.body || "",
    icon: "img/app/icon-192.png",
    badge: "img/app/icon-192.png",
    tag: d.tag || "reminder",
    renotify: true,
    data: { url: d.url || "./#today" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); if ("navigate" in c) c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
