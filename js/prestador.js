import { db, buildPasswordResetRedirectUrl } from "./firebase-init.js";
import { injectFooter } from "./footer.js";
import { setupThemeSwitcher } from "./theme.js";
import { uploadProviderAvatar, validateAvatarFile } from "./avatar-upload.js";
import {
  ensureProviderRow,
  mergeWithDefaultServiceAreas,
  saveProviderServiceAreas,
} from "./provider-areas.js";

const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");
const registerTab = document.getElementById("tab-register");
const loginTab = document.getElementById("tab-login");
const registerAreasHost = document.getElementById("register-areas-host");
const authGuest = document.getElementById("auth-guest");
const loggedBox = document.getElementById("logged-box");
const loggedText = document.getElementById("logged-text");
const logoutBtn = document.getElementById("logout-btn");
const cepInput = document.getElementById("reg-cep");
const streetInput = document.getElementById("reg-street");
const numberInput = document.getElementById("reg-number");
const neighborhoodInput = document.getElementById("reg-neighborhood");
const cityInput = document.getElementById("reg-city");
const stateInput = document.getElementById("reg-state");
// Painel de endereço preenchido pelo CEP
const cepAddressPanel = document.getElementById("reg-cep-address");
let pendingRegistration = null;
const PENDING_REG_KEY = "servix:pending-provider-registration";

function showMessage(containerId, message, isError) {
  const host = document.getElementById(containerId);
  if (!host) return;
  const previous = host.querySelector(".form-message");
  if (previous) previous.remove();
  const p = document.createElement("p");
  p.className = "form-message";
  p.textContent = message;
  p.style.marginTop = "0.8rem";
  p.style.fontWeight = "700";
  p.style.color = isError ? "var(--danger, #c0392b)" : "var(--primary)";
  host.appendChild(p);
}

function setTab(mode) {
  const registerMode = mode === "register";
  registerTab.classList.toggle("active", registerMode);
  loginTab.classList.toggle("active", !registerMode && mode !== "forgot" && mode !== "reset");
  registerForm.hidden = !registerMode;
  loginForm.hidden = registerMode || mode === "forgot" || mode === "reset";
  if (forgotForm) forgotForm.hidden = mode !== "forgot";
  if (resetForm)  resetForm.hidden  = mode !== "reset";
}

function normalizeCep(raw) {
  return (raw || "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(raw) {
  const digits = normalizeCep(raw);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

function formatPhone(raw) {
  const d = (raw || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? "(" + d : d;
  if (d.length <= 6)  return "(" + d.slice(0,2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0,2) + ") " + d.slice(2,6) + "-" + d.slice(6);
  return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
}

// Aplica máscara de telefone em um input
function applyPhoneMask(input) {
  if (!input) return;
  input.addEventListener("input", function () {
    input.value = formatPhone(input.value);
  });
}

async function fetchAddressByCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) return null;
  const url = "https://viacep.com.br/ws/" + digits + "/json/";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao consultar CEP.");
  const data = await response.json();
  if (data.erro) return null;
  return data;
}

function composeAddress() {
  const cep = formatCep(cepInput?.value || "");
  const street = (streetInput?.value || "").trim();
  const number = (numberInput?.value || "").trim();
  const neighborhood = (neighborhoodInput?.value || "").trim();
  const city = (cityInput?.value || "").trim();
  const state = (stateInput?.value || "").trim().toUpperCase();
  const address = [street, number, neighborhood, city, state, cep].filter(Boolean).join(", ");
  return { address: address, city: city, state: state, cep: normalizeCep(cep) };
}

async function uploadAvatar(userId, file) {
  if (!file) return null;
  const check = validateAvatarFile(file);
  if (!check.ok) throw new Error(check.message);
  return uploadProviderAvatar(userId, file, null);
}

async function loadAreas() {
  if (!registerAreasHost || !db) return;
  const { data, error } = await db.from("service_areas").select("id,slug,name").order("name");
  let rows = Array.isArray(data) ? data : [];
  if (error) rows = [];
  rows = mergeWithDefaultServiceAreas(rows);
  if (rows.length === 0) {
    registerAreasHost.innerHTML = '<p class="form-hint">Nao foi possivel carregar areas.</p>';
    return;
  }
  const fieldset = document.createElement("fieldset");
  fieldset.className = "pro-areas-fieldset";
  const legend = document.createElement("legend");
  legend.textContent = "Areas de atuacao (selecione pelo menos uma)";
  fieldset.appendChild(legend);
  rows.forEach(function (row) {
    const label = document.createElement("label");
    label.className = "pro-area-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "service_area";
    input.value = row.slug || row.id;
    label.appendChild(input);
    const txt = document.createElement("span");
    txt.textContent = row.name;
    label.appendChild(txt);
    fieldset.appendChild(label);
  });
  registerAreasHost.replaceChildren(fieldset);
}

function selectedAreaIds() {
  return Array.from(document.querySelectorAll('input[name="service_area"]:checked')).map(function (i) {
    return i.value;
  });
}

async function saveProviderProfile(userId, email, payload) {
  const upsertData = {
    auth_user_id: userId,
    email: email.toLowerCase().trim(),
    full_name: payload.fullName.trim(),
    phone: payload.phone.trim(),
    address: payload.address.trim(),
    city: payload.city,
    state: payload.state,
    cep: payload.cep || null,
    avatar_url: payload.avatarUrl,
    lat: payload.lat,
    lng: payload.lng,
    terms_accepted_at: new Date().toISOString(),
  };
  const upsert = await db.from("providers").upsert(upsertData, { onConflict: "auth_user_id" }).select("id").single();
  if (upsert.error) throw upsert.error;
  const providerId = upsert.data.id;
  const areaSave = await saveProviderServiceAreas(db, providerId, payload.areaIds);
  if (areaSave.error) throw new Error(areaSave.error.message || "Erro ao salvar areas de atuacao.");
}

function collectRegisterPayload() {
  const fullName = document.getElementById("reg-full-name").value;
  const phone = document.getElementById("reg-phone").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  const passwordConfirm = document.getElementById("reg-password-confirm").value;
  const photo = document.getElementById("reg-photo").files?.[0] || null;
  const areaIds = selectedAreaIds();
  const composed = composeAddress();
  return {
    fullName,
    phone,
    email,
    password,
    passwordConfirm,
    photo,
    areaIds,
    composed,
  };
}

function savePendingRegistration(data) {
  pendingRegistration = data;
  try {
    localStorage.setItem(PENDING_REG_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function loadPendingRegistration() {
  if (pendingRegistration) return pendingRegistration;
  try {
    const raw = localStorage.getItem(PENDING_REG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    pendingRegistration = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingRegistration() {
  pendingRegistration = null;
  try {
    localStorage.removeItem(PENDING_REG_KEY);
  } catch {
    // ignore storage errors
  }
}

async function finalizeProfileForUser(user, email, payload) {
  const avatarUrl = await uploadAvatar(user.id, payload.photo);
  await saveProviderProfile(user.id, email, {
    fullName: payload.fullName,
    phone: payload.phone,
    address: payload.composed.address,
    city: payload.composed.city,
    state: payload.composed.state,
    cep: payload.composed.cep,
    avatarUrl,
    areaIds: payload.areaIds,
    lat: null,
    lng: null,
  });
}

async function hasAnyAreaLinked(userId) {
  const provider = await db.from("providers").select("id").eq("auth_user_id", userId).maybeSingle();
  if (provider.error || !provider.data) return false;
  const links = await db
    .from("provider_service_areas")
    .select("provider_id", { count: "exact", head: true })
    .eq("provider_id", provider.data.id);
  if (links.error) return false;
  return (links.count || 0) > 0;
}

async function refreshAuthState() {
  if (!db) return;
  const result = await db.auth.getUser();
  const user = result.data.user;
  if (user) {
    try {
      await ensureProviderRow(db, user, user.email || "");
    } catch (error) {
      console.error("ensureProviderRow", error);
    }
    if (authGuest) authGuest.hidden = true;
    loggedBox.hidden = false;
    loggedText.textContent = "Logado como: " + user.email;
    loginForm?.querySelector(".form-message")?.remove();
    registerForm?.querySelector(".form-message")?.remove();
  } else {
    if (authGuest) authGuest.hidden = false;
    loggedBox.hidden = true;
    loggedText.textContent = "";
  }
}

registerTab.addEventListener("click", function () {
  setTab("register");
});
loginTab.addEventListener("click", function () {
  setTab("login");
});

if (cepInput) {
  cepInput.addEventListener("input", function () {
    cepInput.value = formatCep(cepInput.value);
    if (cepAddressPanel) cepAddressPanel.hidden = true;
  });
  cepInput.addEventListener("blur", async function () {
    const digits = normalizeCep(cepInput.value);
    if (digits.length !== 8) return;
    try {
      const data = await fetchAddressByCep(digits);
      if (!data) {
        showMessage("register-form", "CEP nao encontrado.", true);
        return;
      }
      if (streetInput) streetInput.value = data.logradouro || "";
      if (neighborhoodInput) neighborhoodInput.value = data.bairro || "";
      if (cityInput) cityInput.value = data.localidade || "";
      if (stateInput) stateInput.value = (data.uf || "").toUpperCase();
      if (numberInput) numberInput.focus();

      // Mostra painel com endereço encontrado
      if (cepAddressPanel) {
        const parts = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean);
        cepAddressPanel.textContent = "📍 " + parts.join(", ");
        cepAddressPanel.hidden = false;
      }
    } catch (error) {
      showMessage("register-form", error.message || "Nao foi possivel consultar o CEP.", true);
    }
  });
}

registerForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!db) {
    showMessage("register-form", "Configure o firebase-config.js primeiro.", true);
    return;
  }

  const formData = collectRegisterPayload();

  if (formData.password !== formData.passwordConfirm) {
    showMessage("register-form", "As senhas nao conferem.", true);
    return;
  }
  if (formData.areaIds.length < 1) {
    showMessage("register-form", "Selecione ao menos uma area de atuacao.", true);
    return;
  }

  const acceptTerms = document.getElementById("reg-accept-terms");
  if (!acceptTerms?.checked) {
    showMessage("register-form", "Aceite os Termos de Uso e a Politica de Privacidade para continuar.", true);
    return;
  }

  const sign = await db.auth.signUp({ email: formData.email.trim(), password: formData.password });
  if (sign.error) {
    showMessage("register-form", sign.error.message, true);
    return;
  }
  const sessionUser = sign.data.user;
  const session = sign.data.session;
  if (!session || !sessionUser) {
    savePendingRegistration({
      email: formData.email.trim().toLowerCase(),
      payload: formData,
    });
    const loginEmail = document.getElementById("login-email");
    if (loginEmail) loginEmail.value = formData.email.trim();
    showMessage(
      "register-form",
      "Conta criada. Agora confirme seu e-mail e faca login para concluir o perfil e aparecer nos resultados.",
      false
    );
    setTab("login");
    return;
  }

  try {
    await ensureProviderRow(db, sessionUser, formData.email);
    await finalizeProfileForUser(sessionUser, formData.email, formData);
    showMessage("register-form", "Cadastro concluido com sucesso. Voce ja esta logado.", false);
    registerForm.reset();
    clearPendingRegistration();
    await refreshAuthState();
  } catch (error) {
    showMessage("register-form", error.message || "Erro ao salvar cadastro.", true);
  }
});

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!db) {
    showMessage("login-form", "Configure o firebase-config.js primeiro.", true);
    return;
  }
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const signIn = await db.auth.signInWithPassword({ email: email, password: password });
  if (signIn.error) {
    showMessage("login-form", signIn.error.message, true);
    return;
  }

  try {
    await ensureProviderRow(db, signIn.data.user, email);
  } catch (error) {
    showMessage(
      "login-form",
      "Login ok, mas falhou ao garantir cadastro em provedores: " + (error.message || "erro desconhecido."),
      true
    );
    return;
  }

  let completedNow = false;
  const pending = loadPendingRegistration();
  if (pending && pending.email === email && signIn.data.user) {
    try {
      await finalizeProfileForUser(signIn.data.user, email, pending.payload);
      clearPendingRegistration();
      completedNow = true;
      showMessage("login-form", "Login realizado e perfil concluido. Agora voce aparece nas buscas.", false);
    } catch (error) {
      showMessage(
        "login-form",
        "Login ok, mas faltou concluir perfil: " + (error.message || "tente novamente."),
        true
      );
      return;
    }
  }

  if (!completedNow && signIn.data.user) {
    const hasArea = await hasAnyAreaLinked(signIn.data.user.id);
    if (!hasArea) {
      showMessage(
        "login-form",
        "Login realizado, mas faltam áreas de atuação no perfil. Volte em 'Criar conta' e envie o formulário para concluir.",
        true
      );
      await refreshAuthState();
      return;
    }
  }

  if (!completedNow) {
    showMessage("login-form", "Login realizado com sucesso.", false);
  }
  await refreshAuthState();
});

logoutBtn.addEventListener("click", async function () {
  if (!db) return;
  await db.auth.signOut();
  await refreshAuthState();
});

// --- Esqueci a senha ---
const btnForgot    = document.getElementById("btn-forgot");
const btnBackLogin = document.getElementById("btn-back-login");

if (btnForgot) {
  btnForgot.addEventListener("click", function () {
    setTab("forgot");
    const prev = forgotForm?.querySelector(".form-message");
    if (prev) prev.remove();
  });
}

if (btnBackLogin) {
  btnBackLogin.addEventListener("click", function () {
    setTab("login");
  });
}

if (forgotForm) {
  forgotForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!db) return;

    const email     = document.getElementById("forgot-email")?.value?.trim() || "";
    const submitBtn = forgotForm.querySelector('button[type="submit"]');

    submitBtn.disabled    = true;
    submitBtn.textContent = "Enviando...";

    const redirectTo = buildPasswordResetRedirectUrl("redefinir-senha.html");

    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });

    submitBtn.disabled    = false;
    submitBtn.textContent = "Enviar link de recuperação";

    if (error) {
      showMessage("forgot-form", "Erro: " + error.message, true);
    } else {
      showMessage(
        "forgot-form",
        "✅ Link enviado! Verifique sua caixa de entrada (e a pasta de spam).",
        false
      );
    }
  });
}

// --- Nova senha (chegou pelo link do e-mail) ---
if (resetForm) {
  resetForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!db) return;
    const pass    = document.getElementById("reset-password")?.value || "";
    const confirm = document.getElementById("reset-password-confirm")?.value || "";
    const btn     = resetForm.querySelector('button[type="submit"]');
    const prev    = resetForm.querySelector(".form-message");
    if (prev) prev.remove();

    if (pass !== confirm) {
      showMessage("reset-form", "As senhas não coincidem.", true);
      return;
    }
    btn.disabled = true; btn.textContent = "Salvando...";
    const { error } = await db.auth.updateUser({ password: pass });
    btn.disabled = false; btn.textContent = "Salvar nova senha";

    if (error) {
      showMessage("reset-form", "Erro: " + error.message, true);
    } else {
      showMessage("reset-form", "✅ Senha alterada! Redirecionando...", false);
      setTimeout(() => window.location.href = "dashboard.html", 2000);
    }
  });
}

// Detecta chegada pelo link de recuperação
if (db) {
  db.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") setTab("reset");
    refreshAuthState();
  });
}

// --- Máscaras de telefone ---
applyPhoneMask(document.getElementById("reg-phone"));

loadAreas();
setupThemeSwitcher();
refreshAuthState();

if (window.location.hash === "#forgot") {
  setTab("forgot");
}

injectFooter();