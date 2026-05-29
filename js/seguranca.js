import { showAppAlert, showAppConfirm } from "./app-dialog.js";
import { db, buildPasswordResetRedirectUrl } from "./firebase-init.js";
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

gotoForgot.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!db) return;

  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) {
    showAppAlert("Sessão inválida. Faça login novamente.", { variant: "error" });
    return;
  }

  const ok = await showAppConfirm(
    `Enviar link de recuperação para ${user.email}?\n\nVocê poderá definir uma nova senha sem precisar da senha atual.`,
    { confirmLabel: "Enviar link" }
  );
  if (!ok) return;

  gotoForgot.disabled = true;
  const prevText = gotoForgot.textContent;
  gotoForgot.textContent = "Enviando...";

  const redirectTo = buildPasswordResetRedirectUrl("redefinir-senha.html");
  const { error } = await db.auth.resetPasswordForEmail(user.email, { redirectTo });

  gotoForgot.disabled = false;
  gotoForgot.textContent = prevText;

  if (error) {
    showAppAlert("Erro ao enviar e-mail: " + error.message, { variant: "error" });
  } else {
    showAppAlert(
      `Link de recuperação enviado para ${user.email}.\n\nVerifique sua caixa de entrada e a pasta de spam.`,
      { variant: "success", title: "E-mail enviado" }
    );
  }
});

changeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;

  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirm = document.getElementById("confirm-password").value;

  if (next !== confirm) {
    showAppAlert("As senhas novas não coincidem.", { variant: "error" });
    return;
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) {
    showAppAlert("Sessão inválida.", { variant: "error" });
    return;
  }

  const verify = await db.auth.reauthenticate({
    email: user.email,
    password: current,
  });

  if (verify.error) {
    const sendReset = await showAppConfirm(
      "Senha atual incorreta.\n\nDeseja receber um link por e-mail para redefinir sua senha?",
      { confirmLabel: "Enviar link" }
    );
    if (sendReset) {
      const redirectTo = buildPasswordResetRedirectUrl("redefinir-senha.html");
      const { error: resetError } = await db.auth.resetPasswordForEmail(user.email, {
        redirectTo,
      });
      if (resetError) showAppAlert("Erro ao enviar e-mail: " + resetError.message, { variant: "error" });
      else {
        showAppAlert(
          `Link enviado para ${user.email}. Verifique sua caixa de entrada e a pasta de spam.`,
          { variant: "success", title: "E-mail enviado" }
        );
      }
    }
    return;
  }

  const { error } = await db.auth.updateUser({ password: next });
  if (error) showAppAlert("Erro: " + error.message, { variant: "error" });
  else {
    showAppAlert("Senha atualizada com sucesso.", { variant: "success" });
    changeForm.reset();
  }
});

deleteBtn.addEventListener("click", async () => {
  if (!deleteConfirm.checked) return;
  const ok = await showAppConfirm(
    "Tem certeza? Todos os seus dados serão excluídos permanentemente.",
    { title: "Excluir conta", confirmLabel: "Excluir" }
  );
  if (!ok) return;

  deleteBtn.disabled = true;
  deleteBtn.textContent = "Excluindo...";

  const { error } = await db.rpc("delete_own_provider_account");

  if (error) {
    showAppAlert("Erro ao excluir conta: " + error.message, { variant: "error" });
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
