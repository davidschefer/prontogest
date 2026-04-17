/* ===========================
   menu-guard.js -" Mini SGH
   - Controla VISIBILIDADE do menu (UI)
   - Esconde itens ".admin-only" para não-admin
   - Oculta também medicamentos.html para funcionário
   - Não substitui auth-guard.js (segurança real)
   =========================== */
(function () {
  function aplicarMenuGuard() {
    const role = (localStorage.getItem("auth_role") || "").trim().toLowerCase();
    const isAdmin = role === "admin";

    // 🔒 Regra padrão: admin-only
    document.querySelectorAll(".admin-only").forEach((el) => {
      if (!isAdmin) {
        el.style.setProperty("display", "none", "important");
      } else {
        el.style.removeProperty("display");
      }
    });

    // 🔒 Regra específica: medicamentos.html
    document.querySelectorAll('a[href*="medicamentos.html"]').forEach((el) => {
      if (!isAdmin) {
        el.style.setProperty("display", "none", "important");
      } else {
        el.style.removeProperty("display");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", aplicarMenuGuard);
  window.addEventListener("load", aplicarMenuGuard);
  setTimeout(aplicarMenuGuard, 100);
})();