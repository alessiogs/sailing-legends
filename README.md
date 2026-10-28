# Sailing Legends — Prototipo 0.4 (Optimist e 420)

Prototipo browser-first in Babylon.js + TypeScript + Vite. Una regata completa in Optimist contro tre
rivali IA (Luca, Giulia, Marco) con fisica velica semplificata ma "vera": vento apparente, angolo
morto, portanza/resistenza della vela, inerzia, scarroccio, virate e strambate.

## Avvio
```bash
npm install
npm run dev        # apri l'indirizzo mostrato da Vite (di solito http://localhost:5173)
npm run build      # versione ottimizzata in dist/
```
Requisiti: Node.js 20+, browser desktop con WebGL 2.

## Test e pubblicazione
- `npm test`: simula senza browser regate solo IA in Optimist e 420 (vento leggero, medio, forte) e controlla
  che tutte arrivino e che le penalità vengano scontate.
- Ogni push su `main` esegue la GitHub Action `.github/workflows/deploy.yml`: installa, lancia i test,
  controlla i tipi, compila e pubblica `dist/` su GitHub Pages. Le pull request vengono solo compilate e testate.

## Comandi
| Tastiera | Gamepad | Azione |
|---|---|---|
| A / D, ← / → (Shift = fine) | Stick sinistro | Barra del timone (vedi sotto) |
| W / ↑ | RT | Cazza la scotta |
| S / ↓ | LT | Lasca la scotta |
| T | X | Regolazione vela automatica (assist) |
| C | Y | Camera: inseguimento / libera / tattica |
| P / Esc | Start | Pausa |
| R | Back | Nuova regata |
| M / H | — | Menu |
| K | — | Menu Comandi |
| V | — | Audio on/off |

**Menu Comandi (K, oppure dal menu o dalla pausa):**
- *Muovi la barra* (predefinito, realistico): → sposta la barra a destra e la barca gira a sinistra, come su un vero Optimist.
- *Direzione della barca*: → fa girare la barca a destra.
- Ritorno automatico della barra al centro oppure barra che resta dove la lasci; velocità di barra e scotta.
Le impostazioni vengono ricordate nel browser.

## La regata
Percorso a bastone: partenza (45 s di procedura) → **Boa 1** di bolina → **Boa 2** di poppa → **arrivo**
di bolina. Le boe si lasciano a sinistra. Se sei sopra la linea allo sparo sei **OCS**: devi tornare sotto
la linea e ripartire. Le zone d'acqua più scure e increspate sono raffiche (più vento, direzione diversa).

## Novità della 0.4: il 420
- **Nuova barca**: 420 con randa, fiocco, spinnaker e trapezio (`I420` in `src/sailing/BoatClass.ts`).
  La fisica gestisce più vele: il fiocco e lo spi devono stare sottovento (dopo virate e strambate il prodiere
  li porta dall'altra parte, altrimenti il fiocco è "a collo"), lo spi rende solo con il vento al giardinetto
  o in poppa, il peso dell'equipaggio (dentro, in cinghia, al trapezio) deve stare sopravvento e bilanciare
  la barca: troppo poco = sbanda e perde potenza, troppo = sbanda sopravvento e rallenta.
- **Tre ruoli** (menu → Barca 420):
  - *Timoniere*: timone e randa; il prodiere IA fa il resto e decide quando issare lo spi.
  - *Prodiere*: il partner timona; tu W/S fiocco o spi, A/D peso dentro/fuori fino al trapezio,
    E cambio lato, Spazio issa/ammaina. Il partner ti chiama le manovre ("Vira!", "Cambia lato!", "Issa lo spi!").
  - *Barca completa*: timone e randa, e chiami tu lo spi (Spazio); il prodiere esegue.
- **Scegli il compagno tra i rivali dell'Optimist** (Luca, Giulia, Marco). **Crew Chemistry** (intesa 0–100)
  da storia comune, tecnica e affidabilità: più intesa = reazioni più rapide e regolazioni più precise.
- Gli avversari in 420 sono equipaggi IA completi (timoniere + prodiere), percorso più lungo e linea più ampia.

## Novità della 0.3
- **Barra del timone realistica** con indicatore nell'HUD; modalità arcade opzionale.
- **Regole di precedenza** (`src/race/Rules.ts`), valutate al contatto tra gli scafi:
  regola 10 (mure a sinistra dà acqua a mure a dritta), 11 (sopravvento dà acqua a sottovento),
  12 (chi è libero dietro dà acqua), 13 (chi sta virando dà acqua), 31 (toccare una boa del lato in corso
  o le boe di partenza). Penalità: 2 giri (720°) per le regole 10–13, 1 giro per la 31, da fare nello stesso
  verso; l'HUD mostra l'avanzamento. Chi arriva senza averla scontata è squalificato (DSQ).
- **IA rispettosa delle regole**: passa a poppa delle barche con diritto di rotta, orza se è sopravvento,
  rallenta se arriva da dietro, non vira addosso agli altri e sconta le proprie penalità.
- **Partenze IA migliori**: le barche partono già in posizione d'attesa e cronometrano la corsa alla linea.
- **Audio sintetizzato** (`src/core/Sound.ts`): vento, acqua, vela che sbatte, segnali di partenza,
  boa girata, penalità, urti.
- Scafi con forma a capsula per i contatti (non più cerchi); boa di poppa spostata sotto la linea di partenza.

## Cosa c'è di nuovo rispetto alla 0.1
- **Fisica velica** (`src/sailing/BoatPhysics.ts`): vento reale + velocità barca → vento apparente; la
  scotta limita l'angolo del boma; l'angolo d'incidenza dà portanza e resistenza (la vela *sventa* se
  lascata troppo, *stalla* se cazzata troppo); nessuna spinta sotto ~40° dal vento; resistenza dello scafo
  con "muro" della velocità critica; scarroccio contrastato dalla deriva (peggiore a bassa velocità);
  timone efficace solo con velocità; le virate costano velocità; in raffica la barca sbanda e scarica.
- **Vento** (`src/sailing/Wind.ts`): oscillazioni di direzione + raffiche che scendono il campo.
- **Regole di regata** (`src/race/`): procedura di partenza, OCS, giro boa (verso corretto), arrivo, classifica.
- **IA** (`src/ai/RacingAI.ts`): tiene posizione e cronometra la partenza, risale di bolina scegliendo il bordo
  migliore (vira sui salti di vento), gira le boe dal lato giusto. Ogni rivale ha un profilo
  (tecnica, tattica, velocità, disciplina): Marco, poco disciplinato, a volte parte in anticipo.
- **Mare su GPU** (`src/world/Ocean.ts`): onde di Gerstner nel vertex shader, riflesso del cielo, raffiche
  visibili sull'acqua. La CPU non aggiorna più la griglia; le barche usano la stessa funzione d'onda.
- **Grafica barca** (`src/world/BoatView.ts`): scafo a pram, armo a tarchia, vela con grasso, svergolamento e
  fileggiamento, timoniere che esce fuori bordo, sbandamento e beccheggio sulle onde, segnavento in testa d'albero.
- **HUD**: barra di regolazione vela con zona ottimale, bussola del vento (angolo morto, bolina ottimale, direzione
  boa), indicatore di salto di vento favorevole/contrario, mini-mappa con raffiche e lay-line, classifica live.

## Architettura
```
src/
├── core/        math.ts (angoli, RNG), Input.ts (tastiera + gamepad)
├── sailing/     BoatClass.ts (dati di classe), BoatPhysics.ts, Wind.ts
├── race/        Course.ts, Race.ts (regole), RaceSession.ts (simulazione a passo fisso, senza grafica)
├── ai/          RacingAI.ts (timoniere), CrewAI.ts (prodiere e Crew Chemistry)
├── world/       Ocean.ts, Waves.ts, BoatView.ts (Optimist), Boat420View.ts, SailMesh.ts, CourseView.ts
├── ui/          Hud.ts
└── main.ts      scena, camera, ciclo di gioco
```
La simulazione (`sailing/`, `race/`, `ai/`) non dipende da Babylon: gira a 60 Hz fissi e si può testare
in Node senza browser. Una nuova classe (ILCA, 420…) parte da una nuova voce in `BoatClass.ts`.

## Limiti noti
- Modello fisico tarato a sensazione, non validato su dati reali. Optimist a 11 nodi: ~2,3 kn di bolina,
  ~3,9 kn al traverso, ~3,5 kn in poppa.
- Regole semplificate: niente spazio alla boa (regola 18), né regola 16; le infrazioni contano solo se c'è contatto.
- Le partenze dell'IA sono ancora a volte in ritardo (tipicamente 0–15 s); nessuna tattica di copertura.
- In poco vento l'IA a volte fatica a evitare le barche con diritto di rotta e prende penalità.
- `window.__game` espone ganci di debug (autopilota, avanti veloce) usati per i test automatici.
