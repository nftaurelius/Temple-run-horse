# Galop! Cross Country Run

Een eindeloze 3D-runner in de stijl van Temple Run, maar dan met paard en ruiter op een cross-country parcours.
Galoppeer over boomstammen, hagen en sloten, buk onder laaghangende takken, plons door waterbakken,
rijd over bruggen langs watervallen en neem de bochten op tijd. Verzamel munten om nieuwe paarden,
ruiters en upgrades vrij te spelen.

Het spel draait volledig in de browser (Three.js, WebGL) en is te installeren op je iPhone als app.

## Spelen

| Actie | iPhone | Computer |
| --- | --- | --- |
| Van baan wisselen | veeg links / rechts | ← → of A D |
| Springen | veeg omhoog | ↑, W of spatie |
| Bukken | veeg omlaag | ↓ of S |
| Bocht nemen | veeg naar de kant van het bord | ← → |
| Pauze | pauzeknop | Esc of P |

### Hindernissen

- **Boomstam, haag, rails, tafel, trakehner**: springen.
- **Sloot met water**: springen, anders val je erin.
- **Laaghangende tak**: bukken.
- **Boom of rotsblok in je baan**: uitwijken naar een andere baan.
- **Hooibalen**: springen of uitwijken.
- **Waterbak**: je kunt erdoorheen, maar je gaat langzamer.
- **Bocht of T-splitsing**: veeg op tijd de goede kant op, anders weigert je paard bij de haag.

### Power-ups

| Power-up | Effect |
| --- | --- |
| Hoefijzer-magneet | trekt munten naar je toe |
| Dubbele munten | elke munt telt dubbel |
| Bodyprotector | beschermt je tegen één botsing |
| Galop-spurt | razendsnel en onkwetsbaar, springt en bukt vanzelf |

Met munten koop je **upgrades** waardoor power-ups langer duren.

### Vermenigvuldigers en voortgang

- Elke **moeilijkheid** heeft een eigen vermenigvuldiger voor score en munten:
  Pony ×1, Ruiter ×1,5, Eventing ×2, Olympisch ×3, Kampioen ×5.
- Moeilijkere niveaus speel je vrij door ver genoeg te komen op het niveau ervoor
  (bijv. 1.000 m op Ruiter voor Eventing).
- Tijdens een rit krijg je elke **500 m een bonus** van +0,25× (tot +2×).
- Aan het einde van een rit worden je munten vermenigvuldigd en bijgeschreven.
- Gevallen? Voor een paar munten kun je **doorgaan** (max. 3 keer per rit).

### Paarden en ruiters

| Paard | Ras | Prijs | Voordeel |
| --- | --- | --- | --- |
| Bruintje | Bruin | gratis | – |
| Vonk | Vos | 750 | +10% munten |
| Zwarte Parel | Fries | 2.000 | springt hoger en langer |
| Zilver | Schimmel | 4.000 | magneet duurt 3 sec langer |
| Goudvos | Palomino | 7.500 | +25% munten |
| Spikkel | Appaloosa | 12.000 | start met een bodyprotector |
| Regenboog | Eenhoorn | 30.000 | +50% munten en start met magneet |

Ruiters (Sam, Noor, Jesse, Lotte, Max en Sir Galop) hebben elk een eigen outfit, helm en zadeldek.

Alles is aan te passen in [`www/js/config.js`](www/js/config.js): prijzen, kleuren, snelheden, vermenigvuldigers.

## Op je iPhone zetten (gratis, zonder App Store)

1. Zet de website online met GitHub Pages (eenmalig):
   ga in deze repository naar **Settings → Pages** en kies bij **Source** voor **GitHub Actions**.
   Daarna publiceert de workflow [`deploy.yml`](.github/workflows/deploy.yml) het spel automatisch bij elke push naar `main`.
   Het adres wordt: `https://nftaurelius.github.io/Temple-run-horse/`
2. Open dat adres op je iPhone in **Safari**.
3. Tik op **Deel** (vierkantje met pijl omhoog) → **Zet op beginscherm** → **Voeg toe**.

Het spel opent dan schermvullend als een eigen app met een icoon, werkt ook offline en bewaart je
voortgang (munten, paarden, upgrades) op je telefoon.

> Geen geluid? Zet de stille modus van je iPhone uit (schakelaar aan de zijkant).

## Een echte App Store-app maken (optioneel)

Hiervoor heb je een **Mac met Xcode** nodig. Om de app op je eigen iPhone te zetten volstaat een gratis
Apple ID; voor publicatie in de App Store heb je een Apple Developer-account nodig (€99 per jaar).
Het project is al voorbereid met [Capacitor](https://capacitorjs.com):

```bash
npm install
npx cap add ios        # maakt de map ios/ aan (eenmalig)
npx cap sync ios       # kopieert www/ naar de iOS-app
npx cap open ios       # opent het project in Xcode
```

In Xcode: kies je iPhone als doel, stel bij **Signing & Capabilities** je team (Apple ID) in en druk op ▶.
Na wijzigingen in `www/` draai je opnieuw `npx cap sync ios`.

## Lokaal ontwikkelen

```bash
npm start              # of: python3 -m http.server 8080 --directory www
```

Open daarna `http://localhost:8080`. Handige URL-opties:

- `?god=1`: onkwetsbaar en automatisch bochten nemen, handig om te testen.

## Projectstructuur

```
www/
  index.html            schermen en HUD
  manifest.webmanifest  app-gegevens voor "Zet op beginscherm"
  sw.js                 offline-cache
  css/style.css         opmaak
  fonts/                lettertypen (Lilita One, Nunito; SIL Open Font License)
  icons/                app-iconen
  js/
    main.js             opstarten
    game.js             spellogica, botsingen, camera
    world.js            eindeloze baan, bochten, hindernissen, landschap
    horse.js            3D-paard met ruiter en animaties
    ui.js               menu, stal, ruiters, upgrades, instellingen
    config.js           paarden, ruiters, moeilijkheden, prijzen
    audio.js            gesynthetiseerde geluiden en muziek
    input.js            vegen en toetsenbord
    save.js             voortgang opslaan
    textures.js, geo.js, effects.js
    lib/three.module.min.js   Three.js r170 (MIT)
capacitor.config.json   instellingen voor de iOS-app
```

Alle 3D-modellen, textures en geluiden worden in code gegenereerd; er zijn geen externe assets nodig.
