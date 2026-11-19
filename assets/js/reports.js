(() => {
 const cfg=window.WK_CONFIG||{},$=id=>document.getElementById(id);
 if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY||!window.supabase){$("review-log").innerHTML='<div class="empty-state">Supabase nicht konfiguriert.</div>';return;}
 const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const dt=s=>s?new Date(s).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"";
 async function load(){const {data,error}=await db.from("world_knowledge_review_logs").select("article_title,decision,summary,sources,created_at").order("created_at",{ascending:false}).limit(100);
 if(error){$("review-log").innerHTML='<div class="empty-state">Prüfprotokoll konnte nicht geladen werden.</div>';return;}
 if(!data?.length){$("review-log").innerHTML='<div class="empty-state">Noch keine abgeschlossenen Prüfungen.</div>';return;}
 $("review-log").innerHTML=data.map(x=>'<article class="review-log-card"><div class="archive-card-kicker">'+esc(dt(x.created_at))+' · '+esc(x.decision)+'</div><h2>'+esc(x.article_title)+'</h2><p>'+esc(x.summary)+'</p><div class="review-links">'+(x.sources||[]).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||s.url)+'</a>').join("")+'</div></article>').join("");
 }load();
})();