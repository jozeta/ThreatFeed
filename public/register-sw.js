// Register service worker if supported
if ('serviceWorker' in navigator && !window.location.host.includes('localhost') && !window.location.host.includes('127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('SW registration skipped or failed:', err);
    });
  });
}
