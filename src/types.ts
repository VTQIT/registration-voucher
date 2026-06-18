export interface AppUser {
  uid: string;
  email: string;
  voucher: string;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  } | Date;
}

export interface PromoVoucher {
  code: string;
  duration: string;
  used: boolean;
  usedBy: string;
  usedAt: {
    seconds: number;
    nanoseconds: number;
  } | Date | null;
}

export type ViewState = "login" | "register" | "dashboard" | "loading";
