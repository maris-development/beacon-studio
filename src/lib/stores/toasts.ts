import { writable } from "svelte/store";
import { track } from "@/telemetry";
import type { MessageKey, MessageValues } from "@/i18n";

export const toasts = writable([]);

/** Adds a toast and returns its id, for a caller that dismisses its own toast. */
export function addToast(toast: Partial<IToast>): number {
  // Create a unique ID so we can easily find/remove it
  // if it is dismissible/has a timeout.
  const id = Math.floor(Math.random() * 10000);

  // Setup some sensible defaults for a toast.
  const defaults: IToast = {
    id,
    type: "info",
    dismissible: true,
    timeout: getDefaultDuration(toast.type ?? "info"), // No timeout for errors, 5 seconds for others
    message: "",
  };
  
  const toastData: IToast = { ...defaults, ...toast };

  // console.log("Adding toast:", toastData);

  // Push the toast to the top of the list of toasts
  toasts.update((all) => [toastData, ...all]);

  // The key keeps the telemetry the same in every language. The raw text goes along as detail.
  let props: Record<string, unknown> | undefined;
  if (toastData.key) props = { detail: toastData.message || undefined, values: toastData.values };
  track(`toast.${toastData.type}`, {
    level: toastData.type,
    message: toastData.key ?? toastData.message,
    props,
  });

  // If toast is dismissible, dismiss it after "timeout" amount of time.
  if (toastData.timeout) setTimeout(() => dismissToast(id), toastData.timeout);

  return id;
};

export const dismissToast = (id: number) => {
  toasts.update((all) => all.filter((t) => t.id !== id));
};

const getDefaultDuration = (type: ToastType): number => {
  switch (type) {
    case "error":
    case "warning":
      return 20000; // 20 seconds
    default:
      return 5000; // 5 seconds
  }
}


export type ToastType = "info" | "success" | "warning" | "error";

export interface IToast {
  id: number;
  type: ToastType;
  dismissible: boolean;
  timeout: number;
  /** The translation key of the text. The toast translates it at render time. */
  key?: MessageKey;
  values?: MessageValues;
  /** Raw text with no key, for example a server error. It follows the key text when both are set. */
  message: string;
}


