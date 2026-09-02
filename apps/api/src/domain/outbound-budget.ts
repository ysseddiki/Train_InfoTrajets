/**
 * Budget d'appels sortants vers un service tiers, par fenêtre de temps.
 *
 * Les caches absorbent les répétitions, mais une route accessible sans session peut
 * varier ses paramètres (ex. `/v1/dashboard/day` sur chaque jour de la heatmap) et
 * générer un appel externe par requête. Le budget borne ce volume : au-delà, l'appel
 * est refusé et l'appelant dégrade proprement plutôt que d'amplifier le trafic.
 */
export class OutboundBudget {
  private count = 0;
  private resetAt = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  tryConsume(now = Date.now()): boolean {
    if (now >= this.resetAt) {
      this.count = 0;
      this.resetAt = now + this.windowMs;
    }
    if (this.count >= this.max) return false;
    this.count += 1;
    return true;
  }

  remaining(now = Date.now()): number {
    if (now >= this.resetAt) return this.max;
    return Math.max(0, this.max - this.count);
  }

  reset(): void {
    this.count = 0;
    this.resetAt = 0;
  }
}
