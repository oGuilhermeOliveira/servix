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
    alert("Sessão inválida. Faça login novamente.");
    return;
  }

  const ok = confirm(
    `Enviar link de recuperação para ${user.email}?\n\nVocê poderá definir uma nova senha sem precisar da senha atual.`
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
    alert("Erro ao enviar e-mail: " + error.message);
  } else {
    alert(
      `Link de recuperação enviado para ${user.email}.\n\nVerifique sua caixa de entrada e a pasta de spam.`
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
    const sendReset = confirm(
      "Senha atual incorreta.\n\nDeseja receber um link por e-mail para redefinir sua senha?"
    );
    if (sendReset) {
      const redirectTo = buildPasswordResetRedirectUrl("redefinir-senha.html");
      const { error: resetError } = await db.auth.resetPasswordForEmail(user.email, {
        redirectTo,
      });
      if (resetError) alert("Erro ao enviar e-mail: " + resetError.message);
      else {
        alert(
          `Link enviado para ${user.email}. Verifique sua caixa de entrada e a pasta de spam.`
        );
      }
    }
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
