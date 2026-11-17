import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ status: "error", message: "Server-Konfiguration fehlt." }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: claimed, error: claimError } = await admin.rpc(
    "world_knowledge_claim_collector_run",
    { p_cooldown_seconds: 90 },
  );
  if (claimError) {
    console.error("Collector lock failed:", claimError.message);
    return json({ status: "error", message: "Collector konnte nicht gestartet werden." }, 500);
  }
  if (!claimed) return json({ status: "cooldown", message: "Ein Sammellauf wurde kürzlich gestartet." });

  const { data: run, error: runError } = await admin
    .from("world_knowledge_collector_runs")
    .insert({ source_name: "Wikipedia DE", status: "running" })
    .select("id")
    .single();
  if (runError) {
    console.error("Run log failed:", runError.message);
    return json({ status: "error", message: "Laufprotokoll konnte nicht angelegt werden." }, 500);
  }

  try {
    const endpoint = new URL("https://de.wikipedia.org/w/api.php");
    endpoint.search = new URLSearchParams({
      action: "query",
      generator: "random",
      grnnamespace: "0",
      grnlimit: "5",
      prop: "extracts|info",
      exintro: "1",
      explaintext: "1",
      inprop: "url",
      format: "json",
      formatversion: "2",
    }).toString();

    const response = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "WORLD-KNOWLEDGE/0.1 (open knowledge archive)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Wikipedia API antwortete mit HTTP " + response.status);

    const payload = await response.json();
    const pages = payload?.query?.pages ?? [];
    const rows = pages
      .filter((page: any) => page && page.title && page.extract && page.fullurl)
      .map((page: any) => ({
        title: String(page.title).slice(0, 500),
        extract: String(page.extract).slice(0, 20000),
        source_name: "Wikipedia",
        source_language: "de",
        source_url: String(page.fullurl),
        license: "CC BY-SA 4.0",
        license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
        collected_at: new Date().toISOString(),
      }));

    let saved = 0;
    if (rows.length) {
      const { data, error } = await admin
        .from("world_knowledge_articles")
        .upsert(rows, { onConflict: "source_url" })
        .select("id");
      if (error) throw error;
      saved = data?.length ?? rows.length;
    }

    await admin.from("world_knowledge_collector_runs").update({
      status: "completed",
      saved_count: saved,
      message: rows.length ? "Wikipedia-Einleitungen importiert." : "Keine geeigneten Einträge in diesem Lauf gefunden.",
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    await admin.rpc("world_knowledge_add_saved_count", { p_saved: saved });

    return json({ status: "completed", saved, source: "Wikipedia DE" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("Wikipedia collector failed:", message);
    await admin.from("world_knowledge_collector_runs").update({
      status: "failed",
      message: message.slice(0, 500),
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    return json({ status: "error", message: "Wikipedia-Import fehlgeschlagen." }, 502);
  }
});
