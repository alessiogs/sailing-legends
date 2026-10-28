/**
 * Rewrites the golden race snapshot (`tests/golden/races.json`). Run with `npm run golden:update`.
 *
 * Only do this when behaviour is meant to change (never during a behaviour-preserving refactor),
 * and review the diff of races.json before committing it.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatSnapshot, sailAllGoldenRaces, SNAPSHOT_URL } from "../tests/golden/races";

const path = fileURLToPath(SNAPSHOT_URL);
writeFileSync(path, formatSnapshot(sailAllGoldenRaces()));
console.log(`wrote ${path}`);
