export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: "draft" | "sending" | "completed" | "failed";
  isCertificateEnabled: boolean;
  certCoords: {
    x: number;
    y: number;
    fontSize: number;
    fontColor: "black" | "white";
  } | null;
  createdBy: string;
  createdAt: any;
  totalCount: number;
  sentCount: number;
  failedCount: number;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  status: "pending" | "sent" | "failed";
  error?: string;
  sentAt?: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  useRealSMTP: boolean;
}
