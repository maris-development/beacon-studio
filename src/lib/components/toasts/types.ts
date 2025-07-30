
export type ToastType = "info" | "success" | "warning" | "error";

export interface IToast {
  id: number;
  type: ToastType;
  dismissible: boolean;
  timeout: number;
  message: string;
}
