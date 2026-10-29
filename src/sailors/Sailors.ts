/**
 * The sailors of the game: their profiles, the Rival roster, the opponents' Crews, the extra Helm and the
 * Crew Chemistry of a Pair. Plain data and pure functions (no Babylon, no DOM), so the AI, the race session,
 * the menus and, later, a career season can all read them; the career will store and change them here.
 */

/**
 * A sailor's personality and skill. These map onto the career attributes from the concept (tactics,
 * technique, speed, discipline), so recurring Rivals sail differently.
 */
export type SailorProfile = {
  /** Stable key (lower case, never shown): how menus and the career refer to the sailor. */
  id: string;
  /** Display name. The Racing AI also seeds its wind-reading noise from its length. */
  name: string;
  /** 0..1 — how precisely the sail is trimmed. */
  technique: number;
  /** 0..1 — how quickly they react to shifts (smaller tack hysteresis). */
  tactics: number;
  /** 0..1 — steering smoothness / pointing. */
  speed: number;
  /** 0..1 — low discipline = aggressive start timing, risk of OCS. */
  discipline: number;
  /** 0..100 — shared history with the player (feeds Crew Chemistry); unset counts as `DEFAULT_BOND`. */
  bond?: number;
};

/** Shared history assumed for a sailor who has none yet. */
const DEFAULT_BOND = 60;

/** The recurring Rivals: the opponent Helms, and the Partners the player can choose in two-person classes. */
export const RIVALS: readonly SailorProfile[] = [
  { id: "luca", name: "Luca", technique: 0.73, tactics: 0.9, speed: 0.78, discipline: 0.7, bond: 72 },
  { id: "giulia", name: "Giulia", technique: 0.94, tactics: 0.78, speed: 0.8, discipline: 0.91, bond: 84 },
  { id: "marco", name: "Marco", technique: 0.81, tactics: 0.6, speed: 0.95, discipline: 0.62, bond: 58 },
];

/** The opponents' Crews, who only appear in two-person classes. */
export const CREWS: readonly SailorProfile[] = [
  { id: "sara", name: "Sara", technique: 0.82, tactics: 0.7, speed: 0.75, discipline: 0.85, bond: 75 },
  { id: "tommaso", name: "Tommaso", technique: 0.7, tactics: 0.65, speed: 0.85, discipline: 0.7, bond: 70 },
  { id: "pietro", name: "Pietro", technique: 0.78, tactics: 0.7, speed: 0.8, discipline: 0.8, bond: 78 },
];

/** The Helm who takes the Partner's place among the opponents when a Rival sails with the player. */
export const EXTRA_HELM: SailorProfile = { id: "elena", name: "Elena", technique: 0.85, tactics: 0.82, speed: 0.82, discipline: 0.8 };

/** The near-perfect Helm that steers the player's boat on autopilot (scripted browser tests). */
export const AUTOPILOT_HELM: SailorProfile = { id: "auto", name: "Auto", technique: 0.95, tactics: 0.9, speed: 0.9, discipline: 0.9 };

/** Crew Chemistry 0..100 of a Pair with this sailor: shared history, technique and reliability. */
export function crewChemistry(p: SailorProfile): number {
  const bond = p.bond ?? DEFAULT_BOND;
  return Math.round(0.5 * bond + 0.25 * p.technique * 100 + 0.25 * p.discipline * 100);
}

/** The Rival with this id, if any. */
export function rivalById(id: string): SailorProfile | undefined {
  return RIVALS.find(r => r.id === id);
}

/** The opponent Helms when `partner` sails with the player: the others, plus the extra Helm. */
export function opponentHelms(helms: readonly SailorProfile[], partner: SailorProfile): SailorProfile[] {
  return helms.filter(h => h.id !== partner.id).concat([EXTRA_HELM]);
}

/** The Crew of the opponent boat at this index in two-person classes, taking the Crews in turn. */
export function opponentCrew(index: number): SailorProfile {
  return CREWS[index % CREWS.length];
}
