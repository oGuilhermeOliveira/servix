import { supabase } from "./supabase-init.js";

// --- Tema ---
const THEME_KEY = "servix-theme-mode";
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
(function setupTheme() {
  const switcher = document.getElementById("theme-switcher");
  const button   = document.getElementById("theme-fab-button");
  const menu     = document.getElementById("theme-menu");
  if (!switcher || !button || !menu) return;
  let current = localStorage.getItem(THEME_KEY) || "system";
  if (!["light","dark","system"].includes(current)) current = "system";
  apply(current); select(current);
  button.addEventListener("click", () => { const o = !menu.hidden; menu.hidden = o; button.setAttribute("aria-expanded", o ? "false" : "true"); });
  document.querySelectorAll(".theme-menu-item").forEach(item => {
    item.addEventListener("click", () => {
      current = item.dataset.themeMode;
      localStorage.setItem(THEME_KEY, current);
      apply(current); select(current);
      menu.hidden = true; button.setAttribute("aria-expanded","false");
    });
  });
  document.addEventListener("click", e => { if (!switcher.contains(e.target)) { menu.hidden = true; button.setAttribute("aria-expanded","false"); }});
  document.addEventListener("keydown", e => { if (e.key === "Escape") { menu.hidden = true; button.setAttribute("aria-expanded","false"); }});
  mediaQuery.addEventListener("change", () => { if (current === "system") apply("system"); });
  function apply(m) { document.documentElement.setAttribute("data-theme", m === "system" ? (mediaQuery.matches ? "dark" : "light") : m); }
  function select(m) { document.querySelectorAll(".theme-menu-item").forEach(i => { const a = i.dataset.themeMode === m; i.classList.toggle("active",a); i.setAttribute("aria-pressed",a?"true":"false"); }); }
})();

// --- Elementos ---
const elLoading    = document.getElementById("edit-loading");
const elNotLogged  = document.getElementById("edit-not-logged");
const elMain       = document.getElementById("edit-main");
const elForm       = document.getElementById("edit-form");
const elSuccess    = document.getElementById("success-banner");
const elAvatarWrap = document.getElementById("avatar-preview-wrap");
const elPhoto      = document.getElementById("edit-photo");
const elAreasHost  = document.getElementById("edit-areas-host");

// Campos
const fName         = document.getElementById("edit-name");
const fPhone        = document.getElementById("edit-phone");
const fCep          = document.getElementById("edit-cep");
const fStreet       = document.getElementById("edit-street");
const fNumber       = document.getElementById("edit-number");
const fNeighborhood = document.getElementById("edit-neighborhood");
const fCity         = document.getElementById("edit-city");
const fState        = document.getElementById("edit-state");

function showState(s) {
  elLoading.hidden   = s !== "loading";
  elNotLogged.hidden = s !== "not-logged";
  elMain.hidden      = s !== "main";
}

function showError(msg) {
  const prev = elForm.querySelector(".form-message");
  if (prev) prev.remove();
  const p = document.createElement("p");
  p.className = "form-message";
  p.textContent = msg;
  p.style.cssText = "margin-top:.8rem;font-weight:700;color:var(--danger,#c0392b)";
  elForm.appendChild(p);
}

function clearError() {
  const prev = elForm.querySelector(".form-message");
  if (prev) prev.remove();
}

// --- CEP ---
function normalizeCep(raw) { return (raw || "").replace(/\D/g,"").slice(0,8); }
function formatCep(raw) { const d = normalizeCep(raw); return d.length <= 5 ? d : d.slice(0,5)+"-"+d.slice(5); }

fCep.addEventListener("input", () => { fCep.value = formatCep(fCep.value); });
fCep.addEventListener("blur", async () => {
  const digits = normalizeCep(fCep.value);
  if (digits.length !== 8) return;
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (!data.erro) {
      if (fStreet.value === "" || fStreet.dataset.auto === "1") { fStreet.value = data.logradouro || ""; fStreet.dataset.auto = "1"; }
      if (fNeighborhood.value === "" || fNeighborhood.dataset.auto === "1") { fNeighborhood.value = data.bairro || ""; fNeighborhood.dataset.auto = "1"; }
      fCity.value  = data.localidade || fCity.value;
      fState.value = (data.uf || fState.value).toUpperCase();
      if (fNumber.value === "") fNumber.focus();
    }
  } catch(e) { console.warn("ViaCEP:", e); }
});

// Ao editar manualmente, remove flag de auto-preenchido
[fStreet, fNeighborhood].forEach(el => {
  el.addEventListener("input", () => { el.dataset.auto = "0"; });
});

// --- Preview da foto ---
elPhoto.addEventListener("change", () => {
  const file = elPhoto.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  setAvatarPreview(url);
});

function setAvatarPreview(url) {
  if (!url) {
    elAvatarWrap.innerHTML = '<div class="edit-avatar-placeholder">👤</div>';
    return;
  }
  const img = document.createElement("img");
  img.src = url;
  img.className = "edit-avatar-preview";
  img.alt = "Foto de perfil";
  elAvatarWrap.replaceChildren(img);
}

// --- Áreas de atuação ---
let allAreas = [];

async function loadAreas(selectedIds = []) {
  const { data, error } = await supabase.from("service_areas").select("id,slug,name").order("name");
  if (error || !data) { elAreasHost.innerHTML = '<p class="form-hint">Não foi possível carregar áreas.</p>'; return; }
  allAreas = data;
  const fieldset = document.createElement("fieldset");
  fieldset.className = "pro-areas-fieldset";
  const legend = document.createElement("legend");
  legend.textContent = "Selecione pelo menos uma área";
  fieldset.appendChild(legend);
  data.forEach(row => {
    const label = document.createElement("label");
    label.className = "pro-area-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "edit_area";
    input.value = row.id;
    input.checked = selectedIds.includes(row.id);
    label.appendChild(input);
    const txt = document.createElement("span");
    txt.textContent = row.name;
    label.appendChild(txt);
    fieldset.appendChild(label);
  });
  elAreasHost.replaceChildren(fieldset);
}

function selectedAreaIds() {
  return Array.from(document.querySelectorAll('input[name="edit_area"]:checked')).map(i => i.value);
}

// --- Upload avatar ---
async function uploadAvatar(userId, file) {
  if (!file) return null;
  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("provider-avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("provider-avatars").getPublicUrl(path).data.publicUrl || null;
}

// --- Geocodificação pelo CEP ---
async function geocodeCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return { lat: null, lng: null };
  try {
    const viaCep = await (await fetch(`https://viacep.com.br/ws/${digits}/json/`)).json();
    if (viaCep.erro) return { lat: null, lng: null };
    const query = encodeURIComponent(`${digits}, ${viaCep.localidade}, ${viaCep.uf}, Brasil`);
    const nom   = await (await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, { headers: { "Accept-Language": "pt-BR" } })).json();
    if (nom?.length > 0) return { lat: parseFloat(nom[0].lat), lng: parseFloat(nom[0].lon) };
  } catch(e) { console.warn("Geocode:", e); }
  return { lat: null, lng: null };
}

// --- Preenche formulário com dados existentes ---
function fillForm(provider, areaIds) {
  fName.value  = provider.full_name  || "";
  fPhone.value = provider.phone      || "";

  // Tenta extrair CEP e número do campo address
  const addr = provider.address || "";
  // address foi montado como: "rua, numero, bairro, cidade, estado, cep"
  const parts = addr.split(",").map(s => s.trim());
  if (parts.length >= 6) {
    fStreet.value       = parts[0] || "";
    fNumber.value       = parts[1] || "";
    fNeighborhood.value = parts[2] || "";
  }
  fCity.value  = provider.city  || "";
  fState.value = (provider.state || "").toUpperCase();
  // CEP não é armazenado separado — só mostramos cidade/estado

  if (provider.avatar_url) setAvatarPreview(provider.avatar_url);
  loadAreas(areaIds);
}

// --- Submit ---
elForm.addEventListener("submit", async e => {
  e.preventDefault();
  clearError();

  const areaIds = selectedAreaIds();
  if (areaIds.length === 0) { showError("Selecione ao menos uma área de atuação."); return; }
  if (!fCity.value.trim() || !fState.value.trim()) { showError("Preencha cidade e estado."); return; }

  const submitBtn = elForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Faça login novamente.");

    // Avatar
    const file      = elPhoto.files?.[0] || null;
    let   avatarUrl = null;
    if (file) {
      avatarUrl = await uploadAvatar(user.id, file);
    }

    // Geocode pelo CEP informado
    const coords = await geocodeCep(fCep.value);

    // Monta endereço
    const addressParts = [fStreet.value.trim(), fNumber.value.trim(), fNeighborhood.value.trim(), fCity.value.trim(), fState.value.trim().toUpperCase(), formatCep(fCep.value)];
    const address = addressParts.filter(Boolean).join(", ");

    // Busca o ID do provider
    const { data: prov } = await supabase.from("providers").select("id, avatar_url").eq("auth_user_id", user.id).single();
    if (!prov) throw new Error("Perfil não encontrado.");

    const updateData = {
      full_name: fName.value.trim(),
      phone:     fPhone.value.trim(),
      address,
      city:      fCity.value.trim(),
      state:     fState.value.trim().toUpperCase(),
      lat:       coords.lat,
      lng:       coords.lng,
    };
    if (avatarUrl) updateData.avatar_url = avatarUrl;

    const { error: upErr } = await supabase.from("providers").update(updateData).eq("id", prov.id);
    if (upErr) throw upErr;

    // Atualiza áreas — apaga tudo e reinsere
    const { error: delErr } = await supabase
      .from("provider_service_areas")
      .delete()
      .eq("provider_id", prov.id);
    if (delErr) throw new Error("Erro ao remover áreas antigas: " + delErr.message);

    if (areaIds.length > 0) {
      // Tenta primeiro com service_area_id, depois com area_id
      let links = areaIds.map(areaId => ({ provider_id: prov.id, service_area_id: areaId }));
      let { error: aErr } = await supabase.from("provider_service_areas").insert(links);
      if (aErr) {
        // Fallback: tenta com area_id
        links = areaIds.map(areaId => ({ provider_id: prov.id, area_id: areaId }));
        const { error: aErr2 } = await supabase.from("provider_service_areas").insert(links);
        if (aErr2) throw new Error("Erro ao salvar áreas: " + aErr2.message);
      }
    }

    elSuccess.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { elSuccess.style.display = "none"; }, 4000);

  } catch(err) {
    showError(err.message || "Erro ao salvar. Tente novamente.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar alterações";
  }
});

// --- Init ---
async function init() {
  if (!supabase) { showState("not-logged"); return; }
  showState("loading");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { showState("not-logged"); return; }

  const { data: provider, error } = await supabase
    .from("providers")
    .select("id, full_name, phone, city, state, address, avatar_url, provider_service_areas(area_id)")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !provider) { showState("not-logged"); return; }

  const areaIds = (provider.provider_service_areas || []).map(l => l.area_id);
  fillForm(provider, areaIds);
  showState("main");
}

init();