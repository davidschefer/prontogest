/* ===========================
   auth-guard.js -" Mini SGH
   - Protege p�ginas privadas
   - Redireciona para login se n�o autenticado
   - Controle por role (admin / funcionario)
   - Seguro para novas p�ginas futuras
   =========================== */

(function () {
  /* ---------------------------
     Config de rotas
  --------------------------- */
  const LOGIN_PATH = "./login.html";
  const DASHBOARD_PATH = "./dashboard.html";

  function limparSessao() {
    localStorage.clear();
  }

  function redirectTo(path) {
    window.location.href = String(path || "./login.html");
  }

  /* ---------------------------
     Evita loop no Login
  --------------------------- */
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();

  if (page === "login.html") return;

  /* ---------------------------
     Estado de autentica��o
  --------------------------- */
  const token = localStorage.getItem("auth_token");

  if (!token) {
    redirectTo(LOGIN_PATH);
    return;
  }

  fetch("/api/me", {
    headers: {
      Authorization: "Bearer " + token
    }
  })
    .then((res) => {
      if (!res.ok) throw new Error("sessao_invalida");
      return res.json();
    })
    .then((data) => {
      const role = String(data?.user?.role || "").trim().toLowerCase();
      if (role) localStorage.setItem("auth_role", role);

      /* ---------------------------
         Controle por role
      --------------------------- */

      // Admin e Super Admin acessam tudo
      if (role === "admin" || role === "superadmin") return;

      // Y' Funcion�rio: p�ginas permitidas
      const allowedForFuncionario = new Set([
        "dashboard.html",
        "pacientes.html",
        "triagem.html",
        "prontuario.html",
        "prescricoes.html",
        "leitos.html",
        "farmacia.html",
        "consultas.html",
        "relatorios.html",
        "lista-pacientes.html"
      ]);

      if (!allowedForFuncionario.has(page)) {
        alert("Acesso restrito: apenas administradores.");
        redirectTo(DASHBOARD_PATH);
      }
    })
    .catch(() => {
      limparSessao();
      redirectTo(LOGIN_PATH);
    });

})();
