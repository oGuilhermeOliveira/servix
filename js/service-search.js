import { searchServices, findServiceById } from "./service-catalog.js";

/**
 * Combobox de busca de serviço (digitar + selecionar sugestão).
 * @param {HTMLElement} root
 * @param {{ onChange?: (item: object|null) => void }} [opts]
 */
export function initServiceSearch(root, opts = {}) {
  const input = root.querySelector("[data-service-input]");
  const list = root.querySelector("[data-service-list]");
  const clearBtn = root.querySelector("[data-service-clear]");
  const slugInput = root.querySelector("[data-service-slug]");
  const idInput = root.querySelector("[data-service-id]");
  const labelInput = root.querySelector("[data-service-label]");

  if (!input || !list) return { getSelection: () => null };

  let selected = null;
  let activeIndex = -1;

  function setSelection(item) {
    selected = item;
    if (slugInput) slugInput.value = item?.slug || "";
    if (idInput) idInput.value = item?.id || "";
    if (labelInput) labelInput.value = item?.label || "";
    if (item) {
      input.value = item.label;
      input.setAttribute("aria-expanded", "false");
    }
    list.hidden = true;
    activeIndex = -1;
    opts.onChange?.(item);
  }

  function renderSuggestions(items) {
    list.innerHTML = "";
    if (!items.length) {
      list.hidden = true;
      return;
    }
    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "service-suggest-item";
      btn.setAttribute("role", "option");
      btn.id = `service-opt-${i}`;
      btn.dataset.index = String(i);
      btn.innerHTML =
        `<span class="service-suggest-label">${escapeHtml(item.label)}</span>` +
        `<span class="service-suggest-group"> em <em>${escapeHtml(item.group)}</em></span>`;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        setSelection(item);
      });
      list.appendChild(btn);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  }

  function openFromInput() {
    const q = input.value.trim();
    if (!q) {
      list.hidden = true;
      return;
    }
    if (selected && selected.label === q) return;
    selected = null;
    if (slugInput) slugInput.value = "";
    if (idInput) idInput.value = "";
    if (labelInput) labelInput.value = "";
    renderSuggestions(searchServices(q));
  }

  input.addEventListener("input", () => {
    if (selected && input.value !== selected.label) selected = null;
    openFromInput();
  });

  input.addEventListener("focus", openFromInput);

  input.addEventListener("keydown", (e) => {
    const options = list.querySelectorAll(".service-suggest-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.hidden) openFromInput();
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      highlightOption(options);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightOption(options);
    } else if (e.key === "Enter" && activeIndex >= 0 && options[activeIndex]) {
      e.preventDefault();
      options[activeIndex].dispatchEvent(new MouseEvent("mousedown"));
    } else if (e.key === "Escape") {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }
  });

  function highlightOption(options) {
    options.forEach((el, i) => el.classList.toggle("is-active", i === activeIndex));
    const active = options[activeIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      setSelection(null);
      input.focus();
    });
  }

  return {
    getSelection: () => selected,
    setSelection,
    validate: () => {
      if (selected) return selected;
      const id = idInput?.value;
      if (id) return findServiceById(id);
      const q = input.value.trim();
      const hits = searchServices(q, 1);
      if (hits.length === 1 && normalize(q) === normalize(hits[0].label)) {
        setSelection(hits[0]);
        return hits[0];
      }
      return null;
    },
  };
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
