import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Browser push for task reminders (channel "push"). The service worker
 * (vite-plugin-pwa + public/push-sw.js) shows the notifications; the backend
 * keeps one subscription per browser (routes/api/taskTypes.ts → /api/v1/push).
 *
 * Needs a secure context: HTTPS with a certificate the browser trusts. With
 * the installer's self-signed certificate that means importing it as trusted
 * on the PC; otherwise no service worker registers and push is unavailable.
 */

export type PushState = 'unsupported' | 'insecure' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // The PWA plugin registers the worker on load; wait briefly for it.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'insecure';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const state = await getPushState();
  if (state === 'unsupported' || state === 'insecure' || state === 'denied') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'insecure';
  const { publicKey } = await invokeNodeApi<{ publicKey: string }>('/api/v1/push/key');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = sub.toJSON();
  await invokeNodeApi('/api/v1/push/subscribe', {
    method: 'POST',
    body: { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
  });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await invokeNodeApi('/api/v1/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(
      () => undefined
    );
    await sub.unsubscribe();
  }
  return 'off';
}

export async function sendTestPush(title: string, body: string): Promise<number> {
  const r = await invokeNodeApi<{ sent: number }>('/api/v1/push/test', { method: 'POST', body: { title, body } });
  return r.sent;
}
