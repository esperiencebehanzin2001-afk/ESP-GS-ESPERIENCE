
let TOKEN = localStorage.getItem("espgs_dg_token") || "";
let REFRESH = localStorage.getItem("espgs_dg_refresh") || "";
let businessId = null;
let currentPeriod = "daily";
const API = location.origin; // ce fichier est servi par le même serveur que l'API

async function api(path, opts={}, retry=true){
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type":"application/json", ...(TOKEN?{Authorization:"Bearer "+TOKEN}:{}), ...(opts.headers||{}) }
  });
  if(res.status === 401 && retry && REFRESH){
    try{
      const r = await fetch(API + "/auth/refresh", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({refreshToken:REFRESH})});
      if(r.ok){
        const d = await r.json();
        TOKEN = d.accessToken; localStorage.setItem("espgs_dg_token", TOKEN);
        return api(path, opts, false);
      }
    }catch(e){}
    logout();
    throw new Error("Session expirée, reconnectez-vous.");
  }
  const body = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error || ("Erreur "+res.status));
  return body;
}

function logout(){
  TOKEN=""; REFRESH="";
  localStorage.removeItem("espgs_dg_token");
  localStorage.removeItem("espgs_dg_refresh");
  document.getElementById("dashBox").classList.add("hidden");
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("logoutLink").classList.add("hidden");
}
document.getElementById("logoutLink").addEventListener("click", logout);

document.getElementById("btnLogin").addEventListener("click", async ()=>{
  const errBox = document.getElementById("loginErr");
  errBox.textContent = "";
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value;
  if(!username || !password){ errBox.textContent = "Tous les champs sont requis."; return; }
  try{
    const r = await api("/auth/login", {method:"POST", body: JSON.stringify({username, password})});
    if(r.user.role === "mere"){ errBox.textContent = "Ce compte est un compte administrateur : utilisez la console mère plutôt que cette page."; return; }
    if(!r.user.businessId){ errBox.textContent = "Ce compte n'est rattaché à aucune entreprise."; return; }
    TOKEN = r.accessToken; REFRESH = r.refreshToken;
    localStorage.setItem("espgs_dg_token", TOKEN);
    localStorage.setItem("espgs_dg_refresh", REFRESH);
    await afterLogin();
  }catch(e){ errBox.textContent = e.message; }
});
document.getElementById("loginPass").addEventListener("keydown", (e)=>{ if(e.key==="Enter") document.getElementById("btnLogin").click(); });

async function afterLogin(){
  const me = await api("/auth/me");
  businessId = me.businessId;
  document.getElementById("bizName").textContent = (me.business && me.business.name) || "Mon entreprise";
  const statusLabel = me.business && me.business.status === "suspended" ? "⚠ Compte suspendu" :
    (me.business && me.business.last_seen_at ? "Dernière activité : " + me.business.last_seen_at : "Aucune activité enregistrée pour l'instant");
  document.getElementById("bizStatus").textContent = statusLabel;
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("dashBox").classList.remove("hidden");
  document.getElementById("logoutLink").classList.remove("hidden");
  await loadReport();
}

document.querySelectorAll(".period-switch button").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".period-switch button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentPeriod = btn.dataset.period;
    loadReport();
  });
});
document.getElementById("btnRefresh").addEventListener("click", loadReport);

async function loadReport(){
  const grid = document.getElementById("statGrid");
  grid.innerHTML = `<div class="stat"><div class="num">…</div><div class="lbl">Chargement</div></div>`;
  try{
    const r = await api(`/reports/${businessId}/${currentPeriod}`);
    grid.innerHTML = `
      <div class="stat"><div class="num">${r.ventes.nombre}</div><div class="lbl">Ventes</div></div>
      <div class="stat"><div class="num">${Number(r.ventes.montantTotal).toLocaleString('fr-FR')}</div><div class="lbl">Chiffre d'affaires (FCFA)</div></div>
      <div class="stat"><div class="num">${r.mouvementsStock}</div><div class="lbl">Mouvements de stock</div></div>
      <div class="stat"><div class="num">${r.connexions.reussies} / ${r.connexions.echouees}</div><div class="lbl">Connexions OK / échouées</div></div>
    `;
    document.getElementById("lastRefresh").textContent = "Actualisé à " + new Date().toLocaleTimeString("fr-FR");
  }catch(e){
    grid.innerHTML = `<div class="stat" style="grid-column:1/-1;"><div style="color:var(--red);font-size:13px;">${e.message}</div></div>`;
  }
}

// Reconnexion automatique si un jeton est déjà présent (lien mis en favori).
(async function boot(){
  if(TOKEN){
    try{ await afterLogin(); }
    catch(e){ logout(); }
  }
})();
