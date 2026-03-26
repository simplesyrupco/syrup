import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const EMAIL_TO = process.env.EMAIL_TO || "kory@gorsky.ca";
export const EMAIL_FROM =
  process.env.RESEND_FROM || "Paperclip CEO <onboarding@resend.dev>";
export const EMAIL_REPLY_TO = process.env.RESEND_REPLY_TO || undefined;
