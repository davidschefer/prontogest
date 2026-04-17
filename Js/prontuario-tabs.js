/* ===========================
   prontuario-tabs.js -" Mini SGH
   - Controle das abas do PEP
   - Não quebra se faltar tab/panel
   - Mantém padrão: .tab-btn[data-tab="ID_DO_PAINEL"] + .tab-panel#ID_DO_PAINEL
   =========================== */

document.addEventListener("DOMContentLoaded", () => {
  const tabs = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  if (!tabs.length || !panels.length) return;

  function ativarAba(tabId) {
    const id = String(tabId || "").trim();
    if (!id) return;

    // desativa tudo
    tabs.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));

    // ativa botão
    const btn = tabs.find((b) => String(b.dataset.tab || "") === id);
    if (btn) btn.classList.add("active");

    // ativa painel (por id)
    const panel = document.getElementById(id);
    if (panel) panel.classList.add("active");
  }

  // listeners
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      ativarAba(btn.dataset.tab);
    });
  });

  // estado inicial: tenta respeitar o que já está marcado como active
  const btnAtiva = tabs.find((b) => b.classList.contains("active"));
  const panelAtivo = panels.find((p) => p.classList.contains("active"));

  if (btnAtiva) {
    const id = String(btnAtiva.dataset.tab || "").trim();
    // se o painel ativo não bate, corrige
    const painelCerto = id ? document.getElementById(id) : null;
    if (painelCerto && !painelCerto.classList.contains("active")) {
      ativarAba(id);
      return;
    }
    // se bate, deixa como está
    if (panelAtivo && painelCerto === panelAtivo) return;
  }

  // fallback: ativa a primeira aba
  ativarAba(tabs[0]?.dataset?.tab);
});
