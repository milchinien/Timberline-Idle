# Spieleidee: Timberline Idle

> Offizieller Titel (festgelegt 2026-10-09). Der frühere Arbeitstitel war „Holzfäller-Idle“.
> Die Speicher-Schlüssel (`lumberjack-idle-*`) behalten den alten Namen, damit bestehende Spielstände erhalten bleiben.

> Erste Ideensammlung, Stand 2026-10-07. Alles hier ist ein Entwurf und kann sich ändern.
> Skill-Tree-Inhalte (konkrete Upgrades) werden **nicht** von der KI vorgegeben, sondern vom Auftraggeber geliefert.

## 1. Kurzbeschreibung

Ein Idle-/Management-Spiel im Browser: Auf einer kleinen Wiese fällen Worker Bäume, tragen das Holz in eine Truhe in der Mitte und pflanzen Setzlinge nach. Mit dem Holz bzw. Geld erweitert man die Wiese, stellt Worker ein, kauft Skills und verarbeitet Holz später zu Brettern. Der Spieler kann selbst mitklicken.

## 1b. Sprache, Speichern, Einstieg

- **Das Spiel ist komplett auf Englisch** (Code-Kommentare und dieses Dokument bleiben Deutsch).
- **Speichern:** Autosave im Browser (localStorage) alle 5 s, beim Schließen und beim Tab-Wechsel. Gespeichert werden Geld, Truhe, Skills, Böden, Land, Tag/Uhrzeit, Bäume (Feld, Phase, Wachstum) und liegende Items. Spielstände haben eine Version; ältere werden beim Laden schrittweise umgebaut (`migrate` in `src/save.js`).
- **Einstellungen** (⚙️ oben rechts): zurück ins Hauptmenü (speichert vorher), Ton an/aus und Lautstärke, Spielstand exportieren/importieren (Text zum Kopieren), neu anfangen im selben Slot (mit Rückfrage).
- **Hauptmenü** (umgesetzt 2026-10-09, `src/menu.js`, `src/menu.css`): erscheint bei jedem Seitenaufruf. Links ein hängendes Titelschild und Holzplanken-Knöpfe **Play · Settings · Achievements · Credits**, dahinter eine lebendige Demo-Wiese (2 Worker, Bäume, Kunden, die ab und zu beliefert werden; wird nicht gespeichert, Ton gedämpft).
  - **Play:** 3 Holzpaneele = 3 Speicherstände (`lumberjack-idle-slot-1..3`). Belegt: Tag, Coins, Worker, Ruf, Landgröße, Skills, Spielzeit, „zuletzt gespielt“, *Continue* und *Delete* (zweimal klicken). Leer: Setzling, „Empty slot“, Häkchen **Tutorial** (standardmäßig an) und *New game*. Beim ersten Spielen sind alle drei leer – man wählt einen.
  - Start eines Slots: kurzes Abblenden, die Seite lädt neu und startet direkt das Spiel in diesem Slot (inkl. Offline-Fortschritt). Der alte Einzel-Spielstand wird einmalig nach Slot 1 übernommen.
  - **Settings:** Ton und Lautstärke; alle Spielstände und Achievements löschen (zweimal klicken).
  - **Achievements** (`src/achievements.js`): 21 Stück, gelten für alle Spielstände (eigener Speicher, Zähler wie gefällte Bäume laufen über alle Slots). Im Spiel schwingt beim Freischalten ein Holzschild oben in der Mitte herunter.
  - Dev: `?menu=play` öffnet das Menü mit einem Panel, `?reset` löscht alle Slots.
- **Tutorial beim ersten Start:** alles abgedunkelt, nur das Ziel leuchtet; kurze Texte + viele Symbole, zeigende Hand, Fortschrittspunkte.
  1. 🪓 Baum fällen – der erste Baum gibt **nur 1 Stamm**
  2. 🪵 Holz einsammeln
  3. 📦 Truhe öffnen
  4. 🪙 Alles verkaufen (= genau 1 Coin)
  5. ⬆️ Erstes Upgrade kaufen: **Bigger Haul** (+1 Stamm, einmalig, kostet 1 Coin)
  Danach freies Spiel. Während des Tutorials ist nur das jeweilige Ziel klickbar.
- **Danach nur noch kurze Hinweise bei Ereignissen** (je einmal): neue Tabs freigeschaltet, erster Setzling, Truhe voll.
- **Freischaltungen über einmalige Upgrades:** Start nur mit den Tabs **Plots** und **Chest**. *First Hut* (Worker-Tree) → erster Worker-Platz + **Board & Team**. *Workshop* (Economy-Tree) → **Build**.
- Ein Baum gibt zu Beginn **2 Stämme** (vorher 4).

## 2. Technik & Optik

| Thema | Entscheidung |
|---|---|
| Plattform | Browser |
| Engine | **Three.js** (3D-Welt) |
| Grafik | 3D-Welt mit **2D-Pixel-Art-Texturen** (Sprites/Billboards für Bäume, Worker, Truhe) |
| Kamera | **Isometrisch / schräg von oben**, feste Ansicht |
| UI-Stil | Durchgehend **Holz-Look**: Baumstämme, Planken, Nägel, Holzschilder |
| Speichern | Auto-Save im Browser (LocalStorage) |
| Offline | Begrenzter Offline-Fortschritt bis zu einem Zeit-Cap (upgradebar), siehe 7e |

## 3. Die Welt

- **Flache Wiese**, zu Beginn klein, außen von **Nebel** umgeben.
- **Truhe in der Mitte**, öffnet und schließt sich, wenn Holz eingelagert wird.
- Start: **1–2 Pixel-Art-Bäume**.
- Der Nebel weicht zurück, sobald neue Plots gekauft werden.
- Tag-und-Nacht-System (siehe 7. Zeit).

### Plots (umgesetzt 2026-10-09, Daten in `src/land.js`)
- Ein Plot ist **3×3 Felder** groß. Start mit **3×3 Plots** (= 9×9 Felder), die Truhe steht in der Mitte.
- Gekauft wird **immer eine ganze Plot-Reihe** an einer Seite (so breit wie das Land dort gerade ist) – im Tab „Plots“ über eine um 45° gedrehte Karte (passend zur Kamera) oder vier Knöpfe ↖ ↗ ↙ ↘.
- Höchstens **2 Reihen je Seite** → Land maximal 7×7 Plots (21×21 Felder).
- **Preis:** 150 Coins pro Plot der Reihe × 2,1^(bereits gekaufte Reihen). Erste Reihe 450, dann ~1.260, ~2.650, ~7.000 … bis ~180.000 für die achte.
- Jede Reihe gibt **+1 Baumbeet** (siehe 7c).
- Beim Kauf ist die Wiese sofort da, der **Nebel weicht** in einer kurzen Animation zurück, die Kamera gleitet zur neuen Mitte und zoomt etwas heraus. Neue Fläche bekommt Deko (Gras, Blumen, Steine), der Waldrand im Nebel wird neu gesetzt.
- **Kamera ziehen:** linke Maustaste auf freiem Boden oder mittlere Maustaste; das Mausrad zoomt (bei großem Land weiter heraus).
- Feld-Koordinaten bleiben stabil: das Startland sind die Felder 0..8, Reihen im Norden/Westen bekommen negative Indizes.

### Grid-System
- Die ganze Wiese ist ein **Raster aus Feldern**: 3×3 Plots à 3×3 Felder = 9×9 Felder. **Ein Feld = ein Baum.**
- **Alles wird auf Feldern platziert:** Bäume, Setzlinge, Böden und später Gebäude (Gebäude können mehrere Felder belegen, z. B. Sägewerk 2×2).
- **Ausnahme: die Truhe** steht frei in der Mitte (ihr Feld ist blockiert).
- **Platzier-Modus:** Gitter wird eingeblendet, Vorschau folgt der Maus, Feld leuchtet grün (frei) oder rot (belegt). Linksklick platziert, Rechtsklick/ESC beendet. Bei mehreren Stück (z. B. Setzlinge) bleibt der Modus aktiv.
- **Böden** liegen unter Bäumen und wirken auf den Baum ihres Feldes. Erste Bodenart: **Nährreiche Erde** (Baum wächst 50 % schneller, Preis steigt mit jedem gelegten Feld).

## 4. Spielschleife (Core Loop)

1. Worker (oder der Spieler) **fällt einen Baum** → Holz fällt an.
2. Holz wird **zur Truhe getragen** (bis zur Tragekapazität des Workers).
3. Holz liegt in der Truhe, bis zum **Truhen-Cap** (upgradebar).
4. Beim Fällen gibt es eine **Chance auf Setzlinge**; Setzlinge können zusätzlich **gekauft** werden.
5. Worker holen **Setzlinge aus der Truhe** und pflanzen sie **zufällig** auf der Wiese.
6. Setzlinge wachsen zu Bäumen heran → zurück zu Schritt 1.
7. Holz wird **verkauft** → Geld → Plots, Worker, Skills.
8. Später: Holz zu **Brettern** verarbeiten für mehr Geld.

## 5. Spieler-Interaktion (Klicken)

- Der Spieler **klickt direkt auf einen Baum** und fällt ihn selbst per Schlägen.
- Der Spieler kann auch **einzeln auf die Truhe klicken**, um Holz einzulagern (Alternative zum Tragen durch Worker).
- Der Klick hat eigene Stats und wird über einen eigenen Skill Tree (Klicker-Tree) verbessert.

## 6. Worker („Mitarbeiter“)

### Attribute (4 Stück, farbcodiert)
| Farbe | Attribut | Wirkung |
|---|---|---|
| Blau | Laufgeschwindigkeit | Wegzeit zu Baum/Truhe |
| Gelb | Schwunggeschwindigkeit | Schläge pro Zeit |
| Rot | Kraft | Schaden pro Schlag |
| Grün | Tragekapazität | Holzmenge pro Transport |

### Charaktereigenschaften (Perks)
- Jeder Worker hat **1–3 Eigenschaften**.
- Eigenschaften können **positiv UND negativ** sein (z. B. „Faul: weniger Tempo, mehr Kraft“).
- Jede Eigenschaft hat **2–3 Ausprägungsstufen**.
- Eigenschaften und Worker haben **4 Seltenheitsstufen** (z. B. Gewöhnlich, Selten, Episch, Legendär) – je höher, desto seltener.
- Worker sollen dadurch **ikonisch** wirken (Name, Aussehen, Eigenschaften).

### Leveln
- Worker können **leveln**, wodurch ihre Attribute steigen – bis zu einem **Cap**.

### Verhalten
- **Alle Worker machen alles** (Fällen, Tragen, Pflanzen) – per KI.
- Im Management kann pro Worker eine **Prioritätenliste** gesetzt werden (z. B. erst pflanzen, dann fällen).

### Anheuern: Das Worker-Board
- Ein **Schwarzes Brett** mit **Zetteln**: Auf jedem Zettel steht ein Worker mit Attributen und Eigenschaften.
- Bessere Worker sind **teurer** in der Anstellung **und im Lohn**.
- Mit jedem eingestellten Worker werden **neue Worker teurer**.
- Es gibt ein **Worker-Cap** (maximale Anzahl), das im Skill Tree erhöht werden kann.
- Das Brett hat eine feste Zettelzahl; **jeden Ingame-Tag** werden einige Zettel durch neue ersetzt.
- Gegen Geld kann das Brett vorzeitig **neu gemischt (Reroll)** werden.
- **Upgrades** (Skill Tree): mehr Zettel am Brett, bessere Seltenheitschancen.

### Management-Ansicht
- Liste der eigenen Worker mit Stats, Eigenschaften, Level.
- Prioritäten festlegen, Worker leveln, Worker **feuern**.

### Worker-System (umgesetzt, Stand 2026-10-08) – angelehnt an „Tiny Terraces“
- **Aussehen:** kleine, rein weiße Pixel-Figuren ohne Kleidung (später evtl. Hut): großer runder Kopf, kleiner Körper, Strich-Arme. Tragen Dinge mit hochgestreckten Armen über dem Kopf.
- **Aufgaben-KI:** Jeder Worker sucht sich nach seiner Prioritätenliste eine freie Aufgabe, **reserviert** sie, läuft hin und führt sie aus:
  - **Chop** – Baum mit kleiner Axt fällen (Schwung = Gelb, Schaden = Rot)
  - **Carry** – Scheite einsammeln (mehrere je nach Grün), über dem Kopf zur Truhe tragen, hineinwerfen
  - **Plant** – Spieler setzt nur eine **Setzling-Markierung** auf ein freies Feld; der Worker holt den Setzling an der Truhe, trägt ihn hin, gräbt und pflanzt (Zustand: Markiert → Setzling → Wächst → Gewachsen → Gefällt)
- **Animationen:** Laufzyklus, Atmen, Tragen, Ausholen/Zuschlagen/Zurückfedern, Graben, Aufheben, Jubel-Hüpfer, Winken, „!“-/Herz-Blasen, Staub bei Schritten, Stauchen beim Landen. Neue Worker laufen aus dem Nebel herein, gefeuerte winken und gehen.
- **Board:** 3 Zettel mit Kandidaten (Seltenheit Common/Rare/Epic/Legendary, 4 Werte 1–10, Preis). Neue Zettel jeden Ingame-Tag oder per 🎲 (10 Coins). Jeder eingestellte Worker macht neue teurer.
- **Team:** Liste mit aktueller Tätigkeit, Werten, Prioritäten (Klick = nach vorne) und Feuern (mit Rückfrage).
- **Lohn:** Jeder Worker kostet einen Tageslohn (Seltenheit, Werte, Level, Eigenschaften). **Zahltag jeden Morgen um 06:00.** Reicht das Geld nicht, geht man ins Minus; solange man im Minus ist, werden **25 % jedes Verkaufs und jeder Auftragsbezahlung gepfändet**. Die Coins-Anzeige wird rot. In den 4 Stunden vor dem Zahltag pulsiert das Münz-Schild rot, wenn das Geld nicht für den Lohn reicht (einmaliger Hinweis beim ersten Mal).
- **Charaktereigenschaften:** 0–3 pro Worker (bessere Seltenheit = mehr und eher positive, höhere Stufen I–III). Positiv: Strong, Quick, Rhythmic, Packhorse, Green Thumb, Frugal, Night Owl, Early Bird, Lucky, Fast Learner. Negativ: Lazy (macht Nickerchen), Clumsy (lässt Scheite fallen), Weak, Greedy, Afraid of Dark. Tag/Nacht-Eigenschaften ermöglichen Builds.
- **Leveln:** Erfahrung durch Arbeit (Treffer, Fällen, Abliefern, Pflanzen). Level-Up bis Level 10: +1 auf einen Wert (bei Level 5 und 10: +2), goldener Funkenregen und „LEVEL X!“.
- **Hinweise:** wenn man sich die erste Hütte leisten kann (→ Workers-Tree), erster Worker, erster Zahltag, erstes Minus, erstes Level-Up.
- **Noch offen:** Schichten (Tag/Nacht-Zuweisung), Level-Cap-Upgrade, Hüte.

## 7. Zeit, Tag/Nacht & Lohn

- Es gibt eine **Ingame-Zeit** mit **Tag-und-Nacht-System** (Tage zählen).
- Ein Ingame-Tag dauert bei x1 ca. **5 Minuten** Echtzeit.
- **Alle X Tage** kosten Worker **Lohn** (Geld).
- Spielgeschwindigkeit: **x1, x2, x4** (Vorspulen).
- Lohnhöhe hängt von der Qualität des Workers ab.
- **Nicht genug Geld:** Man geht **ins Minus**. Im Minus wird ein Teil jedes Holzverkaufs automatisch für die Schulden **einbehalten (Pfändung)**, der Verkaufspreis sinkt effektiv.

### Tag und Nacht als Build-Mechanik
Das Tag-/Nacht-System soll **verschiedene Spielstile (Builds)** ermöglichen:
- **Tag-Worker vs. Nacht-Worker:** Eigenschaften wie „Nachteule“ oder „Frühaufsteher“ – man baut ein Team für Tag, Nacht oder gemischt.
- **Nacht-Skills im Skill Tree:** Skills, die nur nachts (oder nur tagsüber) wirken.
- **Tag-/Nacht-spezifische Bäume:** Manche Holzarten wachsen oder geben Bonus nur nachts bzw. tagsüber.
- **Schichtsystem im Management:** Worker bekommen Tag- oder Nachtschicht zugewiesen, Überstunden kosten extra.

## 7b. Gebäude-Tab (5. Tab links: „Bauen“)
- Hier kauft man **Böden** und **Gebäude** und platziert sie im Grid.
- Böden: Nährreiche Erde (kaufbar). Bezahlt wird erst beim Platzieren.
- Gebäude (umgesetzt 2026-10-08, Daten in `src/buildings.js`):
  - **Sägewerk** (2×2, ab Ruf 2, 200 · ×3 je weiteres): macht aus Stämmen Bretter derselben Holzart (~×2,5 Wert). Eingangs- und Ausgangspuffer, 3 Ausbaustufen (3 s → 2,1 s → 1,5 s pro Brett; 12/20/30 Plätze). Filter „nimmt an: alle / Eiche / Birke / Kiefer“. Klick aufs Sägewerk öffnet sein Fenster (Stämme einladen, Bretter in die Truhe, Ausbau).
  - Worker-Aufgabe **🪚 Sawmill**: holt passende Stämme aus der Truhe, bringt sie hin und nimmt fertige Bretter mit zurück.
  - **Bewässerung** (1 Feld, beim Platzieren mit **R** drehen): bewässert die Nachbarfelder in Richtung ihrer Anschlüsse. Nasse Felder schimmern blau; es zählt die beste Quelle, Boden-Bonus kommt dazu.

    | Anlage | Anschlüsse | Wachstum | Freischaltung |
    |---|---|---|---|
    | Wooden Spout | 1 | +25 % | Workshop |
    | Bamboo Splitter | 2 (gegenüber) | +30 % | Ruf 1 |
    | Copper Sprinkler | 3 | +40 % | Ruf 3 |
    | Brass Fountain | 4 | +50 % | Ruf 5 |

## 7d. Holzarten, Aufträge & Ruf (umgesetzt 2026-10-08)
- **Holzarten** (`src/species.js`): **Eiche** (12 s, Standard), **Birke** (7 s, −1 Stamm, +30 % Wachstum neben einer anderen Birke, Ruf 1), **Kiefer** (20 s, +2 Stämme, Holz 1,5×, bis +50 % Wachstum nachts, Ruf 3). Jede Art hat eigene Baum-, Stamm-, Brett- und Setzling-Grafik. Setzlinge je Art in der Truhe kaufen und pflanzen; ein Stumpf wird bevorzugt mit derselben Art bepflanzt.
- **Aufträge** (Tab *Orders*, freigeschaltet über Skill *Order Board* im Economy-Tree, 40 Coins): Kunden bestellen 1–2 Warensorten mit Zeitlimit und zahlen deutlich mehr als der Markt (×1,8 + Ruf-Bonus). Es wird nur bestellt, was man herstellen kann (Bretter erst mit Sägewerk). 3 Plätze (ab Ruf 4: 4), ablehnen ist erlaubt. Ware, die offene Aufträge brauchen, verkauft der Auto-Verkauf nicht.
- **Ruf** (⭐): kommt aus erfüllten Aufträgen und schaltet frei: 1 Birke & Bamboo Splitter · 2 Sägewerk · 3 Kiefer & Copper Sprinkler · 4 +1 Auftragsplatz · 5 Brass Fountain & Aufträge +25 % · 6 königliche Kunden (+25 %). Stufen bei 5/15/30/55/90/140 Punkten (`src/progress.js`). Zusätzlich zahlt der **Markt je Ruf-Stufe 3 % mehr**.

### Aufträge 2.0 (umgesetzt 2026-10-09): Stammkunden, Auftragsarten, Kunden in der Welt
- **9 Stammkunden** (`src/customers.js`) mit eigenem Aussehen (Hemdfarbe + Hut: Mütze, Zylinder, Strickmütze, Strohhut, Kochmütze, Kopftuch). Jeder Kunde hat höchstens einen offenen Auftrag.
- **Treue (Herzen ❤ 0–5):** Punkte je Lieferung (normal 1, Großauftrag 2), Herzen bei 1/3/6/10/15 Punkten. Abgelaufener Auftrag: −1 Punkt. Jedes Herz: Bezahlung +5 %.
- **Kunden-Boni** (ab ❤3, doppelt ab ❤5) – dauerhaft, wirken aufs ganze Spiel:

  | Kunde | Bonus ❤3 / ❤5 |
  |---|---|
  | Carpenter Hugo | Sägewerke +15 % / +30 % schneller |
  | Baker Mia | Worker laufen +8 % / +15 % schneller |
  | Shipwright Ole | Bretter +15 % / +30 % wert |
  | Mayor Greta | Land-Reihen −10 % / −20 % |
  | Toymaker Lou | +2 % / +4 % Goldholz-Chance |
  | Builder Bob | Gebäude & Böden −15 % / −30 % |
  | Fisher Finn | Lohn −8 % / −15 % |
  | Blacksmith Ida | +1 / +2 Klick-Schaden, Worker +15 % / +30 % Schaden |
  | Innkeeper Rosa | Worker +25 % / +50 % XP |
- **Auftragsarten:** normal · **⚡ Eilauftrag** (40 %: 45 % der Zeit, 80 % der Menge, ×1,4 Lohn) · **📜 Großauftrag** (14 %, ab Ruf 1: ×2,2 Menge, ×1,7 Zeit, ×1,25 Lohn, doppelter Ruf und doppelte Treue).
- **Trinkgeld:** bis zu +30 % bei sofortiger Lieferung, sinkt mit der Restzeit auf 0 (live auf der Karte angezeigt).
- **Kunden in der Welt** (`src/visitors.js`): Zu jedem Auftrag kommt der Kunde mit Glocke über den Weg vorne links am Wiesenrand (blendet aus dem Nebel ein), wartet mit einer Sprechblase (gewünschte Ware; roter Rahmen = Eilauftrag, goldener = Großauftrag) und tippelt ungeduldig, wenn die Zeit knapp wird. Bei Lieferung fliegt die Ware aus der Truhe zu ihm, er jubelt, zahlt (Münz-Text mit Trinkgeld) und winkt beim Gehen; abgelaufen: Gewitterwolke und weg. Klick auf einen wartenden Kunden öffnet seinen Auftrag.

## 7e. Offline-Fortschritt (umgesetzt 2026-10-09, `src/offline.js`)
- Während man spielt, wird gemessen, was **ohne Klicks** in die Truhe kommt: Holz, Goldholz und Setzlinge von Bäumen, die Worker oder der Specht gefällt haben, Bretter vom Sägewerk (abzüglich Stämmen und Setzlingen, die das Team herausnimmt). Daraus wird ein gleitender Durchschnitt je Item (Zeitfenster ~10 Spielminuten).
- Beim nächsten Start wird die Abwesenheit (ab 1 Minute) damit hochgerechnet: **Basis 2 h**, Skill **Night Shift** (Worker-Tree, Spalte 7) → 6 h / 12 h.
- Dabei laufen mit: Auto-Verkauf (nach den Truhen-Regeln), Truhen-Grenze (was nicht passt, wird nicht produziert), Tage und Zahltage (Lohn), Bäume wachsen weiter. Auftragstimer laufen offline **nicht** ab; freie Auftragsplätze sind beim Zurückkommen gefüllt.
- Fenster „🌅 Welcome back!“: Abwesenheit, gewonnene Items, Auto-Verkauf, Lohn, gewachsene Bäume, wartende Kunden, verlorene Items bei voller Truhe, Netto-Coins, Tipp (Worker einstellen / Night Shift).

## 7c. Baum-Kreislauf (umgesetzt 2026-10-08)
**Setzling → Wachsen → Baum → Stumpf → neuer Setzling** (wie Seeds bei Tiny Terraces)
- **Stümpfe wachsen nicht mehr von selbst nach.** Ein Stumpf blockiert sein Feld, bis ein Setzling draufgepflanzt wird: per Klick auf den Stumpf (Setzling aus der Truhe), über „Plant“ im Truhen-Fenster oder automatisch durch Worker (Plant-Aufgabe).
- **Jeder gefällte Baum gibt 1 Setzling garantiert** + 40 % Chance auf einen zweiten (Skill *Seed Bag* +15 % je Stufe).
- **Baumbeete (umgesetzt 2026-10-09):** Bäume wachsen **nur in Baumbeeten** – sichtbare runde Erdflecken mit Steinrand auf der Wiese. So sieht man immer, wie viele Bäume möglich sind und wo Platz ist. Die HUD-Anzeige **„Trees x / y“** zeigt belegte (Bäume + Stümpfe + Markierungen) und vorhandene Beete. Pflanzen: Klick auf ein freies Beet oder einen Stumpf (Setzling aus der Truhe), „Plant“ im Truhen-Fenster oder durch Worker. Außerhalb eines Beets erklärt ein Hinweis den Grund („Trees only grow in tree beds“ / „This bed is taken“). Gebäude dürfen nicht auf Beete.
- **Neue Beete sind selten und besonders:** Start **3**; *Forest Space* (+1, 2 Stufen: 400 / 2.000), *Clearing* (+1, 3.000), *Old Growth* (+2, 15.000) und **+1 je gekaufter Plot-Reihe** – zusammen höchstens 16. Jedes neue Beet ist ein kleines Fest: Fenster „A new tree bed!“ mit Fanfare, der Wald schenkt einen Setzling, und der Spieler **wählt selbst das Feld** für das Beet (Platzier-Modus; „Later“ möglich – dann blinkt „Trees“ im HUD mit „+1“, Klick darauf setzt es). Achievements für 5 / 10 / 15 Beete.
- Ältere Spielstände bekommen Beete automatisch unter alle vorhandenen Bäume (bestehende Bäume bleiben, auch wenn es mehr als das neue Limit sind).
- **Setzlinge:** verkaufen 1 Coin, **kaufen** im Truhen-Fenster ab 10 Coins (+15 % je belegtem Baumplatz).
- **Wachstum:** 24 s je Baum (Eiche), schneller mit Dünger und Rich Soil; *Head Start*: neue Setzlinge starten zu 30 % gewachsen; *Stump Grinder*: Stümpfe bepflanzen sich selbst.
- **Sicherheitsnetz:** 45 s ohne lebenden Baum, ohne Setzling und ohne Geld für einen Setzling → ein Eichhörnchen bringt einen.
- **Tutorial:** Der erste Baum gibt 1 Stamm und wächst einmal von selbst nach; danach Hinweis „Click the stump to replant“.
- **Vorbereitet für weitere Holzarten & Verarbeitung:** Baumarten stehen in `src/species.js` (Name, Wachstumszeit, Leben, Stamm- und Setzling-Item). Items in `ITEM_DEFS` haben einen Typ (`log`, `sapling`, `special`) und eine Baumart, damit Verarbeitungsstätten (z. B. Sägewerk) später gezielt Stämme einer Art annehmen können.

## 8. Wirtschaft

- **Truhe = Inventar:** Alle Items liegen in der Truhe (Holz, Goldholz, Setzlinge …). Jedes Stück belegt einen Platz (Cap, upgradebar).
- **Truhen-Fenster:** oben Gesamtwert + „Alles verkaufen“, darunter jede Item-Sorte mit Icon, Anzahl, Stückwert, Gesamtwert und eigenem Verkaufsknopf. Setzlinge kann man dort auch **pflanzen**.
- Setzlinge: auf Stümpfe oder freie Baumbeete pflanzen, kaufen oder verkaufen – siehe 7c.
- **Auto-Verkauf** (Skill): Sobald die Truhe voll ist (inkl. fliegender und von Workern reservierter Plätze), wird verkauft. Im Truhen-Fenster stellt man **pro Item** ein, ob es auto-verkauft wird (🔁 ✔/✘) und **wie viele behalten** werden (−/+, Shift = ±10). Standard: Stämme und Goldholz an, Bretter (für Aufträge) und Setzlinge aus. Was **offene Aufträge** brauchen, wird nie auto-verkauft (Anzeige „📋 n“ neben der Behalten-Menge).
- Holz kann **verkauft** werden → **Geld**.
- **Truhe voll:** Worker liefern nichts mehr ab und **pausieren**, bis wieder Platz ist (Verkaufen oder Truhen-Upgrade nötig).
- **Mehrere Holzarten**: Später können andere Baumarten gepflanzt werden, die mehr Geld bringen.
- **Baumwachstum:** Mehrere sichtbare Stufen (Setzling → junger Baum → ausgewachsen), Wachstumszeit per Upgrade verkürzbar.
- **Verarbeitung**: Holz kann zu **Brettern** verarbeitet werden (mehr Geld). Es gibt **verschiedene Brettarten je nach Holzart**.
- **Sägewerk:** Ein Gebäude auf einem Plot mit **Slots**. Worker bringen Holz hin, es wird zu Brettern verarbeitet, die Bretter wandern in die Truhe. Upgrades: mehr Slots, höheres Tempo.
- Setzlinge: Chance beim Fällen + Kauf gegen Geld.
- Geld wird ausgegeben für: Plots, Worker (Anstellung & Lohn), Setzlinge, ggf. Skills.

## 9. Skill Trees

- Anzeige **unten**, **horizontal scrollbar**, Knoten mit Verbindungslinien, verzweigt sich immer weiter nach rechts.
- **Mehrere Trees**, Wechsel über Tabs **unten links**.
- Bezahlt wird mit **Geld**. Knoten sind **gemischt**: Werte-Upgrades haben Stufen (z. B. 2/5, jede Stufe teurer), dazu viele **Einmal-Upgrades**. Werte-Themen kommen weiter rechts als stärkere Einmal-Upgrades wieder (z. B. Schärfere Axt → Eisenaxt → Stahlaxt).
- Ein Knoten ist **erst sichtbar, wenn sein Vorgänger gekauft ist** – der Ast wächst dann heraus und der Knoten ploppt auf.
- Jeder Tree hat drei Reihen (Pfade). Zahlen sind erste Werte, noch nicht balanciert.
- **Layout (2026-10-09):** Die Knoten stehen nicht mehr in jeder Spalte untereinander, sondern **versetzt**: Reihen überspringen Spalten, ein Upgrade kommt oft erst ein, zwei Spalten weiter hinten. Dadurch zieht sich jeder Tree auf ~15 Spalten in die Breite (Abstände zwischen den Spalten unverändert); die eckigen Äste verbinden auch über Lücken hinweg. Die Spalten in den Tabellen unten sind daher nur noch die *Reihenfolge*, die echten Positionen stehen in `src/skilltrees.js` (`col`).
- **Start:** 1 Baum, 0 Worker-Plätze, Truhe 20.

**Balancing-Ziele (gemessen mit einem Test-Bot, `public/balance-bot.js`, Stand 2026-10-08):**
- Aktiver Spieler: 2 Käufe in der 1. Minute, danach alle ~40 s; erster Worker nach ~5–8 min; nach 20 min ~2.000 Coins verdient / ~16 Skills; nach 60 min ~19.000 Coins / ~32 Skills.
- Idle (2 normale Worker, kein Klick): ~13 Coins/min, Lohn ≈ 25–30 % davon.
- Kostenkurve je Spalte: 0: 1–15 · 1: 30–80 · 2: 100–300 · 3: 300–600 · 4: 500–1.200 · 5: 1.000–2.500 · 6: 2.000–8.000 · 7: 4.000–12.000 · 8: ~10.000. Alles zusammen: ~168.000 Coins.
- Grundwerte dafür: Eiche wächst in 12 s, 40 % Chance auf einen Bonus-Setzling, Worker deutlich produktiver (schneller, stärker, tragen 2+ Stämme), Lohn ~7 Coins/Tag für einen normalen Worker.

**Clicker-Tree** (21 Knoten) – oben „Kraft & Krit“, Mitte „Werkzeug & Helfer“, unten „Ertrag“
| Spalte | Oben | Mitte | Unten |
|---|---|---|---|
| 0 | | Bigger Haul (+1 Stamm, 1 Coin) | |
| 1 | | Sharper Axe (+1 Schaden, 3×) | |
| 2 | Critical Strike (+8 % Krit, 3×) | Iron Axe (+2 Schaden) | Thorough (+1 Stamm, 2×) |
| 3 | Lumberjack Rhythm (Combo bis ×2) | **Woodpecker** (pickt von selbst, 3×) | Wide Grab (Einsammel-Radius) |
| 4 | Mighty Blow (Krit ×4) | Steel Axe (+3 Schaden) | Golden Strike (+3 % Goldholz, 3×) |
| 5 | Combo Master (bis ×3) | **Splinters** (Bonus-Stamm pro Treffer, 2×) | Magnet Chest (5 s → 1,5 s, 2×) |
| 6 | **Eagle Eye** (+5 % Krit, 3×) | **Titan Axe** (Schaden ×1,5) | Long Arms (großer Radius) |
| 7 | **Frenzy** (Combo gibt Krit) | **Gilded Edge** (+5 % Goldholz) | Double Harvest (+1 Stamm) |
| 8 | | | **Lumber Baron** (+2 Stämme) |

**Economy-Tree** (23 Knoten) – oben „Handel“, Mitte „Lager & Bauen“, unten „Wald“
| Spalte | Oben | Mitte | Unten |
|---|---|---|---|
| 0 | | Bigger Chest (+5 Plätze, 4×) | |
| 1 | Order Board (Orders-Tab) | Workshop (Build-Tab) | Fertilizer (+25 % Wachstum, 2×) |
| 2 | Trade Contacts (+15 % Preis, 3×) | Chest Annex (+10) | Forest Space (+1 Baumbeet, 2×: 400 / 2.000) |
| 3 | Market Stall (+25 %) | Iron Fittings (+10) | Seed Bag (+15 % Bonus-Setzling, 2×) |
| 4 | Auto-Sell | Treasury (+15) | Clearing (+1 Baumbeet, 3.000) |
| 5 | **Gold Appraiser** (Goldholz ×1,5/×2) | **Soil Science** (Rich Soil stärker & −30 %) | Stump Grinder |
| 6 | Trade Guild (+50 %) | **Warehouse** (+25) | Head Start |
| 7 | **Wholesale** (+10 %, 3×) | **Nursery** (Setzlinge −40 %) | **Old Growth** (+2 Baumbeete, 15.000) |
| 8 | **Royal Contract** (Preis ×2) | | **Ancient Forest** (+50 % Wachstum) |

**Worker-Tree** (19 Knoten) – oben „Werte“, Mitte „Plätze“, unten „Verwaltung“
| Spalte | Oben | Mitte | Unten |
|---|---|---|---|
| 0 | | First Hut (1. Platz, Board & Team) | |
| 1 | **Work Boots** (+10 % Tempo, 3×) | Bunk Bed (+1 Platz) | **Bigger Board** (+1 Zettel, 2×) |
| 2 | **Whetstone** (+10 % Schwung, 3×) | Lumber Camp (+1 Platz) | **Recruiter** (bessere Seltenheit, 2×) |
| 3 | **Hearty Lunch** (+15 % Schaden, 3×) | **Backpacks** (+1 Tragen) | **Lucky Dice** (Würfeln −60 %) |
| 4 | **Mentor** (+25 % XP, 2×) | **Treehouse** (+1 Platz) | **Union Deal** (−15 % Lohn, 2×) |
| 5 | **Training Camp** (Level-Cap +5) | **Lanterns** (keine Nacht-Strafe, +10 % nachts) | **Headhunter** (Einstellen −25 %) |
| 6 | **Masterclass** (+1 Wertpunkt je Level) | **Lumber Lodge** (+2 Plätze) | **Team Spirit** (+3 % je Worker) |
| 7 | | **Night Shift** (Offline-Zeit 2 h → 6 h → 12 h, 2×) | |

Fett = neu in diesem Durchgang. Über Skills maximal 8 Baumbeete (mit allen 8 Land-Reihen 16) und 6 Worker-Plätze.

## 10. UI-Layout (nach Skizze)

```
+--------------------------------------------------------------+
| [Anzeige 1] [Anzeige 2] [Anzeige 3] [Anzeige 4]   (Top-Bar)  |
+------+-------------------------------------------------------+
| Tab  |                                                       |
| Tab  |            3D-Szene (Holzfällen, Klicken)             |
| Tab  |                                                       |
| Tab  |                                                       |
+------+-------------------------------------------------------+
| Tree |  Skill Tree  o--o--o                                  |
| Tree |             \-o--o--o----->  (scrollt nach rechts)    |
| Tree |               o--o                                    |
+------+-------------------------------------------------------+
```

- **Oben**: Anzeigen. Vorschlag: Geld, Holz in Truhe (x/Cap), Tag/Zeit mit Tempo (x1/x2/x4), Worker (x/Cap).
- **Links (oben)**: Tabs, die Fenster öffnen:
  1. Worker-Board (Zettel)
  2. Management
  3. Plots / Karte
  4. Truhe & Verarbeitung / Markt
- **Mitte**: 3D-Szene mit Klicken.
- **Unten**: Skill Tree, **links daneben** die Tabs zum Wechsel zwischen den Trees.
- **Gesamtlook**: Holz – Stämme als Rahmen, Planken als Flächen, Holzschilder für Knoten/Zettel.

## 11. Events, Stil & Sound

- **Zufallsereignisse (umgesetzt 2026-10-09, `src/randomevents.js`):** etwa alle 2,5–5 Spielminuten passiert eines (erstes nach ~4 Minuten, nie im Tutorial oder offline, immer nur eines gleichzeitig). Oben rechts über der Welt hängt dann ein Schild mit Name, Beschreibung und Restzeit.

  | Ereignis | Dauer | Wirkung | Gewicht |
  |---|---|---|---|
  | **Rain** | 2 min | Bäume wachsen doppelt so schnell; Regenstriche, trüberes Licht, Bäume schwanken | 30 |
  | **Golden Tree** | 1,5 min | ein ausgewachsener Baum leuchtet golden – gefällt wird **jeder Stamm zu Goldholz** | 22 |
  | **Market Day** | 2 min | alles verkauft sich für **+50 %** (auch Aufträge, die in der Zeit entstehen) | 18 |
  | **Traveling Merchant** | 2,5 min | eine Händler-Figur (lila Hemd, Zylinder) wartet am Weg; Klick auf ihn oder das Schild öffnet **3 Angebote**: Stämme zum doppelten Preis verkaufen · 3 Setzlinge der besten Art zum halben Preis · Wunderdünger (Bäume 3 min doppelt so schnell) · Schulungsrolle (jeder Worker +1 Level). Jedes einmal kaufbar, Preise wachsen mit dem Fortschritt. | 18 |
  | **Thunderstorm** (ab Tag 3) | 1 min | Starkregen und Wind; alle 9–16 s ein **Blitz** (Lichtblitz, Donner), der einen ausgewachsenen Baum fällt – die Stämme liegen zum Einsammeln da | 12 |

  Erster Auftritt von Händler, goldenem Baum und Gewitter gibt je einen Hinweis. Achievements: *Gold Rush* (goldenen Baum fällen), *Good Deal* (mit dem Händler handeln), *Storm Chaser* (3 Gewitter).
- **Stil:** gemütlich, Retro-Pixel-Art (ca. 16/32 px), warme Farben.
- **Sound:** Axtschläge, Vogelgezwitscher, ruhige Musik.

## 12. Bewusst aufgeschoben

- **Prestige** / Reset-System: später entscheiden.
- Konkrete Skill-Tree-Inhalte: kommen vom Auftraggeber.
- Tutorial / Einstieg in die ersten Minuten: nicht besprochen.

## 13. Offene Fragen

- **Wachstumszeit** von Setzlingen, Anzahl & Namen der Holzarten, Brettarten.
- **Zahlen**: Preise, Lohn, Seltenheitsverteilung, Offline-Cap, Lohn-Intervall (alle X Tage), Pfändungsquote im Minus.
- Genaue **Anzeigen in der Top-Bar**.
- Konkrete **Tag-/Nacht-Eigenschaften** und Schichtregeln (Überstundenkosten, Nachtarbeit ohne Licht?).
- Gibt es ein **Schulden-Limit** oder bleibt Minus unbegrenzt?
- Anzahl der **Worker-Zettel am Board**, Reroll-Kosten.
- Anzahl und Wirkung der **Events**, Häufigkeit.

## 14. Nächste Schritte

1. Idee durchlesen und Anpassungen sagen.
2. Skill-Tree-Upgrades vom Auftraggeber liefern lassen.
3. Technischen Prototyp planen: Three.js-Szene mit Wiese, Nebel, Truhe, Baum, Klick-Fällen.
4. UI-Grundgerüst im Holz-Look nach Skizze.
5. Worker-KI, Board, Management, danach Plots und Zeitsystem.
