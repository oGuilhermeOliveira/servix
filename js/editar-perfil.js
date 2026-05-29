import { db } from "./firebase-init.js";
import { uploadProviderAvatar, validateAvatarFile } from "./avatar-upload.js";
import { injectFooter } from "./footer.js";
import { notifyProfileUpdated } from "./notifications.js";
import {
  loadProviderAreas,
  mergeWithDefaultServiceAreas,
  saveProviderServiceAreas,
} from "./provider-areas.js";

injectFooter();

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
const cepAddressPanel = document.getElementById("edit-cep-address");

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

function formatPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? "(" + d : d;
  if (d.length <= 6)  return "(" + d.slice(0,2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6);
  return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
}
if (fPhone) {
  fPhone.addEventListener("input", () => { fPhone.value = formatPhone(fPhone.value); });
}

function showCepAddressPanel() {
  if (!cepAddressPanel) return;
  const parts = [fStreet.value, fNeighborhood.value, fCity.value, fState.value].filter(Boolean);
  if (!parts.length) {
    cepAddressPanel.hidden = true;
    return;
  }
  cepAddressPanel.textContent = "📍 " + parts.join(", ");
  cepAddressPanel.hidden = false;
}

async function fetchAddressByCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) throw new Error("Falha ao consultar CEP.");
  const data = await res.json();
  if (data.erro) return null;
  return data;
}

function applyViaCepData(data) {
  if (!data) return;
  fStreet.value = data.logradouro || "";
  fNeighborhood.value = data.bairro || "";
  fCity.value = data.localidade || "";
  fState.value = (data.uf || "").toUpperCase();
  showCepAddressPanel();
}

function composeAddress() {
  const cep = formatCep(fCep.value || "");
  const street = (fStreet.value || "").trim();
  const number = (fNumber.value || "").trim();
  const neighborhood = (fNeighborhood.value || "").trim();
  const city = (fCity.value || "").trim();
  const state = (fState.value || "").trim().toUpperCase();
  const address = [street, number, neighborhood, city, state, cep].filter(Boolean).join(", ");
  return { address, city, state, cep: normalizeCep(cep) };
}

function parseStoredAddress(provider) {
  const parts = (provider.address || "").split(",").map((s) => s.trim());
  let street = "";
  let number = "";
  let neighborhood = "";
  let city = provider.city || "";
  let state = (provider.state || "").toUpperCase();
  let cep = provider.cep || "";

  if (parts.length >= 6) {
    street = parts[0] || "";
    number = parts[1] || "";
    neighborhood = parts[2] || "";
    city = parts[3] || city;
    state = (parts[4] || state).toUpperCase();
    cep = parts[5] || cep;
  } else if (parts.length >= 2) {
    street = parts[0] || "";
    number = parts[1] || "";
  }

  return { street, number, neighborhood, city, state, cep: normalizeCep(cep) };
}

if (fCep) {
  fCep.addEventListener("input", () => {
    fCep.value = formatCep(fCep.value);
    if (cepAddressPanel) cepAddressPanel.hidden = true;
  });
  fCep.addEventListener("blur", async () => {
    const digits = normalizeCep(fCep.value);
    if (digits.length !== 8) return;
    try {
      const data = await fetchAddressByCep(digits);
      if (!data) {
        showError("CEP não encontrado.");
        return;
      }
      clearError();
      applyViaCepData(data);
      if (!fNumber.value) fNumber.focus();
    } catch (e) {
      showError(e.message || "Não foi possível consultar o CEP.");
    }
  });
}

// --- Preview da foto ---
elPhoto.addEventListener("change", () => {
  const file = elPhoto.files?.[0];
  if (!file) return;
  const check = validateAvatarFile(file);
  if (!check.ok) {
    showError(check.message);
    elPhoto.value = "";
    return;
  }
  clearError();
  setAvatarPreview(URL.createObjectURL(file));
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
  const { data, error } = await db.from("service_areas").select("id,slug,name").order("name");
  let rows = Array.isArray(data) ? data : [];
  if (error) rows = [];
  rows = mergeWithDefaultServiceAreas(rows);
  if (rows.length === 0) { elAreasHost.innerHTML = '<p class="form-hint">Não foi possível carregar áreas.</p>'; return; }
  allAreas = rows;
  const fieldset = document.createElement("fieldset");
  fieldset.className = "pro-areas-fieldset";
  const legend = document.createElement("legend");
  legend.textContent = "Selecione pelo menos uma área";
  fieldset.appendChild(legend);
  rows.forEach(row => {
    const label = document.createElement("label");
    label.className = "pro-area-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "edit_area";
    input.value = row.slug || row.id;
    const areaKey = row.slug || row.id;
    input.checked = selectedIds.includes(areaKey) || selectedIds.includes(row.id);
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
  fName.value = provider.full_name || "";
  fPhone.value = formatPhone(provider.phone || "");

  const parsed = parseStoredAddress(provider);
  fStreet.value = parsed.street;
  fNeighborhood.value = parsed.neighborhood;
  fCity.value = parsed.city;
  fState.value = parsed.state;
  fNumber.value = parsed.number;
  if (parsed.cep) fCep.value = formatCep(parsed.cep);
  showCepAddressPanel();

  if (provider.avatar_url) setAvatarPreview(provider.avatar_url);
  loadAreas(areaIds);
}

// --- Submit ---
elForm.addEventListener("submit", async e => {
  e.preventDefault();
  clearError();

  const areaIds = selectedAreaIds();
  if (areaIds.length === 0) { showError("Selecione ao menos uma área de atuação."); return; }
  const cepDigits = normalizeCep(fCep.value);
  if (cepDigits.length !== 8) { showError("Informe um CEP válido com 8 dígitos."); return; }
  if (!fNumber.value.trim()) { showError("Informe o número do endereço."); return; }
  if (!fStreet.value.trim() || !fCity.value.trim() || !fState.value.trim()) {
    showError("Consulte o CEP para preencher o endereço automaticamente.");
    return;
  }

  const submitBtn = elForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Faça login novamente.");

    // Avatar
    const { data: prov } = await db
      .from("providers")
      .select("id, avatar_url")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!prov) throw new Error("Perfil não encontrado.");

    const file = elPhoto.files?.[0] || null;
    let avatarUrl = null;
    if (file) {
      avatarUrl = await uploadProviderAvatar(user.id, file, prov.avatar_url);
    }

    const composed = composeAddress();
    const coords = await geocodeCep(fCep.value);

    const updateData = {
      full_name: fName.value.trim(),
      phone: fPhone.value.trim(),
      address: composed.address,
      city: composed.city,
      state: composed.state,
      cep: composed.cep,
      lat: coords.lat,
      lng: coords.lng,
    };
    if (avatarUrl) updateData.avatar_url = avatarUrl;

    const { error: upErr } = await db
      .from("providers")
      .update(updateData)
      .eq("auth_user_id", user.id);
    if (upErr) throw new Error(upErr.message || "Erro ao atualizar perfil.");

    const areaSave = await saveProviderServiceAreas(db, prov.id, areaIds);
    if (areaSave.error) throw new Error(areaSave.error.message || "Erro ao salvar areas.");

    await notifyProfileUpdated(prov.id);

    elSuccess.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });

    setTimeout(() => {
      window.location.href = "dashboard.html?perfil=atualizado";
    }, 1200);

  } catch(err) {
    showError(err.message || "Erro ao salvar. Tente novamente.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar alterações";
  }
});

// --- Init ---
async function init() {
  if (!db) { showState("not-logged"); return; }
  showState("loading");

  const { data: { user } } = await db.auth.getUser();
  if (!user) { showState("not-logged"); return; }

  const { data: provider, error } = await db
    .from("providers")
    .select("id, full_name, phone, city, state, address, cep, avatar_url")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !provider) { showState("not-logged"); return; }

  const linkedAreas = await loadProviderAreas(db, provider.id);
  const areaIds = linkedAreas.map((a) => a.slug || a.id);
  fillForm(provider, areaIds);

  const cepDigits = normalizeCep(fCep.value);
  if (cepDigits.length === 8 && !fStreet.value.trim()) {
    try {
      const data = await fetchAddressByCep(cepDigits);
      if (data) applyViaCepData(data);
    } catch (e) {
      console.warn("ViaCEP init:", e);
    }
  }

  showState("main");
}

init();