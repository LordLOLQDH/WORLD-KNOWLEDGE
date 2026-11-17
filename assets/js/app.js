(() => {
  const config = window.WK_CONFIG || {};
  const configured = config.SUPABASE_URL && !config.SUPABASE_URL.includes("YOUR_PROJECT_REF")
    && config.SUPABASE_PUBLISHABLE_KEY && !config.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
  const $ = (id) => document.getElementById(id);
  let client = null;
  let currentOffset = 0;
  const PAGE_SIZE = 8;

  function setStatus(message, state = "") {
    $("collector-status").textContent = message;
    $("status-dot").className = "status-dot" + (state ? " " + state : "");
  }
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function dateLabel(value) {
    if (!value) return "Noch kein Import";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unbekannt" : date.toLocaleString("de-DE", {dateStyle:"short",timeStyle:"short"});
  }
  function renderArticles(rows, append = false) {
    const host = $("articles");
    if (!append) host.innerHTML = "";
    if (!rows || !rows.length) {
      if (!append) host.innerHTML = '<div class="empty-state">Noch keine Artikel gespeichert. Sobald Supabase eingerichtet ist, kann die Sammlung starten.</div>';
      return;
    }
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "article-card";
      card.innerHTML = '<h3>' + escapeHtml(row.title) + '</h3><p>' + escapeHtml(row.extract || "Keine Einleitung verfügbar.") + '</p><div class="article-meta"><span>Wikipedia · ' + escapeHtml(dateLabel(row.collected_at)) + '</span><a href="' + escapeHtml(row.source_url) + '" target="_blank" rel="noopener noreferrer">Originalquelle ↗</a></div>';
      host.appendChild(card);
    });
    $("result-count").textContent = rows.length + " Einträge angezeigt";
  }
  async function loadArticles(searchTerm = "", append = false) {
    if (!client) return;
    let query = client.from("articles").select("id,title,extract,source_url,collected_at").order("collected_at", {ascending:false});
    if (searchTerm) query = query.textSearch("search_vector", searchTerm, {type:"websearch", config:"german"});
    const from = append ? currentOffset : 0;
    const {data, error} = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!append) $("articles").innerHTML = '<div class="empty-state">Die Wissensdatenbank konnte nicht geladen werden. Prüfe das Supabase-Schema.</div>';
      console.error(error);
      return;
    }
    currentOffset = from + (data || []).length;
    renderArticles(data, append);
    $("load-more").classList.toggle("hidden", !data || data.length < PAGE_SIZE);
    $("results-heading").textContent = searchTerm ? "Suchergebnisse" : "Zuletzt gesammeltes Wissen";
  }
  async function loadStats() {
    if (!client) return;
    const [{count}, {data}] = await Promise.all([
      client.from("articles").select("*", {count:"exact",head:true}),
      client.from("collector_runs").select("finished_at").eq("status","completed").order("finished_at",{ascending:false}).limit(1)
    ]);
    $("article-count").textContent = Number(count || 0).toLocaleString("de-DE");
    $("last-run").textContent = data && data[0] ? dateLabel(data[0].finished_at) : "Noch nicht";
  }
  async function runCollector(manual = false) {
    if (!client) return setStatus("Supabase ist noch nicht eingerichtet.", "");
    $("collect-button").disabled = true;
    $("collect-button").textContent = "Sammle Wissen …";
    setStatus("Prüfe, ob ein Sammellauf möglich ist …", "busy");
    try {
      const {data, error} = await client.functions.invoke("collect-wikipedia", {body:{source:"wikipedia-de"}});
      if (error) throw error;
      if (data && data.status === "cooldown") {
        setStatus("Die Sammlung wurde gerade erst aktualisiert. Der nächste Lauf folgt später.", "online");
      } else if (data && data.status === "completed") {
        setStatus((data.saved || 0) + " Wikipedia-Einträge verarbeitet.", "online");
      } else {
        setStatus((data && data.message) || "Sammellauf beendet.", "online");
      }
      await Promise.all([loadArticles("", false), loadStats()]);
    } catch (error) {
      console.error(error);
      setStatus("Sammellauf nicht möglich. Supabase-Funktion oder Schlüssel prüfen.", "");
    } finally {
      $("collect-button").disabled = false;
      $("collect-button").textContent = manual ? "Sammlung fortsetzen" : "Jetzt sammeln";
    }
  }

  $("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const term = $("search-input").value.trim();
    if (!term) return loadArticles("", false);
    currentOffset = 0;
    await loadArticles(term, false);
    $("sammlung").scrollIntoView({behavior:"smooth"});
  });
  $("load-more").addEventListener("click", () => loadArticles($("search-input").value.trim(), true));
  $("collect-button").addEventListener("click", () => runCollector(true));

  if (!configured || !window.supabase) {
    setStatus("Einrichtung ausstehend: Supabase-Projekt und Publishable Key eintragen.", "");
    $("articles").innerHTML = '<div class="empty-state">WORLD KNOWLEDGE ist vorbereitet. Trage zuerst die Supabase-Projekt-URL und den Publishable Key in assets/js/config.js ein und führe anschließend schema.sql aus.</div>';
    $("collect-button").disabled = true;
    return;
  }

  client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  setStatus("Verbunden. Prüfe Wissensdatenbank …", "online");
  Promise.all([loadArticles(), loadStats()]).then(() => {
    // A visit can request a small, globally rate-limited collection run.
    runCollector(false);
  });
})();