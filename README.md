# Goal Horn

Goal Horn plays your team's goal horn when they score. It runs on one computer and can play the horn on that computer and on any phone, tablet, TV or other computer in the house that's on the same Wi-Fi.

It follows NHL, AHL, PWHL, MLB and NFL teams. The horn goes off by itself when your team scores, and you can hold the scoreboard back to match your TV so the horn doesn't go off before you see the goal.

Download it at **[goalhorn.colbykordas.com](https://goalhorn.colbykordas.com)**.

## Getting started

1. Download Goal Horn for Windows or Mac and open the installer.
2. Pick your team.
3. To add a speaker, click **Speakers** and scan the code with a phone or tablet camera, or type the address into a TV's or computer's browser. Tap **Turn on sound** on that device.

That's it. When your team scores, every speaker plays the horn.

### The first time you open it

Goal Horn isn't signed with a paid developer certificate yet, so your computer will warn you once.

- **Windows:** if you see "Windows protected your PC", click **More info**, then **Run anyway**. When Windows asks whether Goal Horn can use the network, allow it on private networks. Speakers can't connect without that.
- **Mac:** if the Mac says Goal Horn can't be opened, open **System Settings > Privacy & Security**, scroll down, and click **Open Anyway** next to Goal Horn.

### Matching your TV

TV broadcasts run 20 to 60 seconds behind the live game, and streaming apps run further behind. Open **Settings** and move **TV delay** until the scoreboard changes at the same moment as your TV. The horn uses the same delay.

### Speakers

- Any browser works: phones, tablets, smart TVs, laptops, a spare computer by the stereo.
- Each speaker needs one tap on **Turn on sound**. Browsers don't let a page make sound until someone taps it once.
- Phones stop listening when the screen locks. Plug the phone in and leave the speaker page open; Goal Horn asks the phone to keep the screen on.
- Name each speaker so you can tell them apart in the **Speakers** list, and use **Test** to check one.
- The control page works from a phone too. Open the address without `/speaker` at the end to get the horn button and settings.

### Horn sounds

Goal Horn downloads your team's horn from the horn library when there is one, and uses a built-in horn when there isn't. To use your own sound, open **Settings > Horn sounds** and upload an MP3. Your upload stays on your computer and is used for that team only. **Remove** goes back to the library horn.

### When the horn sounds

| League | Horn | Plays automatically when |
|---|---|---|
| NHL, AHL, PWHL | Goal horn | your team scores a goal |
| MLB | Run horn | your team scores a run |
| NFL | Touchdown horn | your team scores a touchdown (field goals and extra points don't sound it) |

The win horn plays when the game ends and your team won. You can turn either one off in Settings, and you can always press the button yourself.

Scores for AHL and PWHL games come from a schedule feed that updates less often than the NHL's, so the horn can lag a little.

## Running it without a screen

On a Raspberry Pi or home server, Goal Horn can run without a window and play through that machine's speakers.

```
docker run -d --name goal-horn --network host --device /dev/snd \
  -v goal-horn-data:/data ghcr.io/cwk01/goal-horn
```

Or with Node.js 20 or newer and `mpg123` installed:

```
npm ci --omit=dev
npm run server
```

It prints the control and speaker addresses when it starts.

## The horn library

The default library is `https://horns.colbykordas.com`. Files are laid out as:

```
/<LEAGUE>/<TEAM>/goal.mp3      /NHL/BOS/goal.mp3
/<LEAGUE>/<TEAM>/win.mp3       /NFL/NE/win.mp3
/_generic/<sport>/goal.mp3     sport is hockey, baseball or football
/_generic/<sport>/win.mp3
```

Team codes match the ones in [`src/shared/teams.js`](src/shared/teams.js). You can host your own library on any web server or storage bucket with that layout and set its address under **Settings > Advanced**.

Team horns and songs belong to the teams and their composers. Goal Horn only plays files; the built-in horns in `src/assets` are original sounds made for this project.

## Where things are kept

Settings, downloaded horns and your uploads live in the app's data folder:

- Windows: `%APPDATA%\Goal Horn\data`
- Mac: `~/Library/Application Support/Goal Horn/data`
- Linux: `~/.config/Goal Horn/data`
- Headless: `~/.goal-horn`, or `/data` in Docker

**Settings > Advanced > Edit files** opens `settings.json` and `custom.css` right in the app. `custom.css` lets you restyle the pages.

## For developers

```
npm install
npm start          # desktop app
npm run server     # headless server
npm test           # end-to-end test with fake games, no network needed
node test/demo.js nhl   # serve fake games at http://localhost:8790 for UI work
```

Layout:

- `src/main.js`: desktop app (Electron): window, tray, keeps the computer awake during games
- `src/server/`: HTTP server, live channel for speakers, horn library, settings
- `src/server/leagues/`: one adapter per league, each returning the same game shape
- `src/server/tracker.js`: polls the game, applies the TV delay, decides when to sound the horn
- `src/web/`: control page and speaker page
- `site/`: the download page

Releases build on GitHub Actions when you push a tag like `v1.0.1`. The workflow takes optional signing secrets (`WIN_CSC_LINK`, `MAC_CSC_LINK`, `APPLE_ID` and friends) and builds unsigned installers without them.

Data sources: [api-web.nhle.com](https://api-web.nhle.com) for the NHL, HockeyTech for the AHL and PWHL, [statsapi.mlb.com](https://statsapi.mlb.com) for MLB, and ESPN's public scoreboard for the NFL. None of them need a key, and any of them can change without notice; when a league's data stops loading, its adapter in `src/server/leagues/` is the place to look.

## License

MIT. See [LICENSE](LICENSE). The bundled fonts are under the SIL Open Font License; see `src/assets/fonts/OFL.txt`.
