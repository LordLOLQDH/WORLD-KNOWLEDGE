(() => {
  const config=window.WK_CONFIG||{},$=id=>document.getElementById(id);
  if(!config.SUPABASE_URL||!config.SUPABASE_PUBLISHABLE_KEY||!window.supabase){$("archive-items").innerHTML='<div class="empty-state">Supabase-Verbindung nicht eingerichtet.</div>';return;}
  const db=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
  let term="",offset=0,mediaFilter="all",categoryFilter="all";const pageSize=15;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date=s=>s?new Date(s).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}):"";
  const palette=["#d4a64d","#b85c4b","#527a9b","#688b65","#9b6d9b","#d0783f","#3f8790","#8e784b"];
  const categories=["Astronomie","Biologie","Chemie","Geographie","Geschichte","Gesellschaft","Informatik","Kunst","Literatur","Mathematik","Medizin","Musik","Naturwissenschaften","Philosophie","Physik","Politik","Religion","Sport","Sprache","Technik","Umwelt","Wirtschaft","Unsortiert"];
  categories.forEach(cat=>{const o=document.createElement("option");o.value=cat;o.textContent=cat;$("archive-category-filter").appendChild(o);});
  function applyFilters(q){
    if(categoryFilter!=="all")q=q.eq("category",categoryFilter);
    if(mediaFilter==="article")q=q.eq("media_type","article");
    else if(mediaFilter==="image")q=q.or("media_type.eq.image,image_url.not.is.null,thumbnail_url.not.is.null");
    else if(mediaFilter==="document")q=q.or("media_type.eq.document,media_type.eq.pdf,file_url.not.is.null");
    else if(mediaFilter==="video")q=q.eq("media_type","video");
    else if(mediaFilter==="audio")q=q.eq("media_type","audio");
    else if(mediaFilter==="data")q=q.eq("media_type","data");
    return q;
  }
  function renderModal(item,media,label,color){
    const modal=$("book-modal");modal.dataset.currentTitle=item.title||"";
    $("opened-book-category").textContent=(item.category||"Wissensgebiet")+" · "+label;
    $("opened-book-title").textContent=item.title||"Untitled";
    $("opened-book-cover-text").textContent=(item.extract||"Ein Fundstück aus dem wachsenden Wissensarchiv.").slice(0,210);
    $("opened-book-text").innerHTML=window.marked&&window.DOMPurify?window.DOMPurify.sanitize(window.marked.parse(item.extract||"Zu diesem Eintrag liegt kein längerer Text vor."),{USE_PROFILES:{html:true}}):"<p>"+esc(item.extract||"Zu diesem Eintrag liegt kein längerer Text vor.")+"</p>";
    $("opened-book-meta").textContent=[item.source_name||"Quelle unbekannt",item.author,item.license,date(item.collected_at)].filter(Boolean).join(" · ");
    $("opened-book-media").innerHTML="";
    const image=item.thumbnail_url||item.image_url;if(image){const im=document.createElement("img");im.className="opened-media-image";im.src=image;im.alt=item.title||"Archivbild";im.loading="lazy";$("opened-book-media").appendChild(im);}
    const links=$("opened-book-links");links.innerHTML="";
    if(item.source_url){const a=document.createElement("a");a.href=item.source_url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Originalquelle öffnen ↗";links.appendChild(a);}
    if(item.file_url){const a=document.createElement("a");a.href=item.file_url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=label==="PDF"?"PDF ansehen ↗":"Datei öffnen ↗";links.appendChild(a);}
    modal.style.setProperty("--book-color",color);modal.classList.add("is-open");modal.setAttribute("aria-hidden","false");document.body.classList.add("book-modal-open");
    setTimeout(()=>modal.querySelector(".book-report-trigger")?.focus(),400);
    const form=modal.querySelector(".book-report-form");form.classList.add("hidden");
    modal.querySelector(".book-report-trigger").onclick=()=>form.classList.toggle("hidden");
    modal.querySelector(".report-submit").onclick=async()=>{
      const desc=form.querySelector(".report-description").value.trim(),type=form.querySelector(".report-type").value,feedback=form.querySelector(".report-feedback"),send=form.querySelector(".report-submit");
      if(desc.length<10){feedback.textContent="Bitte beschreibe den Fehler etwas genauer.";return;}
      send.disabled=true;feedback.textContent="Meldung wird gesendet …";
      try{const {data,error}=await db.functions.invoke("world-knowledge-collector",{body:{action:"report",article_source_url:item.source_url,article_title:item.title,report_type:type,description:desc}});if(error)throw error;feedback.textContent=data?.message||"Meldung gesendet.";}
      catch(e){feedback.textContent="Meldung fehlgeschlagen. Bitte später erneut versuchen.";}finally{send.disabled=false;}
    };
  }
  function closeBook(){const modal=$("book-modal");modal.classList.remove("is-open");modal.setAttribute("aria-hidden","true");document.body.classList.remove("book-modal-open");}
  $("book-modal").querySelectorAll("[data-book-close]").forEach(el=>el.addEventListener("click",closeBook));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("book-modal").classList.contains("is-open"))closeBook();});
  async function load(append=false){
    const host=$("archive-items");
    if(!append){offset=0;host.innerHTML='<div class="empty-state"><div class="loader"></div>Regale werden durchgesehen …</div>';}
    let q=db.from("world_knowledge_articles").select("id,title,extract,source_url,source_name,collected_at,license,category,media_type,image_url,thumbnail_url,file_url,mime_type,author,metadata_json,review_status").eq("review_status","published").order("category",{ascending:true}).order("collected_at",{ascending:false});
    if(term)q=q.textSearch("search_vector",term,{type:"websearch",config:"german"});q=applyFilters(q);
    const {data,error}=await q.range(offset,offset+pageSize-1);
    if(error){host.innerHTML='<div class="empty-state">Archiv konnte nicht geladen werden.</div>';return;}
    if(!append)host.innerHTML="";
    if(!data?.length&&!append)host.innerHTML='<div class="empty-state">Keine Bücher zu diesem Filter gefunden.</div>';
    (data||[]).forEach((item,i)=>{
      const media=String(item.media_type||"article").toLowerCase(),label=({article:"Artikel",image:"Bild",document:"Dokument",pdf:"PDF",video:"Video",audio:"Audio",data:"Datensatz"})[media]||((item.mime_type||"").toLowerCase().includes("pdf")?"PDF":"Fundstück");
      const color=palette[(offset+i)%palette.length],title=item.title||"Untitled",short=(item.extract||"Ein Fundstück aus der Sammlung.").replace(/\s+/g," ").slice(0,145);
      const shelf=document.createElement("article");shelf.className="shelf-item";shelf.style.setProperty("--book-color",color);
      shelf.innerHTML='<button type="button" class="book-spine" aria-label="Buch öffnen: '+esc(title)+'"><span class="book-top-label">'+esc(item.category||"Wissen")+'</span><span class="book-title">'+esc(title)+'</span><span class="book-bottom-label">WORLD KNOWLEDGE</span></button><div class="shelf-shadow"></div>';
      shelf.querySelector(".book-spine").addEventListener("click",()=>renderModal(item,media,label,color));
      host.appendChild(shelf);
    });
    offset+=data?.length||0;$("archive-count").textContent=offset+" Bücher im Regal angezeigt";$("archive-more").classList.toggle("hidden",!data||data.length<pageSize);
  }
  $("archive-search-form").addEventListener("submit",e=>{e.preventDefault();term=$("archive-search").value.trim();load(false);});
  $("archive-media-filter").addEventListener("change",e=>{mediaFilter=e.target.value;load(false);});
  $("archive-category-filter").addEventListener("change",e=>{categoryFilter=e.target.value;load(false);});
  $("archive-filter-reset").addEventListener("click",()=>{mediaFilter="all";categoryFilter="all";term="";$("archive-search").value="";$("archive-media-filter").value="all";$("archive-category-filter").value="all";load(false);});
  $("archive-more").addEventListener("click",()=>load(true));load();
})();