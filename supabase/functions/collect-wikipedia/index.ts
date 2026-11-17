import { withSupabase } from "npm:@supabase/server@1";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const { data: claimed, error: claimError } = await ctx.supabaseAdmin.rpc(
      "claim_collector_run",
      { p_cooldown_seconds: 90 },
    );

    if (claimError) {
      console.error("Collector lock failed:", claimError.message);
      return json({ status: "error", message: "Collector konnte nicht gestartet werden." }, 500);
    }
    if (!claimed) {
      return json({ status: "cooldown", message: "Ein Sammellauf wurde kürzlich gestartet." });
    }

    const { data: run, error: runError } = await ctx.supabaseAdmin
      .from("collector_runs")
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
        const { data, error } = await ctx.supabaseAdmin
          .from("articles")
          .upsert(rows, { onConflict: "source_url" })
          .select("id");
        if (error) throw error;
        saved = data?.length ?? rows.length;
      }

      await ctx.supabaseAdmin.from("collector_runs").update({
        status: "completed",
        saved_count: saved,
        message: rows.length ? "Wikipedia-Einleitungen importiert." : "Keine geeigneten Einträge in diesem Lauf gefunden.",
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);

      return json({ status: "completed", saved, source: "Wikipedia DE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      console.error("Wikipedia collector failed:", message);
      await ctx.supabaseAdmin.from("collector_runs").update({
        status: "failed",
        message: message.slice(0, 500),
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);
      return json({ status: "error", message: "Wikipedia-Import fehlgeschlagen." }, 502);
    }
  }),
};