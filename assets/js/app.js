(() => {
  const config = window.WK_CONFIG || {};
  const configured = config.SUPABASE_URL && !config.SUPABASE_URL.includes("YOUR_PROJECT_REF")
    && config.SUPABASE_PUBLISHABLE_KEY && !config.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
  const $ = (id) => document.getElementById(id);
  let client = null;
  let collectorTimer = null;
  let collectorRunning = false;
  let continuousMode = false;
  const COLLECTOR_INTERVAL = 0;
  let displayedCount = 0;
  let countAnimation = null;
  let targetCount = 0;
  let statsLoading = false;

  function setStatus(message, state = "") {
    $("collector-status").textContent = message;
    $("status-dot").className = "status-dot" + (state ? " " + state : "");
  }
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function dateLabel(value) {
    if (!value) return "Unbekannt";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unbekannt" : date.toLocaleString("de-DE", {dateStyle:"medium",timeStyle:"short"});
  }
  function renderMarkdown(markdown) {
    if (!markdown) return "<p>Keine Antwort verfügbar.</p>";
    if (!window.marked || !window.DOMPurify) {
      return "<p>" + escapeHtml(markdown).replace(/\n/g, "<br>") + "</p>";
    }
    const html = window.marked.parse(String(markdown), {gfm:true, breaks:true});
    return window.DOMPurify.sanitize(html, {
      USE_PROFILES:{html:true},
      ADD_ATTR:["target","rel"]
    });
  }
  function renderAnswer(answer, aiStatus, origin, saved, articles) {
    $("ai-result").classList.remove("hidden");
    $("ai-source").textContent = origin === "wikipedia"
      ? saved + " neue Wikipedia-Einträge gespeichert"
      : origin === "archive" ? "Antwort anhand des Archivs" : "Keine Wikipedia-Treffer";
    $("ai-answer-text").innerHTML = renderMarkdown(answer || (
      aiStatus === "rate_limited" ? "Du hast gerade erst eine KI-Anfrage gestellt. Bitte warte einige Sekunden."
      : aiStatus === "groq_key_missing" ? "GROQ_API_KEY ist in Supabase nicht verfügbar."
      : aiStatus === "groq_rate_limited" ? "Groq hat die Anfrage wegen eines API-Limits abgelehnt. Die Quellen bleiben verfügbar."
      : "Zu dieser Suche konnte keine KI-Antwort erstellt werden. Die Quellen bleiben im Archiv verfügbar."
    ));
    $("ai-answer-note").textContent = answer
      ? "KI-Antwort · gespeichert im Archiv · Quellenbasierte Antwort"
      : "KI-Antwort momentan nicht verfügbar";
    const sources = $("ai-sources");
    sources.innerHTML = "";
    (articles || []).slice(0,5).forEach((article) => {
      const link = document.createElement("a");
      link.href = article.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = article.title;
      sources.appendChild(link);
    });
    $("ai-sources-wrap").classList.toggle("hidden", !articles || !articles.length);
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
  async function loadStats() {
    if (!client || statsLoading) return;
    statsLoading = true;
    try {
      const [{count:articles}, {data:runs}] = await Promise.all([
        client.from("world_knowledge_articles").select("*",{count:"exact",head:true}),
        client.from("world_knowledge_collector_runs").select("finished_at").eq("status","completed").order("finished_at",{ascending:false}).limit(1)
      ]);
      const actualCount = Number(articles || 0);
      targetCount = actualCount;
      if (!countAnimation && displayedCount !== targetCount) {
        countAnimation = setInterval(() => {
          displayedCount = displayedCount < targetCount
            ? Math.min(targetCount, displayedCount + 1)
            : Math.max(targetCount, displayedCount - 1);
          $("article-count").textContent = displayedCount.toLocaleString("de-DE");
          $("article-count").dataset.value = String(displayedCount);
          if (displayedCount === targetCount) {
            clearInterval(countAnimation);
            countAnimation = null;
          }
        }, 35);
      }
      if(runs) $("last-run").textContent = runs[0] ? dateLabel(runs[0].finished_at) : "Noch nicht";
    } catch(error) {
      console.warn("Stats refresh failed:", error);
    } finally {
      statsLoading = false;
    }
  }
  async function runSearch(term) {
    $("search-submit").disabled = true;
    $("search-submit").textContent = "Suche …";
    $("ai-result").classList.add("hidden");
    $("ai-loading").classList.remove("hidden");
    try {
      const {data,error} = await client.functions.invoke("world-knowledge-collector",{
        body:{action:"search",query:term}
      });
      if(error) throw new Error(await errorMessage(error));
      if(!data || data.status!=="completed") throw new Error(data?.message || "Die Suche wurde nicht abgeschlossen.");
      renderAnswer(data.answer,data.ai_status,data.origin,data.saved || 0,data.articles || []);
      await loadStats();
    } catch(error) {
      $("ai-result").classList.remove("hidden");
      $("ai-answer-text").textContent = "Suche fehlgeschlagen: " + (error.message || "Unbekannter Fehler");
      $("ai-answer-note").textContent = "Die Anfrage konnte nicht verarbeitet werden.";
      $("ai-source").textContent = "Fehler";
      $("ai-sources-wrap").classList.add("hidden");
    } finally {
      $("ai-loading").classList.add("hidden");
      $("search-submit").disabled = false;
      $("search-submit").textContent = "Fragen";
    }
  }
  function scheduleCollector(delay = COLLECTOR_INTERVAL) {
    clearTimeout(collectorTimer);
    if(document.visibilityState !== "visible") return;
    collectorTimer = setTimeout(() => runCollector(false), delay);
  }
  async function runCollector(manual = false) {
    if(!client || collectorRunning || document.visibilityState !== "visible") return;
    collectorRunning = true;
    if(manual) $("collect-button").disabled = true;
    setStatus("Wissenssammlung läuft …","busy");
    let nextDelay = COLLECTOR_INTERVAL;
    try {
      const {data,error} = await client.functions.invoke("world-knowledge-collector",{body:{action:"collect"}});
      if(error) throw new Error(await errorMessage(error));
      if(data?.status === "cooldown") {
        const seconds = Math.max(1, Number(data.retry_after_seconds || 2));
        nextDelay = seconds * 1000;
        setStatus("Sammelt Wissen …","busy");
      } else if(data?.status === "completed") {
        setStatus("+" + Number(data.saved||0) + " neu · " + Number(data.processed||0) + " verarbeitet · " + String(data.category||"Thema") + " · sammelt weiter","busy");
        await loadStats();
      } else {
        throw new Error(data?.message || "Sammellauf fehlgeschlagen.");
      }
    } catch(error) {
      setStatus("Sammelt Wissen …","busy");
      nextDelay = 1000;
    } finally {
      collectorRunning = false;
      if(manual) $("collect-button").disabled = false;
      $("collect-button").textContent = continuousMode ? "Sammlung stoppen" : "Sammlung starten";
      $("collect-button").classList.toggle("is-running", continuousMode);
      if(continuousMode) scheduleCollector(nextDelay);
    }
  }

  $("search-form").addEventListener("submit",async(event)=>{
    event.preventDefault();
    const term=$("search-input").value.trim();
    if(term.length<2) return;
    await runSearch(term);
    $("ai-result").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("collect-button").addEventListener("click",()=>{
    continuousMode = !continuousMode;
    $("collect-button").textContent = continuousMode ? "Sammlung stoppen" : "Sammlung starten";
    $("collect-button").classList.toggle("is-running", continuousMode);
    if(continuousMode) {
      setStatus("Sammelt Wissen …","busy");
      runCollector(true);
    } else {
      clearTimeout(collectorTimer);
      setStatus("Sammlung angehalten. Bisherige Einträge bleiben gespeichert.","online");
    }
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible" && client && continuousMode && !collectorRunning) runCollector(false);
    else if(document.visibilityState!=="visible") clearTimeout(collectorTimer);
  });

  if(!configured || !window.supabase) {
    setStatus("Supabase-Einrichtung ausstehend.","");
    $("collect-button").disabled=true;
    return;
  }
  client=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
  setStatus("Verbunden. Sammlung ist bereit. Klicke auf „Sammlung starten“.","online");
  $("collect-button").textContent = "Sammlung starten";
  loadStats();
  setInterval(() => { if(continuousMode) loadStats(); }, 2500);
})();