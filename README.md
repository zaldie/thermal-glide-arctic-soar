# Thermal Glide: Arctic Soar

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/zaldie/thermal-glide-arctic-soar/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/zaldie/thermal-glide-arctic-soar/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An original glider flight game for make.fun's "Make the best flight game"
bounty, $500 in USDC. You pilot the Kestrel, an engineless glider, over the
fictional Svarra Archipelago: a winding fjord, snow peaks, a fishing village
and an ice runway. There is no throttle and no fuel — height is your fuel
tank, speed is how you spend it, and the only way back up is a thermal.
Speed is not free either: past the placard speed, or in steep turns flown
fast, the airframe accumulates stress — watch the STRUCT bar — and a spar
pushed past its limit fails in the air. The mail run is flown for real,
too: release over Port Svarra and the parcel falls under its own canopy
while you turn for the strip.

## The signature: a Living Sky

Thermals are born over surfaces the low arctic sun can warm — dark fjord
water, exposed rock, village roofs — then drift with the wind, strengthen,
and die. You read them the way real glider pilots do: spirals of snow,
circling gulls, and a variometer whose beeps quicken as the lift strengthens.
The day slides from golden afternoon through blue dusk into aurora night,
the thermals fade as the light goes, and a snow squall marches across the
map carrying a downdraft you can see coming.

## Six sorties, plus Free Soar

1. **First Glide** — three rings, one gentle thermal, then home.
2. **Fjord Run** — six rings down the winding fjord in a crosswind.
3. **Supply Drop** — carry the mail to Port Svarra, release it over the
   drop circle from a safe height, then land.
4. **Storm Line** — five rings before the squall eats the route.
5. **Aurora Run** — night flight, lit rings, a landing judged to the metre.
6. **Dead Calm** — dusk with the sky asleep: almost no lift anywhere, so
   four low rings must be flown on one tank of height, spent carefully.

Every sortie flies in its own weather — the wind differs from mission to
mission, and the HUD's wind arrow is worth reading before the approach.

Stars, best scores and a mid-sortie Continue are saved in the browser
(localStorage). Landings are judged honestly: sink rate, touchdown speed,
bank and heading all count, and every crash names its cause.

## Controls

- **Mouse** — the stick: pull toward you to climb, push to dive, slide to bank
- **W/S or ↑/↓** — pitch · **A/D or ←/→** — bank
- **Shift / B** — airbrake · **X** — drop the mail · **C** — cockpit/chase camera
- **P** — pause · **Esc** — pause / quit to menu · **Enter** — select

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no installs, no network.
The game is plain static files under `game/`; `main.ts` (Node 22) copies
`game/` and `screenshots/` to the output directory and writes the dossier
the judge reads:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Structure

Every source file has one job, named for it: `terrainSvarra.js` (the
heightmap and landmarks), `gliderPhysics.js` (the energy flight model),
`thermalSky.js` (the Living Sky), `missions.js` (the sorties as data),
`glMath.js` (matrices), `glMesh.js` (geometry builders), `glShaders.js`
(the shader sources), `aircraftMesh.js` (the airframe, control surfaces
included), `worldScenery.js` (forest, village, boats, runway, lighthouse),
`renderWorld.js` (the painter), `hud.js` (instruments and screens),
`inputPilot.js`, `audioVariometer.js` (synthesized variometer, wind and
chimes — no audio files), `saveGame.js`, and `shots.js` (the deterministic
screenshot scenes). No libraries: everything is hand-written JavaScript,
which keeps the entry small and entirely our own work.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
