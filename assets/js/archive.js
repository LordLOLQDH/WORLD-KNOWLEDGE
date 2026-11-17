(() => {
  const config=window.WK_CONFIG||{};
  const configured=config.SUPABASE_URL&&config.SUPABASE_PUBLISHABLE_KEY;
  const $=id=>document.getElementById(id);
  if(!configured||!window.supabase){$("archive-items").innerHTML='<div class="empty-state">Supabase-Verbindung nicht eingerichtet.</div>';return;}
  const db=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
  let tab="articles",term="",offset=0;
  const pageSize=15;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date=s=>s?new Date(s).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"";
  const md=s=>window.marked&&window.DOMPurify?window.DOMPurify.sanitize(window.marked.parse(String(s||""),{gfm:true,breaks:true}),{USE_PROFILES:{html:true}}):"<p>"+esc(s)+"</p>";
  async function load(append=false){
    const host=$("archive-items");
    if(!append){offset=0;host.innerHTML='<div class="empty-state"><div class="loader"></div>Archiv wird durchsucht …</div>';}
    let query;
    if(tab==="articles"){
      query=db.from("world_knowledge_articles").select("id,title,extract,source_url,source_name,collected_at,license").order("collected_at",{ascending:false});
      if(term) query=query.textSearch("search_vector",term,{type:"websearch",config:"german"});
    }else{
      query=db.from("world_knowledge_queries").select("id,question,answer,ai_status,origin,source_articles,created_at").order("created_at",{ascending:false});
      if(term) query=query.ilike("question","%"+term+"%");
    }
    const {data,error}=await query.range(offset,offset+pageSize-1);
    if(error){host.innerHTML='<div class="empty-state">Archiv konnte nicht geladen werden: '+esc(error.message)+'</div>';return;}
    if(!append)host.innerHTML="";
    if(!data?.length&&!append){host.innerHTML='<div class="empty-state">Keine Einträge gefunden.</div>';}
    (data||[]).forEach(item=>{
      const card=document.createElement("article");
      card.className="archive-card";
      if(tab==="articles"){
        card.innerHTML='<div class="archive-card-kicker">WISSENSARTIKEL · '+esc(date(item.collected_at))+'</div><h2>'+esc(item.title)+'</h2><p class="archive-extract">'+esc(item.extract||"Keine Einleitung gespeichert.")+'</p><div class="archive-card-foot"><span>'+esc(item.source_name||"Wikipedia")+' · '+esc(item.license||"")+'</span><a href="'+esc(item.source_url)+'" target="_blank" rel="noopener noreferrer">Originalquelle ↗</a></div>';
      }else{
        const sourceLinks=(item.source_articles||[]).map(s=>'<a href="'+esc(s.source_url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+' ↗</a>').join("");
        card.innerHTML='<div class="archive-card-kicker">GESPEICHERTE FRAGE · '+esc(date(item.created_at))+'</div><h2>'+esc(item.question)+'</h2><div class="markdown-content archive-answer">'+md(item.answer||"Keine KI-Antwort gespeichert.")+'</div><div class="archive-card-foot"><span>'+esc(item.ai_status||"")+' · '+esc(item.origin||"")+'</span><span>'+sourceLinks+'</span></div>';
      }
      host.appendChild(card);
    });
    offset+=data?.length||0;
    $("archive-count").textContent=offset+" Einträge angezeigt";
    $("archive-more").classList.toggle("hidden",!data||data.length<pageSize);
    $("archive-status").textContent=error?"Fehler":"";
  }
  $("archive-search-form").addEventListener("submit",e=>{e.preventDefault();term=$("archive-search").value.trim();load(false);});
  $("archive-more").addEventListener("click",()=>load(true));
  document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{
    tab=button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b===button));
    load(false);
  }));
  load(false);
})();