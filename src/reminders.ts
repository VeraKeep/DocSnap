export type NotifyBefore = 0 | 7 | 14 | 30 | 60;
export type NotificationMethod = "browser";
export interface Reminder { id: string; documentId: string; documentName: string; expirationDate: string; notifyBefore: NotifyBefore; method: NotificationMethod; createdAt: string; }
const KEY = "docsnap-reminders-v1";
function read(): Reminder[] { try { return JSON.parse(localStorage.getItem(KEY) || "[]") as Reminder[]; } catch { return []; } }
function write(items: Reminder[]) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ } }
export function getReminders(): Reminder[] { return read(); }
export function saveReminder(input: Omit<Reminder, "id" | "createdAt" | "method"> & { method?: NotificationMethod }): Reminder {
  const item: Reminder = { ...input, method: input.method || "browser", id: `${input.documentId}-${input.expirationDate}`, createdAt: new Date().toISOString() };
  write([...read().filter((r) => r.id !== item.id), item]); return item;
}
export function removeReminder(id: string) { write(read().filter((r) => r.id !== id)); }
export function checkReminders(now = new Date()): Reminder[] {
  return read().filter((r) => { const due = new Date(r.expirationDate).getTime() - now.getTime(); return due >= 0 && due <= r.notifyBefore * 86400000; });
}
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.requestPermission();
}
export function notifyDueReminders(now = new Date()): Reminder[] {
  const due = checkReminders(now);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") due.forEach((r) => new Notification("DocSnap reminder", { body: `${r.documentName} expires ${new Date(r.expirationDate).toLocaleDateString()}.` }));
  return due;
}
