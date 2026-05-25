import { supabase } from "./supabase-init.js";
import { injectFooter } from "./footer.js";
import { setupThemeSwitcher } from "./theme.js";

injectFooter();
setupThemeSwitcher();

const elLoading = document.getElementById("sec-loading");
const elGuest = document.getElementById("sec-guest");
const elMain = document.getElementById("sec-main");
const changeForm = document.getElementById("change-password-form");
const deleteConfirm = document.getElementById("delete-confirm");
const deleteBtn = document.getElementById("delete-account-btn");
const gotoForgot = document.getElementById("goto-forgot");

function show(state) {
  elLoading.hidden = state !== "loading";
  elGuest.hidden = state !== "guest";
  elMain.hidden = state !== "main";
}

deleteConfirm.addEventListener("change", () => {
  deleteBtn.disabled = !deleteConfirm.checked;
});

gotoForgot.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "prestador.html#forgot";
});

changeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) return;

  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirm = document.getElementById("confirm-password").value;

  if (next !== confirm) {
    alert("As senhas novas não coincidem.");
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    alert("Sessão inválida.");
    return;
  }

  const verify = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });

  if (verify.error) {
    alert("Senha atual incorreta.");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) alert("Erro: " + error.message);
  else {
    alert("Senha atualizada com sucesso.");
    changeForm.reset();
  }
});

deleteBtn.addEventListener("click", async () => {
  if (!deleteConfirm.checked) return;
  const ok = confirm(
    "Tem certeza? Todos os seus dados serão excluídos permanentemente."
  );
  if (!ok) return;

  deleteBtn.disabled = true;
  deleteBtn.textContent = "Excluindo...";

  const { error } = await supabase.rpc("delete_own_provider_account");

  if (error) {
    alert("Erro ao excluir conta: " + error.message + "\n\nExecute a migration_007 no Supabase se ainda não aplicou.");
    deleteBtn.disabled = false;
    deleteBtn.textContent = "Excluir minha conta";
    return;
  }

  await supabase.auth.signOut();
  window.location.href = "../index.html?conta=excluida";
});

async function init() {
  if (!supabase) {
    show("guest");
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  show(user ? "main" : "guest");
}

init();
