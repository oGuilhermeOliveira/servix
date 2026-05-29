/** Diálogos no estilo do card "Sobre o sistema" (substituem alert/confirm nativos). */

let dialogEl = null;
let pendingResolve = null;
let pendingKind = null;

function getDialog() {
  if (dialogEl) return dialogEl;

  dialogEl = document.createElement("div");
  dialogEl.id = "app-dialog";
  dialogEl.className = "app-dialog";
  dialogEl.hidden = true;
  dialogEl.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-close></div>
    <div class="app-dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title">
      <header class="app-dialog-header">
        <h3 id="app-dialog-title" class="app-dialog-title"></h3>
        <button type="button" class="app-dialog-close" data-dialog-close aria-label="Fechar">×</button>
      </header>
      <div id="app-dialog-body" class="app-dialog-body"></div>
      <div id="app-dialog-actions" class="app-dialog-actions"></div>
    </div>
  `;
  document.body.appendChild(dialogEl);

  dialogEl.addEventListener("click", function (e) {
    if (!e.target.closest("[data-dialog-close]")) return;
    finishDialog(pendingKind === "confirm" ? false : undefined);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !dialogEl || dialogEl.hidden) return;
    finishDialog(pendingKind === "confirm" ? false : undefined);
  });

  return dialogEl;
}

function finishDialog(value) {
  const kind = pendingKind;
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingKind = null;
  if (dialogEl) dialogEl.hidden = true;
  document.body.classList.remove("modal-open");
  if (!resolve) return;
  if (kind === "confirm") resolve(Boolean(value));
  else resolve();
}

/**
 * @param {string} message
 * @param {{ title?: string, okLabel?: string, variant?: 'info'|'error'|'success' }} [options]
 */
export function showAppAlert(message, options) {
  const opts = options || {};
  return new Promise(function (resolve) {
    const root = getDialog();
    const titleEl = root.querySelector("#app-dialog-title");
    const bodyEl = root.querySelector("#app-dialog-body");
    const actionsEl = root.querySelector("#app-dialog-actions");

    const variant = opts.variant || "info";
    let title = opts.title;
    if (!title) {
      if (variant === "error") title = "Erro";
      else if (variant === "success") title = "Sucesso";
      else title = "Aviso";
    }

    pendingKind = "alert";
    pendingResolve = resolve;
    root.dataset.variant = variant;
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = message || "";

    if (actionsEl) {
      actionsEl.replaceChildren();
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn btn-small full";
      okBtn.textContent = opts.okLabel || "OK";
      okBtn.addEventListener("click", function () {
        finishDialog();
      });
      actionsEl.appendChild(okBtn);
    }

    root.hidden = false;
    document.body.classList.add("modal-open");
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, confirmLabel?: string, cancelLabel?: string }} [options]
 */
export function showAppConfirm(message, options) {
  const opts = options || {};
  return new Promise(function (resolve) {
    const root = getDialog();
    const titleEl = root.querySelector("#app-dialog-title");
    const bodyEl = root.querySelector("#app-dialog-body");
    const actionsEl = root.querySelector("#app-dialog-actions");

    pendingKind = "confirm";
    pendingResolve = resolve;
    root.dataset.variant = "confirm";
    if (titleEl) titleEl.textContent = opts.title || "Confirmar";
    if (bodyEl) bodyEl.textContent = message || "";

    if (actionsEl) {
      actionsEl.replaceChildren();
      const wrap = document.createElement("div");
      wrap.className = "app-dialog-actions-row";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-small btn-ghost";
      cancelBtn.textContent = opts.cancelLabel || "Cancelar";
      cancelBtn.addEventListener("click", function () {
        finishDialog(false);
      });

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn btn-small";
      okBtn.textContent = opts.confirmLabel || "Confirmar";
      okBtn.addEventListener("click", function () {
        finishDialog(true);
      });

      wrap.appendChild(cancelBtn);
      wrap.appendChild(okBtn);
      actionsEl.appendChild(wrap);
    }

    root.hidden = false;
    document.body.classList.add("modal-open");
  });
}
