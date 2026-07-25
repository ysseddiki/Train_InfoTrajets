import nodemailer from "nodemailer";
import { store } from "../domain/store.js";

export interface EmailNotifierPort {
  send(input: {
    to: string[];
    subject: string;
    body: string;
  }): Promise<{ ok: boolean; detail?: string }>;
}

export interface TeamsNotifierPort {
  send(input: {
    title: string;
    body: string;
  }): Promise<{ ok: boolean; detail?: string }>;
}

export class SmtpEmailNotifier implements EmailNotifierPort {
  async send(input: {
    to: string[];
    subject: string;
    body: string;
  }): Promise<{ ok: boolean; detail?: string }> {
    const cfg = await store.getSmtpRuntime();
    if (!cfg.enabled) {
      return { ok: false, detail: "SMTP désactivé (admin)" };
    }
    if (!cfg.host || !cfg.fromAddress) {
      return { ok: false, detail: "SMTP_HOST / From manquants" };
    }
    if (input.to.length === 0) {
      return { ok: false, detail: "No recipients configured" };
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.username
        ? {
            user: cfg.username,
            pass: cfg.password,
          }
        : undefined,
    });

    try {
      await transporter.sendMail({
        from: cfg.fromAddress,
        to: input.to.join(", "),
        subject: input.subject,
        text: input.body,
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "SMTP send failed";
      return { ok: false, detail: message };
    }
  }
}

export class TeamsWebhookNotifier implements TeamsNotifierPort {
  async send(input: {
    title: string;
    body: string;
  }): Promise<{ ok: boolean; detail?: string }> {
    if (process.env.TEAMS_ENABLED !== "true") {
      return { ok: false, detail: "TEAMS_ENABLED is false" };
    }
    const url = process.env.TEAMS_WEBHOOK_URL;
    if (!url) {
      return { ok: false, detail: "TEAMS_WEBHOOK_URL missing" };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          summary: input.title,
          themeColor: "0076D7",
          title: input.title,
          text: input.body,
        }),
      });
      if (!res.ok) {
        return { ok: false, detail: `Teams HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Teams send failed";
      return { ok: false, detail: message };
    }
  }
}

export const emailNotifier = new SmtpEmailNotifier();
export const teamsNotifier = new TeamsWebhookNotifier();
