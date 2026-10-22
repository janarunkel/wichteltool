"use strict";

/* =========================================================
   Demo-Version des Wichtel-Tools
   Ersetzt die Supabase-Datenbank durch eine kleine Nachbildung im
   Browser. Alles bleibt im Browser der Besucherin oder des Besuchers,
   es wird nichts verschickt und es gibt keine echten Daten.
   Die Funktionen verhalten sich wie die in datenbank.sql.
   ========================================================= */

(function () {
  const DEMO_URL = "https://demo.wichtel.invalid";
  const PRAEFIX = "demo-";
  const SPEICHER = `${PRAEFIX}wichtel-db`;
  const ADMIN_PASSWORT = "demo";

  window.WICHTEL_CONFIG = { supabaseUrl: DEMO_URL, supabaseKey: "demo", speicherPraefix: PRAEFIX };

  /* ---------- Beispieldaten ---------- */

  function startDaten() {
    const person = (name, wuensche) => ({ id: neueId(), name, code: neuerCode(), wuensche });
    return {
      budget: 50,
      status: "offen",
      ausgelost_am: null,
      teilnehmende: [
        person("Oma Erika", ["Ein gutes Hörbuch", "Lavendel-Handcreme", "Fotokalender"]),
        person("Opa Heinz", ["Kreuzworträtselheft", "Dunkle Schokolade"]),
        person("Mama", ["Kuschelsocken", "Ein Kochbuch", "Gutschein fürs Kino"]),
        person("Papa", ["Grillgewürze", "Krimi"]),
        person("Lena", ["Puzzle mit 1000 Teilen"]),
      ],
      zuordnung: {},
    };
  }

  let speicherOk = true;
  let speicherKopie = null;

  function lade() {
    try {
      const roh = localStorage.getItem(SPEICHER);
      if (roh) return JSON.parse(roh);
    } catch {
      speicherOk = false;
    }
    return speicherKopie || null;
  }

  function sichere(db) {
    speicherKopie = db;
    if (!speicherOk) return;
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(db));
    } catch {
      speicherOk = false;
    }
  }

  function db() {
    let daten = lade();
    if (!daten) {
      daten = startDaten();
      sichere(daten);
    }
    return daten;
  }

  function demoZuruecksetzen() {
    try {
      localStorage.removeItem(SPEICHER);
      localStorage.removeItem(`${PRAEFIX}wichtel-code`);
      sessionStorage.removeItem(`${PRAEFIX}wichtel-admin`);
    } catch {
      // ohne Speicher reicht das Neuladen
    }
    speicherKopie = null;
  }

  /* ---------- Hilfsfunktionen ---------- */

  function neueId() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  }

  function neuerCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    return hex.match(/.{4}/g).join("-");
  }

  function normCode(code) {
    return String(code || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  }

  function saeubereName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function saeubereWuensche(wuensche) {
    return (Array.isArray(wuensche) ? wuensche : [])
      .map((w) => String(w || "").trim().replace(/\s+/g, " ").slice(0, 80))
      .filter(Boolean)
      .slice(0, 3);
  }

  function fehler(text) {
    const e = new Error(text);
    e.demo = true;
    throw e;
  }

  function finde(daten, code) {
    const person = daten.teilnehmende.find((p) => normCode(p.code) === normCode(code));
    if (!person) fehler("Diesen Code gibt es nicht. Prüfe die Schreibweise.");
    return person;
  }

  function adminCheck(passwort) {
    if (passwort !== ADMIN_PASSWORT) fehler(`Das Admin-Passwort ist falsch. In der Demo lautet es „${ADMIN_PASSWORT}“.`);
  }

  function zufallsIndex(max) {
    const zahl = new Uint32Array(1);
    const grenze = Math.floor(0x100000000 / max) * max;
    do crypto.getRandomValues(zahl);
    while (zahl[0] >= grenze);
    return zahl[0] % max;
  }

  /* ---------- Nachbildung der Datenbank-Funktionen ---------- */

  const funktionen = {
    wichtel_info() {
      const d = db();
      return { budget: d.budget, status: d.status, namen: d.teilnehmende.map((p) => p.name) };
    },

    wichtel_anmelden({ p_name, p_wuensche }) {
      const d = db();
      const name = saeubereName(p_name);
      if (d.status !== "offen") fehler("Die Anmeldung ist geschlossen, weil schon ausgelost wurde.");
      if (name.length < 1 || name.length > 40) fehler("Bitte gib einen Namen mit 1 bis 40 Zeichen ein.");
      if (d.teilnehmende.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        fehler(`Der Name „${name}“ ist schon angemeldet. Nutze z. B. einen Zusatz wie „${name} (Berlin)“.`);
      }
      const code = neuerCode();
      d.teilnehmende.push({ id: neueId(), name, code, wuensche: saeubereWuensche(p_wuensche) });
      sichere(d);
      return { name, code };
    },

    wichtel_ich({ p_code }) {
      const d = db();
      const ich = finde(d, p_code);
      const empfaengerId = d.zuordnung[ich.id];
      const empf = d.teilnehmende.find((p) => p.id === empfaengerId);
      return {
        name: ich.name,
        wuensche: ich.wuensche,
        budget: d.budget,
        status: d.status,
        empfaenger: empf ? { name: empf.name, wuensche: empf.wuensche } : null,
      };
    },

    wichtel_wuensche_speichern({ p_code, p_wuensche }) {
      const d = db();
      const ich = finde(d, p_code);
      ich.wuensche = saeubereWuensche(p_wuensche);
      sichere(d);
      return ich.wuensche;
    },

    wichtel_admin_uebersicht({ p_passwort }) {
      adminCheck(p_passwort);
      const d = db();
      return {
        budget: d.budget,
        status: d.status,
        ausgelost_am: d.ausgelost_am,
        teilnehmende: d.teilnehmende.map((p) => ({ id: p.id, name: p.name, anzahl_wuensche: p.wuensche.length })),
      };
    },

    wichtel_admin_budget({ p_passwort, p_budget }) {
      adminCheck(p_passwort);
      if (!Number.isInteger(p_budget) || p_budget < 1 || p_budget > 10000) {
        fehler("Bitte gib einen ganzen Betrag zwischen 1 und 10.000 € ein.");
      }
      const d = db();
      d.budget = p_budget;
      sichere(d);
      return null;
    },

    wichtel_admin_entfernen({ p_passwort, p_id }) {
      adminCheck(p_passwort);
      const d = db();
      if (d.status !== "offen") fehler("Nach der Auslosung kann niemand entfernt werden. Setze zuerst die Auslosung zurück.");
      d.teilnehmende = d.teilnehmende.filter((p) => p.id !== p_id);
      sichere(d);
      return null;
    },

    // Gleiches Verfahren wie auf dem Server: mischen, Kreis bilden, alles prüfen.
    wichtel_admin_auslosen({ p_passwort }) {
      adminCheck(p_passwort);
      const d = db();
      if (d.status !== "offen") fehler("Es wurde bereits ausgelost.");
      const ids = d.teilnehmende.map((p) => p.id);
      if (ids.length < 2) fehler("Für eine Auslosung sind mindestens zwei Personen erforderlich.");
      for (let i = ids.length - 1; i > 0; i--) {
        const j = zufallsIndex(i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const zuordnung = {};
      ids.forEach((id, i) => (zuordnung[id] = ids[(i + 1) % ids.length]));

      const empfaenger = new Set(Object.values(zuordnung));
      const gueltig =
        Object.keys(zuordnung).length === ids.length &&
        empfaenger.size === ids.length &&
        Object.entries(zuordnung).every(([s, e]) => s !== e);
      if (!gueltig) fehler("Die Auslosung war ungültig und wurde verworfen. Bitte erneut versuchen.");

      d.zuordnung = zuordnung;
      d.status = "ausgelost";
      d.ausgelost_am = new Date().toISOString();
      sichere(d);
      return { anzahl: ids.length };
    },

    wichtel_admin_auslosung_zuruecksetzen({ p_passwort }) {
      adminCheck(p_passwort);
      const d = db();
      d.zuordnung = {};
      d.status = "offen";
      d.ausgelost_am = null;
      sichere(d);
      return null;
    },

    wichtel_admin_runde_loeschen({ p_passwort }) {
      adminCheck(p_passwort);
      const d = db();
      d.teilnehmende = [];
      d.zuordnung = {};
      d.status = "offen";
      d.ausgelost_am = null;
      sichere(d);
      return null;
    },
  };

  /* ---------- Anfragen an die "Datenbank" abfangen ---------- */

  const echtesFetch = window.fetch.bind(window);
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  window.fetch = async function (eingabe, optionen = {}) {
    const url = typeof eingabe === "string" ? eingabe : eingabe.url;
    if (!url.startsWith(DEMO_URL)) return echtesFetch(eingabe, optionen);

    const name = url.split("/rpc/")[1];
    const parameter = optionen.body ? JSON.parse(optionen.body) : {};
    await warte(250); // fühlt sich an wie eine echte Verbindung
    const antwort = (status, daten) =>
      new Response(daten === null ? "" : JSON.stringify(daten), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (!funktionen[name]) return antwort(404, { message: "Unbekannte Funktion." });
    try {
      return antwort(200, funktionen[name](parameter));
    } catch (e) {
      return antwort(400, { message: e.demo ? e.message : "Da ist etwas schiefgelaufen." });
    }
  };

  /* ---------- Demo-Leiste ---------- */

  function baueLeiste() {
    const leiste = document.createElement("div");
    leiste.className = "demo-leiste";
    leiste.innerHTML = `
      <span class="demo-etikett">Demo</span>
      <span class="demo-text">Probier alles aus. Admin-Passwort: <strong>demo</strong></span>
      <span class="demo-knoepfe">
        <a href="#" data-ansicht="teilnehmer">Teilnehmer-Ansicht</a>
        <a href="#admin" data-ansicht="admin">Admin-Ansicht</a>
        <button type="button" class="demo-reset">Demo zurücksetzen</button>
      </span>`;
    document.body.prepend(leiste);

    const markiere = () => {
      const admin = location.hash === "#admin";
      leiste.querySelectorAll("[data-ansicht]").forEach((a) => {
        a.classList.toggle("aktiv", (a.dataset.ansicht === "admin") === admin);
      });
    };
    window.addEventListener("hashchange", markiere);
    markiere();

    leiste.querySelector(".demo-reset").addEventListener("click", () => {
      demoZuruecksetzen();
      location.href = location.href.split("#")[0];
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", baueLeiste);
  else baueLeiste();
})();
