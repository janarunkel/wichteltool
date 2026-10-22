"use strict";

/* =========================================================
   Verbindung zur Datenbank
   Alle Daten liegen in Supabase. Die Seite ruft nur die geschützten
   Wichtel-Funktionen auf (siehe datenbank.sql), nie die Tabellen direkt.
   ========================================================= */

const CONFIG = window.WICHTEL_CONFIG || {};
const CODE_SCHLUESSEL = "wichtel-code";
const ADMIN_SCHLUESSEL = "wichtel-admin";
const MAX_WUENSCHE = 3;

function istEingerichtet() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
}

async function rpc(funktion, parameter = {}) {
  const kopfzeilen = { "Content-Type": "application/json", apikey: CONFIG.supabaseKey };
  // Alte "anon"-Schlüssel sind JWTs und werden zusätzlich als Bearer mitgeschickt.
  if (CONFIG.supabaseKey.startsWith("eyJ")) kopfzeilen.Authorization = `Bearer ${CONFIG.supabaseKey}`;

  let antwort;
  try {
    antwort = await fetch(`${CONFIG.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${funktion}`, {
      method: "POST",
      headers: kopfzeilen,
      body: JSON.stringify(parameter),
    });
  } catch {
    throw new Error("Keine Verbindung zur Datenbank. Bitte prüfe deine Internetverbindung.");
  }
  const text = await antwort.text();
  const daten = text ? JSON.parse(text) : null;
  if (!antwort.ok) {
    throw new Error((daten && daten.message) || "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.");
  }
  return daten;
}

/* =========================================================
   Hilfsfunktionen
   ========================================================= */

const $ = (id) => document.getElementById(id);

function zeige(el, sichtbar) {
  el.hidden = !sichtbar;
}

function zeigeMeldung(el, text) {
  el.textContent = text || "";
  el.hidden = !text;
}

function lies(schluessel, speicher = localStorage) {
  try {
    return speicher.getItem(schluessel);
  } catch {
    return null;
  }
}

function schreibe(schluessel, wert, speicher = localStorage) {
  try {
    if (wert === null) speicher.removeItem(schluessel);
    else speicher.setItem(schluessel, wert);
  } catch {
    // Ohne Speicher muss man den Code eben jedes Mal eingeben.
  }
}

function basisLink() {
  return location.href.split("#")[0];
}

function persoenlicherLink(code) {
  return `${basisLink()}#code=${encodeURIComponent(code)}`;
}

async function kopiere(text, knopf) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Zum Kopieren markieren und kopieren:", text);
    return;
  }
  const vorher = knopf.textContent;
  knopf.textContent = "✓ Kopiert!";
  setTimeout(() => (knopf.textContent = vorher), 1800);
}

function wuenscheAus(form) {
  return Array.from(form.querySelectorAll("input[name=wunsch]"))
    .map((feld) => feld.value.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, MAX_WUENSCHE);
}

function fuelleWuensche(form, wuensche) {
  form.querySelectorAll("input[name=wunsch]").forEach((feld, i) => (feld.value = wuensche[i] || ""));
}

function zeigeBudget(budget) {
  document.querySelectorAll(".budget-wert").forEach((el) => (el.textContent = `${budget} €`));
}

// Knopf während einer Anfrage sperren, damit nichts doppelt abgeschickt wird.
async function mitKnopf(knopf, aufgabe) {
  if (knopf) knopf.disabled = true;
  try {
    return await aufgabe();
  } finally {
    if (knopf) knopf.disabled = false;
  }
}

/* =========================================================
   Teilnehmer-Bereich
   ========================================================= */

const tn = {
  info: null,
  ich: null,
};

function tnAbschnitte(sichtbar) {
  ["tn-anmelden", "tn-geschlossen", "tn-code-login", "tn-neuer-code", "tn-ich"].forEach((id) =>
    zeige($(id), sichtbar.includes(id))
  );
}

function zeichneDabei(namen) {
  const liste = $("dabei-liste");
  liste.innerHTML = "";
  namen.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    liste.append(li);
  });
  $("dabei-anzahl").textContent = namen.length;
  zeige($("dabei-leer"), namen.length === 0);
}

async function ladeTeilnehmerSeite() {
  tn.info = await rpc("wichtel_info");
  zeigeBudget(tn.info.budget);
  zeichneDabei(tn.info.namen);

  const code = lies(CODE_SCHLUESSEL);
  if (code) {
    try {
      await ladeIch(code);
      return;
    } catch (fehler) {
      if (!fehler.message.startsWith("Diesen Code gibt es nicht")) throw fehler;
      // Gespeicherter Code gilt nicht mehr, z. B. nach dem Ende einer Runde.
      schreibe(CODE_SCHLUESSEL, null);
      zeigeStartAbschnitt(true);
      zeigeMeldung($("meldung-code"), "Dein gespeicherter Code gilt nicht mehr. Vielleicht wurde eine neue Runde gestartet.");
      return;
    }
  }
  zeigeStartAbschnitt();
}

function zeigeStartAbschnitt(codeLogin = false) {
  if (tn.info.status === "offen" && !codeLogin) {
    tnAbschnitte(["tn-anmelden"]);
  } else if (tn.info.status === "offen") {
    tnAbschnitte(["tn-code-login"]);
  } else {
    tnAbschnitte(["tn-geschlossen", "tn-code-login"]);
  }
  zeige($("knopf-zur-anmeldung"), tn.info.status === "offen");
}

async function ladeIch(code) {
  tn.ich = await rpc("wichtel_ich", { p_code: code });
  schreibe(CODE_SCHLUESSEL, code);
  zeigeBudget(tn.ich.budget);
  zeichneIch();
  tnAbschnitte(["tn-ich"]);
}

function zeichneIch() {
  const ich = tn.ich;
  $("ich-name").textContent = ich.name;
  const ausgelost = ich.status === "ausgelost" && ich.empfaenger;
  zeige($("ich-wartet"), !ausgelost);
  zeige($("ich-ausgelost"), Boolean(ausgelost));
  verbergeErgebnis();
  fuelleWuensche($("form-eigene-wuensche"), ich.wuensche);
}

function verbergeErgebnis() {
  $("ich-empfaenger").textContent = "";
  $("ich-empfaenger-wuensche").innerHTML = "";
  zeige($("ich-verdeckt"), true);
  zeige($("ich-aufgedeckt"), false);
}

$("knopf-aufdecken").addEventListener("click", () => {
  const empfaenger = tn.ich && tn.ich.empfaenger;
  if (!empfaenger) return;
  $("ich-empfaenger").textContent = empfaenger.name;
  const liste = $("ich-empfaenger-wuensche");
  liste.innerHTML = "";
  empfaenger.wuensche.forEach((wunsch) => {
    const li = document.createElement("li");
    li.textContent = wunsch;
    liste.append(li);
  });
  zeige($("ich-keine-wuensche"), empfaenger.wuensche.length === 0);
  zeige($("ich-verdeckt"), false);
  zeige($("ich-aufgedeckt"), true);
});

$("knopf-verbergen").addEventListener("click", verbergeErgebnis);

$("form-anmelden").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  zeigeMeldung($("meldung-anmelden"), "");
  try {
    const ergebnis = await mitKnopf(form.querySelector("button[type=submit]"), () =>
      rpc("wichtel_anmelden", { p_name: $("anmelden-name").value, p_wuensche: wuenscheAus(form) })
    );
    schreibe(CODE_SCHLUESSEL, ergebnis.code);
    form.reset();
    $("neuer-code").textContent = ergebnis.code;
    tnAbschnitte(["tn-neuer-code"]);
    $("tn-neuer-code").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (fehler) {
    zeigeMeldung($("meldung-anmelden"), fehler.message);
  }
});

$("knopf-code-link-kopieren").addEventListener("click", (e) =>
  kopiere(persoenlicherLink($("neuer-code").textContent), e.currentTarget)
);

$("knopf-code-weiter").addEventListener("click", async () => {
  try {
    await ladeTeilnehmerSeite();
  } catch (fehler) {
    zeigeMeldung($("meldung-global"), fehler.message);
  }
});

document.querySelectorAll(".zeige-code-login").forEach((knopf) =>
  knopf.addEventListener("click", () => zeigeStartAbschnitt(true))
);

$("knopf-zur-anmeldung").addEventListener("click", () => zeigeStartAbschnitt(false));

$("form-code").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("eingabe-code").value.trim();
  if (!code) {
    zeigeMeldung($("meldung-code"), "Bitte gib deinen Code ein.");
    return;
  }
  zeigeMeldung($("meldung-code"), "");
  try {
    await mitKnopf(e.currentTarget.querySelector("button"), () => ladeIch(code));
    $("eingabe-code").value = "";
  } catch (fehler) {
    zeigeMeldung($("meldung-code"), fehler.message);
  }
});

$("form-eigene-wuensche").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  zeigeMeldung($("meldung-eigene-wuensche"), "");
  zeige($("erfolg-eigene-wuensche"), false);
  try {
    const gespeichert = await mitKnopf(form.querySelector("button[type=submit]"), () =>
      rpc("wichtel_wuensche_speichern", { p_code: lies(CODE_SCHLUESSEL), p_wuensche: wuenscheAus(form) })
    );
    tn.ich.wuensche = gespeichert;
    fuelleWuensche(form, gespeichert);
    zeige($("erfolg-eigene-wuensche"), true);
  } catch (fehler) {
    zeigeMeldung($("meldung-eigene-wuensche"), fehler.message);
  }
});

$("knopf-ich-link").addEventListener("click", (e) => kopiere(persoenlicherLink(lies(CODE_SCHLUESSEL)), e.currentTarget));

$("knopf-abmelden").addEventListener("click", () => {
  if (!confirm("Auf diesem Gerät abmelden? Du brauchst dann deinen Code, um wieder hineinzukommen.")) return;
  schreibe(CODE_SCHLUESSEL, null);
  tn.ich = null;
  zeigeStartAbschnitt(true);
});

/* =========================================================
   Admin-Bereich
   ========================================================= */

const admin = {
  passwort: lies(ADMIN_SCHLUESSEL, sessionStorage),
  daten: null,
};

async function ladeAdminSeite() {
  if (!admin.passwort) {
    zeige($("admin-login"), true);
    zeige($("admin-dashboard"), false);
    $("eingabe-admin-passwort").focus();
    return;
  }
  try {
    admin.daten = await rpc("wichtel_admin_uebersicht", { p_passwort: admin.passwort });
  } catch (fehler) {
    admin.passwort = null;
    schreibe(ADMIN_SCHLUESSEL, null, sessionStorage);
    zeige($("admin-login"), true);
    zeige($("admin-dashboard"), false);
    zeigeMeldung($("meldung-admin-login"), fehler.message);
    return;
  }
  zeige($("admin-login"), false);
  zeige($("admin-dashboard"), true);
  zeichneAdmin();
}

function zeichneAdmin() {
  const d = admin.daten;
  const ausgelost = d.status === "ausgelost";
  zeigeBudget(d.budget);

  $("admin-status").textContent = ausgelost
    ? `✅ Ausgelost am ${new Date(d.ausgelost_am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}. Alle können jetzt über den Link ihren Wichtel aufdecken.`
    : "📝 Die Anmeldung ist offen. Sobald alle dabei sind, kannst du auslosen.";

  const link = basisLink();
  const nachricht = `🎄 Wir wichteln! Melde dich hier an und trag deine Wünsche ein: ${link}`;
  $("einladungslink").textContent = link;
  $("knopf-einladung-whatsapp").href = `https://wa.me/?text=${encodeURIComponent(nachricht)}`;
  $("knopf-einladung-mail").href = `mailto:?subject=${encodeURIComponent("Familien-Wichteln 🎁")}&body=${encodeURIComponent(nachricht)}`;

  const liste = $("admin-liste");
  liste.innerHTML = "";
  d.teilnehmende.forEach((person) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = person.name;
    const rechts = document.createElement("span");
    rechts.className = "zeilen-knoepfe";
    const wuensche = document.createElement("span");
    wuensche.className = "wunsch-zaehler";
    wuensche.textContent = `📝 ${person.anzahl_wuensche}/${MAX_WUENSCHE}`;
    wuensche.title = "Anzahl hinterlegter Wünsche";
    rechts.append(wuensche);
    if (!ausgelost) {
      const entfernen = document.createElement("button");
      entfernen.type = "button";
      entfernen.className = "knopf-entfernen";
      entfernen.textContent = "✕";
      entfernen.setAttribute("aria-label", `${person.name} entfernen`);
      entfernen.addEventListener("click", () => entferne(person));
      rechts.append(entfernen);
    }
    li.append(name, rechts);
    liste.append(li);
  });
  $("admin-anzahl").textContent = d.teilnehmende.length;
  zeige($("admin-leer"), d.teilnehmende.length === 0);
  zeige($("admin-offen-aktionen"), !ausgelost);
  zeige($("admin-ausgelost-aktionen"), ausgelost);
  $("knopf-auslosen").disabled = d.teilnehmende.length < 2;
  $("knopf-auslosen").title = d.teilnehmende.length < 2 ? "Es müssen mindestens zwei Personen angemeldet sein." : "";
}

async function adminAktion(knopf, funktion, parameter = {}) {
  zeigeMeldung($("meldung-admin"), "");
  try {
    await mitKnopf(knopf, () => rpc(funktion, { p_passwort: admin.passwort, ...parameter }));
    await ladeAdminSeite();
    return true;
  } catch (fehler) {
    zeigeMeldung($("meldung-admin"), fehler.message);
    return false;
  }
}

async function entferne(person) {
  if (!confirm(`${person.name} wirklich entfernen? Die Wünsche werden ebenfalls gelöscht.`)) return;
  await adminAktion(null, "wichtel_admin_entfernen", { p_id: person.id });
}

$("form-admin-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const passwort = $("eingabe-admin-passwort").value;
  if (!passwort) return;
  zeigeMeldung($("meldung-admin-login"), "");
  admin.passwort = passwort;
  await mitKnopf(e.currentTarget.querySelector("button"), ladeAdminSeite);
  if (admin.passwort) {
    schreibe(ADMIN_SCHLUESSEL, passwort, sessionStorage);
    $("eingabe-admin-passwort").value = "";
  }
});

$("knopf-admin-aktualisieren").addEventListener("click", (e) => mitKnopf(e.currentTarget, ladeAdminSeite));

$("knopf-admin-abmelden").addEventListener("click", () => {
  admin.passwort = null;
  schreibe(ADMIN_SCHLUESSEL, null, sessionStorage);
  ladeAdminSeite();
});

$("knopf-einladung-kopieren").addEventListener("click", (e) => kopiere(basisLink(), e.currentTarget));

$("knopf-budget-bearbeiten").addEventListener("click", () => {
  $("eingabe-budget").value = admin.daten.budget;
  zeigeMeldung($("meldung-budget"), "");
  zeige($("form-budget"), true);
  $("eingabe-budget").focus();
});

$("knopf-budget-abbrechen").addEventListener("click", () => zeige($("form-budget"), false));

$("form-budget").addEventListener("submit", async (e) => {
  e.preventDefault();
  const wert = Number($("eingabe-budget").value);
  if (!Number.isInteger(wert) || wert < 1 || wert > 10000) {
    zeigeMeldung($("meldung-budget"), "Bitte gib einen ganzen Betrag zwischen 1 und 10.000 € ein.");
    return;
  }
  try {
    await mitKnopf(e.currentTarget.querySelector("button[type=submit]"), () =>
      rpc("wichtel_admin_budget", { p_passwort: admin.passwort, p_budget: wert })
    );
    zeige($("form-budget"), false);
    await ladeAdminSeite();
  } catch (fehler) {
    zeigeMeldung($("meldung-budget"), fehler.message);
  }
});

$("knopf-auslosen").addEventListener("click", async (e) => {
  const anzahl = admin.daten.teilnehmende.length;
  if (!confirm(`Jetzt mit ${anzahl} Personen auslosen? Danach kann sich niemand mehr anmelden.`)) return;
  if (await adminAktion(e.currentTarget, "wichtel_admin_auslosen")) {
    alert("🎉 Die Auslosung ist fertig! Sag allen Bescheid, dass sie über den Link ihren Wichtel aufdecken können.");
  }
});

$("knopf-auslosung-zuruecksetzen").addEventListener("click", (e) => {
  if (!confirm("Auslosung zurücksetzen? Die bisherige Zuordnung wird gelöscht und die Anmeldung wieder geöffnet. Wer schon nachgeschaut hat, bekommt nach der neuen Auslosung eine andere Person.")) return;
  adminAktion(e.currentTarget, "wichtel_admin_auslosung_zuruecksetzen");
});

$("knopf-runde-loeschen").addEventListener("click", (e) => {
  if (!confirm("Runde beenden und ALLES löschen? Alle Teilnehmenden, Wünsche und die Zuordnung werden endgültig gelöscht. Das Budget bleibt erhalten.")) return;
  adminAktion(e.currentTarget, "wichtel_admin_runde_loeschen");
});

/* =========================================================
   Start: Bereich anhand der Adresse wählen
   ========================================================= */

async function starte() {
  zeigeMeldung($("meldung-global"), "");
  const hash = location.hash;

  // Persönlicher Link: Code übernehmen und aus der Adresszeile entfernen.
  if (hash.startsWith("#code=")) {
    schreibe(CODE_SCHLUESSEL, decodeURIComponent(hash.slice(6)));
    history.replaceState(null, "", basisLink());
  }

  const istAdmin = location.hash === "#admin";
  zeige($("ansicht-laden"), true);
  zeige($("teilnehmer-bereich"), false);
  zeige($("admin-bereich"), false);
  $("link-bereich-wechsel").textContent = istAdmin ? "Zur Teilnehmer-Seite" : "Admin-Bereich";
  $("link-bereich-wechsel").href = istAdmin ? "#" : "#admin";

  if (!istEingerichtet()) {
    zeige($("ansicht-laden"), false);
    zeige($("ansicht-nicht-eingerichtet"), true);
    return;
  }

  try {
    if (istAdmin) await ladeAdminSeite();
    else await ladeTeilnehmerSeite();
    zeige(istAdmin ? $("admin-bereich") : $("teilnehmer-bereich"), true);
  } catch (fehler) {
    zeigeMeldung($("meldung-global"), fehler.message);
  } finally {
    zeige($("ansicht-laden"), false);
  }
}

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#code=") || location.hash === "#admin" || location.hash === "" || location.hash === "#") {
    starte();
  }
});

starte();
