# Sailing Legends

A dinghy-racing career game. English is the reference language for code and docs; each term shows its
Italian in-game label (_it_) as a reference for translators.

## Sailors

**Helm**:
The sailor who steers and trims the mainsail.
_it_: Timoniere
_Avoid_: Skipper, driver

**Crew**:
The sailor in a two-person boat who trims the jib and spinnaker and moves their weight to hold the boat flat.
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

## Career

**Career**:
The player's sailing life, played as a sequence of Seasons from a starting age they choose.
_it_: Carriera

**Season**:
One year of a Career: a sequence of Regattas, after which every sailor is a year older.
_it_: Stagione
_Avoid_: Year, campaign

**Regatta**:
A set of Races at one venue, scored together into one ranking.
_it_: Regata
_Avoid_: Event, series, regatta for a single race (see Race)

**Points**:
A sailor's Regatta score under low-point scoring: a Race place is worth that many points, and OCS or DSQ is
worth the fleet size plus one. Lowest total wins.
_it_: Punti

**Discard**:
A sailor's worst Race score in a Regatta, left out of their total once enough Races are sailed.
_it_: Scarto

**Age limit**:
The oldest age at which a sailor may race a class; after it they must change class (Optimist: 15).
_it_: Limite di età

## Race

**Race**:
One start-to-finish contest on a course, from the countdown to the last boat finishing.
_it_: Prova
_Avoid_: Match, heat

**Course**:
The start line, the marks to round in order, and the finish line.
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
The boat's sails; the jib and spinnaker exist only on two-person classes.
_it_: Randa, Fiocco, Spinnaker (spi)

**Sheet**:
The rope that sets a sail's angle; sheeting in pulls the sail toward the centreline, easing lets it out.
_it_: Scotta (cazzare / lascare)

**Trapeze**:
The wire that lets the crew stand outside the boat to hold it flat.
_it_: Trapezio

**Hiking**:
Leaning out over the side, feet under the straps, to hold the boat flat.
_it_: Uscire in cinghia
