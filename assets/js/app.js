(() => {
  const config = window.WK_CONFIG || {};
  const configured = config.SUPABASE_URL && !config.SUPABASE_URL.includes("YOUR_PROJECT_REF")
    && config.SUPABASE_PUBLISHABLE_KEY && !config.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
  const $ = (id) => document.getElementById(id);
  let client = null;
  let currentOffset = 0;
  let activeSearch = "";
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
      if (!append) host.innerHTML = '<div class="empty-state">Keine passenden Artikel gefunden.</div>';
      return;
    }
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "article-card";
      card.innerHTML = '<h3>' + escapeHtml(row.title) + '</h3><p>' + escapeHtml(row.extract || "Keine Einleitung verfügbar.") + '</p><div class="article-meta"><span>' + escapeHtml(row.source_name || "Wikipedia") + ' · ' + escapeHtml(dateLabel(row.collected_at)) + '</span><a href="' + escapeHtml(row.source_url) + '" target="_blank" rel="noopener noreferrer">Originalquelle ↗</a></div>';
      host.appendChild(card);
    });
    $("result-count").textContent = rows.length + " Einträge angezeigt";
  }
  function renderAnswer(answer, aiStatus, origin, saved) {
    const panel = $("ai-result");
    panel.classList.remove("hidden");
    const sourceLabel = origin === "wikipedia"
      ? (saved + " neue Wikipedia-Einträge gespeichert")
      : origin === "archive" ? "Aus dem gespeicherten Archiv" : "Keine passenden Wikipedia-Einträge";
    $("ai-source").textContent = sourceLabel;
    if (answer) {
      $("ai-answer-text").textContent = answer;
      $("ai-answer-note").textContent = "KI-Antwort von Groq · anhand der angezeigten Quellen";
    } else {
      $("ai-answer-text").textContent = aiStatus === "rate_limited"
        ? "Du hast gerade erst eine KI-Anfrage gestellt. Bitte warte einige Sekunden."
        : aiStatus === "groq_key_missing"
          ? "Die Wissenssuche funktioniert, aber GROQ_API_KEY ist in Supabase nicht verfügbar."
          : aiStatus === "groq_rate_limited"
            ? "Groq hat die Anfrage wegen eines API-Limits abgelehnt. Die Quellen bleiben verfügbar."
            : "Zu dieser Suche konnte keine KI-Antwort erstellt werden. Die gefundenen Quellen werden trotzdem angezeigt.";
      $("ai-answer-note").textContent = "KI-Antwort momentan nicht verfügbar";
    }
  }
  async function loadArticles(searchTerm = "", append = false) {
    if (!client) return;
    let query = client.from("world_knowledge_articles").select("id,title,extract,source_url,collected_at,source_name").order("collected_at", {ascending:false});
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
    $("results-heading").textContent = searchTerm ? "Suchergebnisse im Archiv" : "Zuletzt gesammeltes Wissen";
  }
  async function loadStats() {
    if (!client) return;
    const [{count}, {data}] = await Promise.all([
      client.from("world_knowledge_articles").select("*", {count:"exact",head:true}),
      client.from("world_knowledge_collector_runs").select("finished_at").eq("status","completed").order("finished_at",{ascending:false}).limit(1)
    ]);
    $("article-count").textContent = Number(count || 0).toLocaleString("de-DE");
    $("last-run").textContent = data && data[0] ? dateLabel(data[0].finished_at) : "Noch nicht";
  }
  async function errorMessage(error) {
    let message = error?.message || "Unbekannter Fehler";
    if (error?.context && typeof error.context.json === "function") {
      try {
        const payload = await error.context.json();
        message = payload.message || payload.detail || message;
      } catch {}
    }
    return message;
  }
  async function runSearch(term) {
    if (!client) return;
    activeSearch = term;
    currentOffset = 0;
    $("search-submit").disabled = true;
    $("search-submit").textContent = "Suche …";
    $("results-heading").textContent = "Suche läuft …";
    $("articles").innerHTML = '<div class="empty-state"><div class="loader"></div><p>Archiv wird durchsucht. Falls nichts gespeichert ist, wird Wikipedia abgefragt.</p></div>';
    $("ai-result").classList.add("hidden");
    try {
      const {data, error} = await client.functions.invoke("world-knowledge-collector", {
        body: {action:"search", query:term}
      });
      if (error) throw new Error(await errorMessage(error));
      if (!data || data.status !== "completed") throw new Error(data?.message || "Die Suche wurde nicht abgeschlossen.");
      renderArticles(data.articles || []);
      $("results-heading").textContent = data.origin === "wikipedia"
        ? "Neu aus Wikipedia übernommen"
        : data.origin === "not_found" ? "Keine Treffer gefunden" : "Suchergebnisse im Archiv";
      $("load-more").classList.add("hidden");
      renderAnswer(data.answer, data.ai_status, data.origin, data.saved || 0);
      await loadStats();
    } catch (error) {
      console.error("WORLD KNOWLEDGE search:", error);
      $("articles").innerHTML = '<div class="empty-state">Suche fehlgeschlagen: ' + escapeHtml(error.message || "Unbekannter Fehler") + '</div>';
      $("results-heading").textContent = "Suche nicht möglich";
    } finally {
      $("search-submit").disabled = false;
      $("search-submit").textContent = "Suchen";
    }
  }
  async function runCollector(manual = false) {
    if (!client) return setStatus("Supabase ist noch nicht eingerichtet.", "");
    $("collect-button").disabled = true;
    $("collect-button").textContent = "Sammle Wissen …";
    setStatus("Prüfe, ob ein Sammellauf möglich ist …", "busy");
    try {
      const {data, error} = await client.functions.invoke("world-knowledge-collector", {body:{action:"collect"}});
      if (error) throw new Error(await errorMessage(error));
      if (data && data.status === "cooldown") {
        setStatus("Die Sammlung wurde gerade erst aktualisiert. Der nächste Lauf folgt später.", "online");
      } else if (data && data.status === "completed") {
        setStatus((data.saved || 0) + " Wikipedia-Einträge verarbeitet.", "online");
      } else {
        throw new Error((data && data.message) || "Sammellauf konnte nicht abgeschlossen werden.");
      }
      await Promise.all([loadArticles(activeSearch, false), loadStats()]);
    } catch (error) {
      console.error("WORLD KNOWLEDGE collector:", error);
      setStatus("Sammellauf fehlgeschlagen: " + (error.message || "Unbekannter Fehler"), "");
    } finally {
      $("collect-button").disabled = false;
      $("collect-button").textContent = manual ? "Sammlung fortsetzen" : "Jetzt sammeln";
    }
  }

  $("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const term = $("search-input").value.trim();
    if (!term) {
      activeSearch = "";
      $("ai-result").classList.add("hidden");
      currentOffset = 0;
      return loadArticles("", false);
    }
    await runSearch(term);
    $("sammlung").scrollIntoView({behavior:"smooth"});
  });
  $("load-more").addEventListener("click", () => loadArticles(activeSearch, true));
  $("collect-button").addEventListener("click", () => runCollector(true));

  if (!configured || !window.supabase) {
    setStatus("Einrichtung ausstehend: Supabase-Projekt und Publishable Key eintragen.", "");
    $("articles").innerHTML = '<div class="empty-state">WORLD KNOWLEDGE ist vorbereitet. Trage zuerst die Supabase-Projekt-URL und den Publishable Key in assets/js/config.js ein und führe anschließend schema.sql aus.</div>';
    $("collect-button").disabled = true;
    return;
  }

  client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  setStatus("Verbunden. Prüfe Wissensdatenbank …", "online");
  Promise.all([loadArticles(), loadStats()]).then(() => runCollector(false));
})();
