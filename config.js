// =========================================================
// Verbindung zur Supabase-Datenbank
//
// Beide Werte findest du im Supabase-Dashboard unter
// "Project Settings" → "API" (bzw. "Data API" und "API Keys").
// Der "anon"/"publishable" Schlüssel darf öffentlich sein: Er erlaubt nur
// die geschützten Wichtel-Funktionen, kein direktes Lesen der Daten.
// Den "service_role"/"secret" Schlüssel hier NIEMALS eintragen!
// =========================================================

window.WICHTEL_CONFIG = {
  supabaseUrl: "https://xqsnibckhwrnzsiizell.supabase.co/rest/v1/", // z. B. "https://abcdefghijkl.supabase.co"
  supabaseKey: "sb_publishable_IwSHraekr1_MNz9oQ0yq8Q_wwqxytNX", // z. B. "sb_publishable_..." oder "eyJhbGciOi..."
};
