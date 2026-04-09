function showMessage(formId, message) {
  const form = document.getElementById(formId);
  if (!form) return;

  const existing = form.querySelector(".form-message");
  if (existing) existing.remove();

  const feedback = document.createElement("p");
  feedback.className = "form-message";
  feedback.textContent = message;
  feedback.style.marginTop = "0.8rem";
  feedback.style.fontWeight = "700";
  feedback.style.color = "#1f2f56";
  form.appendChild(feedback);
}

const quickForm = document.getElementById("quick-form");
if (quickForm) {
  quickForm.addEventListener("submit", function (event) {
    event.preventDefault();
    showMessage("quick-form", "Pedido enviado. Em breve voce recebera ate 4 orcamentos.");
    quickForm.reset();
  });
}

const proForm = document.getElementById("pro-form");
if (proForm) {
  proForm.addEventListener("submit", function (event) {
    event.preventDefault();
    showMessage("pro-form", "Cadastro recebido. A equipe Servix vai entrar em contato.");
    proForm.reset();
  });
}
