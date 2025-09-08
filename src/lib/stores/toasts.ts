import { writable } from "svelte/store";

export const toasts = writable([]);

export const addToast = (toast: Partial<IToast>) => {
  // Create a unique ID so we can easily find/remove it
  // if it is dismissible/has a timeout.
  const id = Math.floor(Math.random() * 10000);

  // Setup some sensible defaults for a toast.
  const defaults: IToast = {
    id,
    type: "info",
    dismissible: true,
    timeout: (toast.type ?? "info") === "error" ? 20000 : 5000, // No timeout for errors, 5 seconds for others
    message: "",
  };
  
  const toastData: IToast = { ...defaults, ...toast };

  // console.log("Adding toast:", toastData);

  // Push the toast to the top of the list of toasts
  toasts.update((all) => [toastData, ...all]);

  // If toast is dismissible, dismiss it after "timeout" amount of time.
  if (toastData.timeout) setTimeout(() => dismissToast(id), toastData.timeout);
};

export const dismissToast = (id: number) => {
  toasts.update((all) => all.filter((t) => t.id !== id));
};


export type ToastType = "info" | "success" | "warning" | "error";

export interface IToast {
  id: number;
  type: ToastType;
  dismissible: boolean;
  timeout: number;
  message: string;
}
