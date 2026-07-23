/** Outbound notification ports — secrets stay in env, never logged */

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

export class UnimplementedEmailNotifier implements EmailNotifierPort {
  async send(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: "SMTP adapter not wired yet" };
  }
}

export class UnimplementedTeamsNotifier implements TeamsNotifierPort {
  async send(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: "Teams adapter not wired yet" };
  }
}
