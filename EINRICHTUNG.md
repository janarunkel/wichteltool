# Wichtel-Tool online stellen

Du brauchst zwei kostenlose Konten: **Supabase** (die Datenbank) und **Netlify** (zeigt die Website im Internet an). Das dauert etwa 15 Minuten und muss nur einmal gemacht werden.

## Was ist in diesem Ordner?

| Datei | Wozu |
|---|---|
| `index.html`, `style.css`, `script.js` | Die Website |
| `config.js` | Verbindung zur Datenbank. Hier trägst du in Schritt 2 deine Daten ein. |
| `datenbank.sql` | Richtet die Datenbank ein (Schritt 1) |
| `EINRICHTUNG.md` | Diese Anleitung. Muss nicht mit hochgeladen werden. |

## Schritt 1: Datenbank bei Supabase anlegen

1. Geh auf <https://supabase.com> und registriere dich kostenlos („Start your project“).
2. Leg ein **neues Projekt** an. Der Name ist egal, z. B. „Wichteln“. Als Region wählst du **Frankfurt (eu-central-1)**. Das Datenbank-Passwort, nach dem gefragt wird, brauchst du später nicht. Lass es einfach erzeugen.
3. Warte, bis das Projekt bereit ist (1 bis 2 Minuten).
4. Klick links auf **SQL Editor**.
5. Öffne die Datei `datenbank.sql` mit einem Texteditor (Rechtsklick → Öffnen mit → Editor), markiere alles und kopiere es in den SQL Editor.
6. Ganz unten steht `DEIN-ADMIN-PASSWORT`. Ersetze das durch **dein eigenes Admin-Passwort**. Nimm ein langes Passwort, mit dem du später den Admin-Bereich öffnest. Die Anführungszeichen `'...'` bleiben stehen.
7. Klick auf **Run**. Es sollte „Success“ erscheinen.

## Schritt 2: Website mit der Datenbank verbinden

1. Klick in Supabase links unten auf **Project Settings** (Zahnrad) und dann auf **API** bzw. **Data API** und **API Keys**.
2. Kopiere die **Project URL**, die so aussieht: `https://abcdefgh.supabase.co`.
3. Kopiere den öffentlichen Schlüssel. Er heißt **publishable key** (beginnt mit `sb_publishable_`) oder bei älteren Projekten **anon public** (beginnt mit `eyJ`).
   ⚠️ Nimm **nicht** den „secret“- oder „service_role“-Schlüssel!
4. Öffne `config.js` mit dem Editor und trag beides zwischen die Anführungszeichen ein:

   ```js
   window.WICHTEL_CONFIG = {
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseKey: "sb_publishable_xxxxxxxx",
   };
   ```

5. Speichern.

## Schritt 3: Website online stellen mit Netlify

1. Geh auf <https://app.netlify.com/drop> und melde dich kostenlos an (damit die Seite dauerhaft online bleibt).
2. Zieh den **ganzen Ordner „Wichtel Tool“** in das Feld auf der Seite.
3. Nach ein paar Sekunden bekommst du einen Link, z. B. `https://lustiger-name-123.netlify.app`.
4. Optional: Unter **Site configuration → Change site name** kannst du den Namen ändern, z. B. `familie-mueller-wichteln`.

**Später etwas geändert?** In Netlify im Projekt auf **Deploys** gehen und den Ordner erneut hineinziehen.

## Schritt 4: Loslegen

1. Öffne deinen Link mit `#admin` am Ende, z. B. `https://familie-mueller-wichteln.netlify.app/#admin`. Unten auf der Seite gibt es auch den Link „Admin-Bereich“.
2. Gib dein Admin-Passwort ein und prüfe das Budget.
3. Schick den **Einladungslink** (ohne `#admin`) an alle. Im Admin-Bereich gibt es dafür Knöpfe für WhatsApp und E-Mail.
4. Jede Person meldet sich an, trägt bis zu 3 Wünsche ein und bekommt einen persönlichen Code.
5. Wenn alle dabei sind: **Anmeldung schließen & auslosen**. Dann allen Bescheid sagen. Sie öffnen den Link wieder und decken ihren Wichtel auf.
6. Nach dem Wichteln: **Runde beenden & alles löschen**. Nächstes Jahr schickst du einfach wieder denselben Link.

## Gut zu wissen

- **Geheimhaltung:** Die Auslosung passiert auf dem Server. Jede Person sieht nur ihre eigene Zuordnung, und zwar nur mit ihrem persönlichen Code. Auch du als Admin siehst nicht, wer wen beschenkt.
- **Code vergessen?** Auf dem Gerät, mit dem man sich angemeldet hat, ist man automatisch drin. Auf einem anderen Gerät braucht man den Code. Ist er weg, kannst du die Person vor der Auslosung im Admin-Bereich entfernen, damit sie sich neu anmeldet.
- **Admin-Passwort ändern:** Im Supabase SQL Editor nur die letzten drei Zeilen aus `datenbank.sql` mit dem neuen Passwort ausführen.
- **Supabase pausiert:** Kostenlose Projekte werden nach etwa einer Woche ohne Nutzung pausiert. Im Supabase-Dashboard kannst du es mit einem Klick wieder starten („Restore project“). Am besten vor dem Verschicken des Links einmal reinschauen.
- **Teste es einmal selbst:** Melde dich mit zwei Testnamen an (z. B. in einem normalen und einem privaten Browserfenster), lose aus und lösche die Runde danach wieder.
