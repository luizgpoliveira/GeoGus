import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => {
    const swBuild = 'gg-sw-v10';
    const refreshedKey = `gg-sw-refreshed:${swBuild}`;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || sessionStorage.getItem(refreshedKey)) return;
      sessionStorage.setItem(refreshedKey, '1');
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register(`/sw.js?build=${swBuild}`, { updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});
  });
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
