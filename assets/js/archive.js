(() => {
  const config=window.WK_CONFIG||{},$=id=>document.getElementById(id);
  if(!config.SUPABASE_URL||!config.SUPABASE_PUBLISHABLE_KEY||!window.supabase){$("archive-items").innerHTML='<div class="empty-state">Supabase-Verbindung nicht eingerichtet.</div>';return;}
  const db=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
  let term="",offset=0;const pageSize=15;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date=s=>s?new Date(s).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"";
  async function load(append=false){
    const host=$("archive-items");
    if(!append){offset=0;host.innerHTML='<div class="empty-state"><div class="loader"></div>Archiv wird durchsucht …</div>';}
    let q=db.from("world_knowledge_articles").select("id,title,extract,source_url,source_name,collected_at,license,category,media_type,image_url,thumbnail_url,review_status").eq("review_status","published").order("category",{ascending:true}).order("collected_at",{ascending:false});
    if(term)q=q.textSearch("search_vector",term,{type:"websearch",config:"german"});
    const {data,error}=await q.range(offset,offset+pageSize-1);
    if(error){host.innerHTML='<div class="empty-state">Archiv konnte nicht geladen werden.</div>';return;}
    if(!append)host.innerHTML="";
    if(!data?.length&&!append)host.innerHTML='<div class="empty-state">Keine Einträge gefunden.</div>';
    (data||[]).forEach(item=>{
      const card=document.createElement("article");card.className="archive-card";
      const img=item.thumbnail_url||item.image_url;
      card.innerHTML='<div class="archive-card-kicker">'+esc(item.category||"Unsortiert")+' · '+esc(date(item.collected_at))+'</div>'+(img?'<img class="archive-media" loading="lazy" src="'+esc(img)+'" alt="'+esc(item.title)+'">':'')+'<h2>'+esc(item.title)+'</h2>'+(item.extract?'<p class="archive-extract">'+esc(item.extract)+'</p>':'')+'<div class="archive-card-foot"><span>'+esc(item.source_name||"Quelle")+' · '+esc(item.license||"")+'</span>'+(item.source_url?'<a href="'+esc(item.source_url)+'" target="_blank" rel="noopener noreferrer">Originalquelle</a>':'')+'</div><button type="button" class="report-button">Fehler melden</button><div class="report-form hidden"><label>Grund der Meldung</label><select class="report-type"><option value="wrong">Falsche Information</option><option value="fake">Fälschung</option><option value="misinformation">Desinformation</option><option value="source_issue">Quellenproblem</option><option value="other">Sonstiges</option></select><label>Was ist falsch? Bitte kurz begründen.</label><textarea class="report-description" minlength="10" maxlength="1200" placeholder="Beschreibung des Problems (mindestens 10 Zeichen)"></textarea><button class="report-submit" type="button">Meldung senden</button><div class="report-feedback"></div></div>';
      host.appendChild(card);
      const toggle=card.querySelector(".report-button"),form=card.querySelector(".report-form"),send=card.querySelector(".report-submit");
      toggle.addEventListener("click",()=>form.classList.toggle("hidden"));
      send.addEventListener("click",async()=>{
        const desc=card.querySelector(".report-description").value.trim(),type=card.querySelector(".report-type").value,feedback=card.querySelector(".report-feedback");
        if(desc.length<10){feedback.textContent="Bitte beschreibe den Fehler etwas genauer.";return;}
        send.disabled=true;feedback.textContent="Meldung wird geprüft …";
        try{const {data,error}=await db.functions.invoke("world-knowledge-collector",{body:{action:"report",article_source_url:item.source_url,article_title:item.title,report_type:type,description:desc}});
          if(error)throw error;feedback.textContent=data?.message||"Meldung gesendet";
        }catch(e){feedback.textContent="Meldung fehlgeschlagen. Bitte später erneut versuchen.";}finally{send.disabled=false;}
      });
    });
    offset+=data?.length||0;$("archive-count").textContent=offset+" Einträge angezeigt";$("archive-more").classList.toggle("hidden",!data||data.length<pageSize);
  }
  $("archive-search-form").addEventListener("submit",e=>{e.preventDefault();term=$("archive-search").value.trim();load(false);});
  $("archive-more").addEventListener("click",()=>load(true));load();
})();