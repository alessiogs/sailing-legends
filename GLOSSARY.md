# Sailing Legends

A dinghy-racing career game. English is the reference language for code and docs; each term shows its
Italian in-game label (_it_) as a reference for translators.

## Sailors

**Helm**:
The sailor who steers and trims the mainsail.
_it_: Timoniere
_Avoid_: Skipper, driver

**Crew**:
The sailor in a two-person boat who trims the jib, spinnaker or gennaker and moves their weight to hold the boat flat.
_it_: Prodiere
_Avoid_: Crew for the two sailors together (see Pair)

**Pair**:
The two sailors of one two-person boat, a Helm and a Crew.
_it_: Equipaggio
_Avoid_: Crew, team, duo

**Partner**:
The player's AI teammate in a Pair, whichever role they sail.
_it_: Compagno
_Avoid_: Teammate, buddy

**Crew Chemistry**:
A 0–100 rating of how well a Pair works together.
_it_: Intesa
_Avoid_: Compatibility, synergy

**Rival**:
A recurring AI sailor with a name, a personality and a shared history with the player.
_it_: Rivale
_Avoid_: Bot, opponent (for the recurring characters)

**Sailor pool**:
The sailors of one Career: the Rivals and the generated sailors, drawn from the Career seed and kept in the save.
Each Regatta's fleet is drawn from it by level.
_it_: Gruppo di velisti
_Avoid_: Roster (the Rival roster is the three named Rivals)

## Playing

**Role**:
Which sailor the player is in a two-person boat: Helm or Crew.
_it_: Il tuo ruolo
_Avoid_: Position, station (for the player's choice)

**Control mode**:
How much of the boat the player decides: Player Career or Full Boat Control.
_Avoid_: Role (Full Boat Control is not a role)

**Player Career**:
The control mode where the player handles only their own role and the Partner handles the rest.
_it_: (the default; shown by choosing Timoniere or Prodiere)

**Full Boat Control**:
The control mode where the player, as Helm, also calls every manoeuvre and the Crew carries it out.
_it_: Barca completa

**Assist**:
A help the game gives by doing a secondary task for the player; assists can be switched off as the player improves.
_it_: Assist

**Auto-trim**:
The Assist that sets the player's sail trim automatically.
_it_: Regolazione vela automatica
_Avoid_: Auto-sail, auto-sheet

**Auto-hike**:
The Assist that sets the player's own weight (the Helm's or the Crew's, the 49er Helm's trapeze included) as the boat needs it. On by default for the Helm
and Full Boat Control, off for the Crew; toggled in a race with G.
_it_: Peso automatico

## Career

**Career**:
The player's sailing life, played as a sequence of Seasons from a starting age they choose.
_it_: Carriera

**Season**:
One year of a Career: a sequence of Regattas, after which every sailor is a year older.
_it_: Stagione
_Avoid_: Year, campaign

**Class**:
The boat a Season is sailed in: the Optimist, the 420, one ILCA rig, the 29er or the 49er. A Season is in one class;
its standings are the class's own.
_it_: Classe
_Avoid_: Boat (for the class), division

**Class move**:
Choosing another class for the next Season, sideways or back, if the sailor's age allows it. A Pair's Crew Chemistry
goes with the Pair.
_it_: Cambio di classe

**Regatta**:
A set of Races at one venue, scored together into one ranking.
_it_: Regata
_Avoid_: Event, series, regatta for a single race (see Race)

**Zonale**:
The regional championship of the player's zone (Sardinia, FIV III Zona), sailed as four Stages; each Stage is a
Regatta in the Season standings.
_it_: Zonale
_Avoid_: Regional championship as one Regatta

**Stage**:
One Regatta of the Zonale, at its own venue.
_it_: Tappa

**Points**:
A sailor's Regatta score under low-point scoring: a Race place is worth that many points, and OCS or DSQ is
worth the fleet size plus one. Lowest total wins.
_it_: Punti

**Discard**:
A sailor's worst Race score in a Regatta, left out of their total; only Regattas of three Races have one.
_it_: Scarto

**Age limit**:
The oldest age at which a sailor may race a class; after it they must change class (Optimist: 15, the only class
with one so far; not enforced until 1.0).
_it_: Limite di età

## Race

**Race**:
One start-to-finish contest on a course, from the countdown to the last boat finishing.
_it_: Prova
_Avoid_: Match, heat

**Course**:
The start line, the marks to round in order, and the finish line (the start line again: finish upwind through it).
_it_: Percorso (bastone)

**Leg**:
The stretch of a course between one target and the next (start to mark 1, mark 1 to mark 2, mark 2 to finish).
_it_: Lato

**Mark**:
A buoy that boats must round on a set side.
_it_: Boa
_Avoid_: Buoy (in code and docs)

**Committee boat**:
The boat at the starboard end of the start line.
_it_: Barca giuria

**Pin**:
The buoy at the port end of the start line.
_it_: Boa di partenza

**OCS**:
On Course Side: over the start line at the gun; the boat must return below the line before starting.
_it_: OCS
_Avoid_: False start, early start

**Penalty turns**:
Full circles a boat owes after breaking a rule: two for a right-of-way breach, one for touching a mark.
_it_: Giri di penalità

**DSQ**:
Disqualified: a boat that finishes with penalty turns still owed.
_it_: Squalificato (DSQ)

## Sailing

**Tack**:
Turning the bow through the wind; also which side the wind comes from (port tack, starboard tack).
_it_: Virata; mure a sinistra / mure a dritta

**Gybe**:
Turning the stern through the wind.
_it_: Strambata
_Avoid_: Jibe

**Mainsail**, **Jib**, **Spinnaker**:
The boat's sails; the jib, spinnaker and gennaker (see Gennaker) exist only on two-person classes.
_it_: Randa, Fiocco, Spinnaker (spi)

**ILCA**:
The single-handed dinghy (once the Laser), sailed by a Helm alone: one hull, one sail on a sleeve mast, hiked hard. Its
sail comes in three **Rigs**.
_it_: ILCA (Laser)

**Rig**:
The ILCA's sail size, 4, 6 or 7: it sets the sail area and the sailor weight the boat suits (about 53, 68 and 82 kg). A race is
sailed in one rig. The three rigs are one class (see Class).
_it_: Rig (ILCA 4, 6, 7)

**Gennaker**:
The asymmetric downwind sail of a skiff, flown from a bowsprit with no pole. A variant of the spinnaker in the physics (same keys,
Auto-trim and states): it works from a broad reach to about 150° off the wind and is weak dead downwind, so a skiff sails the
run at an angle and gybes.
_it_: Gennaker

**Skiff**:
A fast two-person planing dinghy with a gennaker (the 29er and the 49er). In the 29er the Crew is on the trapeze and the Helm hikes; in the 49er both are on the trapeze, from racks (wings), and the Helm's weight control spans in / hiking / trapeze like the Crew's.
_it_: Skiff

**Sail number**:
The class symbol and number ("ITA 4821") on a boat's mainsail, made up from the Helm's id and the class.
_it_: Numero velico

**Sheet**:
The rope that sets a sail's angle; sheeting in pulls the sail toward the centreline, easing lets it out.
_it_: Scotta (cazzare / lascare)

**Trapeze**:
The wire that lets a sailor stand outside the boat to hold it flat: the Crew's in the 420 and 29er, and both sailors' in
the 49er (where the Helm's hike control spans in / hiking / trapeze).
_it_: Trapezio

**Hiking**:
Leaning out over the side, feet under the straps, to hold the boat flat.
_it_: Uscire in cinghia

**Hike**:
The player's control of their own weight out over the side (Q out, Z in); the verb for what **Hiking** is. The Helm's
hike is `helmOut`, the Crew's is `crewOut`. In the 420 the Helm's lowest step is sitting to leeward; the ILCA's Helm
hikes with no inner seat to limit them.
_it_: Peso fuori / dentro

**Roll tack**:
A tack or gybe where the sailors roll the boat: hiking hard on the new side within about a second of the boom
crossing. It loses less speed, and in very light air gives a small burst; the effect fades above about 10 kn.
_it_: Virata con rollio

**Planing**:
A boat lifting onto its own bow wave and running well above hull speed: the 420 from about 12-13 kn of wind on a reach to
broad reach, flat, with the weight aft; the ILCA from about 9-10 kn, and the skiffs earliest. The HUD shows a Planing tag.
The Optimist only gets a small bow-up gain downwind.
_it_: Planata

**Build**:
A sailor's body shape: light, average or heavy, which scales their body weight by up to 15% either side of the average
for their age. The player picks theirs when starting a Career; an AI sailor's comes from their id.
_it_: Corporatura
