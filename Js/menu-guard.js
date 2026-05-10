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
    const isSuperAdmin = role === "superadmin";
    const clinicaId = (localStorage.getItem("auth_clinica_id") || "").trim();
    let modulosClinica = null;
    try {
      const raw = localStorage.getItem("clinica_modules_" + clinicaId);
      modulosClinica = raw ? JSON.parse(raw) : null;
    } catch {
      modulosClinica = null;
    }

    // 🔒 Regra padrão: admin-only
    document.querySelectorAll(".admin-only").forEach((el) => {
      if (!isAdmin && !isSuperAdmin) {
        el.style.setProperty("display", "none", "important");
      } else {
        el.style.removeProperty("display");
      }
    });

    // 🔒 Regra específica: medicamentos.html
    document.querySelectorAll('a[href*="medicamentos.html"]').forEach((el) => {
      if (!isAdmin && !isSuperAdmin) {
        el.style.setProperty("display", "none", "important");
      } else {
        el.style.removeProperty("display");
      }
    });

    if (modulosClinica && typeof modulosClinica === "object") {
      const map = {
        dashboard: "dashboard.html",
        pacientes: "pacientes.html",
        triagem: "triagem.html",
        prontuario: "prontuario.html",
        prescricoes: "prescricoes.html",
        leitos: "leitos.html",
        consultas: "consultas.html",
        farmacia: "farmacia.html",
        faturamento: "faturamento.html",
        funcionarios: "funcionarios-cadastro.html|funcionarios-lista.html",
        relatorios: "relatorios.html",
      };

      Object.keys(map).forEach((mod) => {
        if (modulosClinica[mod] !== false) return;
        const hrefs = String(map[mod]).split("|");
        hrefs.forEach((href) => {
          document.querySelectorAll(`a[href*="${href}"]`).forEach((el) => {
            el.style.setProperty("display", "none", "important");
          });
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", aplicarMenuGuard);
  window.addEventListener("load", aplicarMenuGuard);
  setTimeout(aplicarMenuGuard, 100);
})();
