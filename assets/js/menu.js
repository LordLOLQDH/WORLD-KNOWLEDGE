(() => {
 const button=document.getElementById("menu-toggle"),panel=document.getElementById("site-menu-panel");
 if(!button||!panel)return;
 const close=()=>{panel.hidden=true;button.setAttribute("aria-expanded","false");};
 button.addEventListener("click",()=>{const open=panel.hidden;panel.hidden=!open;button.setAttribute("aria-expanded",String(open));});
 document.addEventListener("click",event=>{if(!event.target.closest(".site-menu"))close();});
 document.addEventListener("keydown",event=>{if(event.key==="Escape")close();});
 panel.querySelectorAll("a").forEach(a=>a.addEventListener("click",close));
})();