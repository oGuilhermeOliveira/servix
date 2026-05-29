import { db } from "./firebase-init.js";
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
  if (!db) return;

  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirm = document.getElementById("confirm-password").value;

  if (next !== confirm) {
    alert("As senhas novas não coincidem.");
    return;
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) {
    alert("Sessão inválida.");
    return;
  }

  const verify = await db.auth.reauthenticate({
    email: user.email,
    password: current,
  });

  if (verify.error) {
    alert("Senha atual incorreta.");
    return;
  }

  const { error } = await db.auth.updateUser({ password: next });
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

  const { error } = await db.rpc("delete_own_provider_account");

  if (error) {
    alert("Erro ao excluir conta: " + error.message);
    deleteBtn.disabled = false;
    deleteBtn.textContent = "Excluir minha conta";
    return;
  }

  await db.auth.signOut();
  window.location.href = "../index.html?conta=excluida";
});

async function init() {
  if (!db) {
    show("guest");
    return;
  }
  const { data: { user } } = await db.auth.getUser();
  show(user ? "main" : "guest");
}

init();
