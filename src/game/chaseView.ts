/**
 * The chase camera's distance and height for the screen's shape. A portrait screen (a phone held upright) is narrow
 * and has the HUD's top strip and thumb deck on it, so the camera pulls back and up: the whole boat stays in view
 * and sits in the middle third of the screen, clear of both. The camera stays low on every screen. Pure maths, free of Babylon.
 */

/** The camera's angle in the chase view (radians from straight down): the lowest the camera may go, so the marks, the other
 *  boats and the horizon stay in view. It is also the camera's upper beta limit. */
export const CHASE_BETA = 1.45;

/** The chase distance on a landscape screen, in metres. */
const chaseRadius = (twoPerson: boolean) => (twoPerson ? 17 : 12);

/** How far a screen is from square toward portrait: 0 for width >= height, up to 1 for a very tall one. */
export function portraitness(aspect: number): number {
  return Math.max(0, Math.min(1, (1 - aspect) / 0.6));
}

/** How much farther the camera sits on a screen of this aspect ratio (width / height) than on a landscape one. */
export function chasePullBack(aspect: number): number {
  return 1 + 0.55 * portraitness(aspect);
}

/** The chase view for a boat on a screen of this aspect ratio: the distance to the boat and the angle above the water. */
export function chaseView(twoPerson: boolean, aspect: number): { radius: number; beta: number } {
  return { radius: chaseRadius(twoPerson) * chasePullBack(aspect), beta: CHASE_BETA };
}
