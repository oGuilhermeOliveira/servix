import { APP } from "./app-config.js";

function resolveBase() {
  const path = window.location.pathname.replace(/\\/g, "/");
  if (path.includes("/janelas/")) return "";
  return "janelas/";
}

export function injectFooter() {
  if (document.getElementById("servix-footer")) return;

  const base = resolveBase();
  const mailto = `mailto:${APP.contactEmail}?subject=Contato%20Servix%20Solutions`;

  const footer = document.createElement("footer");
  footer.id = "servix-footer";
  footer.className = "footer";
  footer.innerHTML = `
    <div class="container footer-grid">
      <div>
        <strong>${APP.name}</strong>
        <p>Conectar pessoas a profissionais de serviços de forma rápida, prática e segura.</p>
        <button type="button" class="footer-about-btn" id="footer-about-btn">Sobre o sistema</button>
      </div>
      <div class="footer-links">
        <p><a href="${mailto}">${APP.contactEmail}</a></p>
        <p>
          <a href="${base}contato.html">Fale conosco</a> ·
          <a href="${base}faq.html">FAQ</a>
        </p>
        <p>
          <a href="${base}privacidade.html">Política de privacidade</a> ·
          <a href="${base}termos.html">Termos de uso</a>
        </p>
      </div>
    </div>
    <div id="about-modal" class="about-modal" hidden>
      <div class="about-modal-backdrop" data-close-about></div>
      <div class="about-modal-panel" role="dialog" aria-labelledby="about-title">
        <header class="app-dialog-header">
          <h3 id="about-title" class="app-dialog-title">Sobre o ${APP.name}</h3>
          <button type="button" class="app-dialog-close about-modal-close" data-close-about aria-label="Fechar">×</button>
        </header>
        <dl class="about-dl">
          <dt>Nome</dt><dd>${APP.name}</dd>
          <dt>Versão</dt><dd>${APP.version}</dd>
          <dt>Desenvolvedor</dt><dd>${APP.developer}</dd>
          <dt>Distribuição</dt><dd>${APP.distribution}</dd>
          <dt>Contato</dt><dd><a style="color: var(--accent);" href="${mailto}">${APP.contactEmail}</a></dd>
        </dl>
      </div>
    </div>
  `;

  document.body.appendChild(footer);

  const aboutBtn = document.getElementById("footer-about-btn");
  const modal = document.getElementById("about-modal");

  aboutBtn?.addEventListener("click", () => {
    modal.hidden = false;
    document.body.classList.add("modal-open");
  });

  modal?.querySelectorAll("[data-close-about]").forEach((el) => {
    el.addEventListener("click", () => {
      modal.hidden = true;
      document.body.classList.remove("modal-open");
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) {
      modal.hidden = true;
      document.body.classList.remove("modal-open");
    }
  });
}
