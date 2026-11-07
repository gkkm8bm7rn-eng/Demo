/* SdM public demo retired. No catalog requests or offline catalog shell. */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('storefront:' + scope + ':')).map(key => caches.delete(key)));
    } catch (_) {}
    await self.clients.claim();
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(pages.filter(page => page.url.startsWith(scope)).map(page => page.navigate(new URL('index.html', scope).href).catch(() => {})));
    await self.registration.unregister();
  })());
});
