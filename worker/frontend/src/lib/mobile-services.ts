import { Centrifuge } from "centrifuge";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

export type RealtimeStatus = "disabled" | "connecting" | "connected" | "error";

export function connectSvoeRealtime(onStatus: (status: RealtimeStatus) => void) {
  const url = import.meta.env.VITE_CENTRIFUGO_URL;
  const tokenUrl = import.meta.env.VITE_CENTRIFUGO_TOKEN_URL;
  if (!url || !tokenUrl) {
    onStatus("disabled");
    return () => undefined;
  }
  const client = new Centrifuge(url, {
    getToken: async () => {
      const response = await fetch(tokenUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Не удалось получить токен realtime");
      const payload = await response.json() as { token?: string };
      if (!payload.token) throw new Error("Сервер не вернул realtime token");
      return payload.token;
    },
  });
  client.on("connecting", () => onStatus("connecting"));
  client.on("connected", () => onStatus("connected"));
  client.on("disconnected", () => onStatus("disabled"));
  client.on("error", () => onStatus("error"));
  client.connect();
  return () => client.disconnect();
}

export async function enableSvoePush(onMessageReceived?: (payload: unknown) => void) {
  const env = import.meta.env;
  const required = [env.VITE_FIREBASE_API_KEY, env.VITE_FIREBASE_PROJECT_ID, env.VITE_FIREBASE_MESSAGING_SENDER_ID, env.VITE_FIREBASE_APP_ID, env.VITE_FIREBASE_VAPID_KEY];
  if (required.some((value) => !value)) throw new Error("Для push-уведомлений сначала настройте Firebase Web App и VAPID key.");
  if (!(await isSupported())) throw new Error("Firebase Messaging не поддерживается этим браузером.");
  const app = getApps()[0] ?? initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error("Сначала установите PWA и активируйте service worker.");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
  onMessage(messaging, (payload) => onMessageReceived?.(payload));
  return token;
}
