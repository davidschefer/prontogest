// ================================
// login.js -" Mini SGH (API-FIRST + fallback)
// - API FIRST: POST /api/login
// - Salva sessão: auth_token, auth_role, auth_email, auth_logged_in
// - (NOVO) Salva dados profissionais: auth_nome, auth_orgao, auth_registro, auth_carimbo
// - Remember email: remember_email
// - Fallback (opcional): valida em localStorage["funcionarios"] e/ou "local_admin"
// ================================

(function () {
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("email");
  const senhaEl = document.getElementById("senha");
  const lembrarEl = document.getElementById("lembrar");
  const loginBtn = document.getElementById("loginBtn");
  const toastRoot = document.getElementById("toastRoot");

  if (!form || !emailEl || !senhaEl) {
    console.warn("[Login] Elementos do formulário não encontrados.");
    return;
  }

  function showToast(message, type = "info", timeoutMs = 3000) {
    if (!toastRoot) {
      console.warn("[Login] Toast root não encontrado.");
      return;
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = String(message || "");
    toastRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 200);
    }, timeoutMs);
  }

  function setLoading(isLoading) {
    if (!loginBtn) return;
    loginBtn.disabled = Boolean(isLoading);
    loginBtn.textContent = isLoading ? "Entrando..." : "Entrar";
  }

  // Proteção: se já está logado, redireciona
  const tokenExistente = localStorage.getItem("auth_token");
  if (tokenExistente) {
    window.location.href = "./dashboard.html";
    return;
  }

  // Preenche email lembrado
  const rememberedEmail = localStorage.getItem("remember_email");
  if (rememberedEmail) emailEl.value = rememberedEmail;

  function normalizarEmail(v) {
    return String(v || "").trim().toLowerCase();
  }

  function limparSessaoProfissional() {
    // Mantém compatibilidade: não mexe nas chaves antigas aqui
    // Só garante que dados profissionais não fiquem "sujos" entre logins.
    localStorage.removeItem("auth_nome");
    localStorage.removeItem("auth_orgao");
    localStorage.removeItem("auth_registro");
    localStorage.removeItem("auth_carimbo");
  }

  /**
   * Salva sessão base (compatível com tudo que já existe)
   */
  function salvarSessaoBase({ token, role, email }) {
    localStorage.setItem("auth_token", String(token || ""));
    localStorage.setItem("auth_role", String(role || ""));
    localStorage.setItem("auth_email", String(email || ""));
    localStorage.setItem("auth_logged_in", "true");
  }

  /**
   * Salva dados profissionais (se existirem)
   * Espera que o backend devolva algo como:
   * { nome, orgao, registro, carimbo }  (carimbo = dataURL/base64 ou URL)
   */
  function salvarSessaoProfissional({ nome, orgao, registro, carimbo }) {
    // Só salva se vier algo útil (não obriga backend)
    if (nome) localStorage.setItem("auth_nome", String(nome));
    if (orgao) localStorage.setItem("auth_orgao", String(orgao));
    if (registro) localStorage.setItem("auth_registro", String(registro));
    if (carimbo) localStorage.setItem("auth_carimbo", String(carimbo));
  }

  function lembrarEmailSeMarcado(email) {
    if (lembrarEl && lembrarEl.checked) {
      localStorage.setItem("remember_email", email);
    } else {
      localStorage.removeItem("remember_email");
    }
  }

  // ---------- Fallback LOCAL (opcional) ----------
  // 1) tenta admin de emergência em localStorage["local_admin"]
  //    formato: {"email":"...","senha":"...","role":"admin"}
  function tentarLoginLocalAdmin(email, senha) {
    try {
      const raw = localStorage.getItem("local_admin");
      if (!raw) return null;

      const admin = JSON.parse(raw);
      const ok =
        normalizarEmail(admin?.email) === email &&
        String(admin?.senha) === String(senha);

      if (!ok) return null;

      return {
        ok: true,
        token: "local-fallback-token",
        role: String(admin?.role || "admin"),
        email: String(admin?.email || email),

        // dados profissionais (opcionais)
        nome: admin?.nome || "Administrador",
        orgao: admin?.orgao || "",
        registro: admin?.registro || "",
        carimbo: admin?.carimbo || admin?.carimboDataUrl || null,
      };
    } catch {
      return null;
    }
  }

  // 2) tenta lista local de funcionários (mesmo storage que você já usa)
  //    KEY: "funcionarios"
  function tentarLoginLocalFuncionarios(email, senha) {
    try {
      const raw = localStorage.getItem("funcionarios");
      const lista = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(lista) || !lista.length) return null;

      const found = lista.find(
        (f) =>
          normalizarEmail(f?.email) === email &&
          String(f?.senha) === String(senha)
      );
      if (!found) return null;

      return {
        ok: true,
        token: "local-fallback-token",
        role: String(found?.perfil || found?.role || "funcionario"),
        email: String(found?.email || email),

        // dados profissionais (opcionais)
        nome: found?.nome || found?.nomeCompleto || "",
        orgao: found?.orgao || found?.orgaoRegulador || "",
        registro: found?.registro || found?.numeroRegistro || "",
        carimbo:
          found?.carimbo ||
          found?.carimboAssinatura ||
          found?.carimboDataUrl ||
          null,
      };
    } catch {
      return null;
    }
  }

  function tentarLoginLocal(email, senha) {
    return (
      tentarLoginLocalAdmin(email, senha) ||
      tentarLoginLocalFuncionarios(email, senha) ||
      null
    );
  }

  // ---------- API FIRST ----------
  async function tentarLoginAPI(email, senha) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") {
      return { type: "no_apiFetch" };
    }

    try {
      const data = await apiFetchFn("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, senha }),
      });
      return { type: "ok", data: data || {} };
    } catch (err) {
      return { type: "error", error: err };
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = normalizarEmail(emailEl.value);
    const senha = String(senhaEl.value || "");

    if (!email || !senha) {
      showToast("Informe email e senha.", "warn");
      return;
    }

    setLoading(true);

    // Garante que não fica dado profissional do usuário anterior
    limparSessaoProfissional();

    // 1) API FIRST
    const tentativaAPI = await tentarLoginAPI(email, senha);

    // Se API respondeu OK, valida formato esperado:
    // Esperado: { ok:true, token, role, email, (opcional) nome, orgao, registro, carimbo }
    if (tentativaAPI.type === "ok") {
      const data = tentativaAPI.data;

      if (!data?.ok) {
        showToast(data?.message || "Usuário ou senha inválidos.", "error");
        setLoading(false);
        return;
      }

      if (!data?.token) {
        showToast("Login retornou sem token. Verifique o /api/login no server.js.", "error");
        console.warn("[Login] Resposta sem token:", data);
        setLoading(false);
        return;
      }

      salvarSessaoBase({
        token: data.token,
        role: data.role || "funcionario",
        email: data.email || email,
      });

      // NOVO: dados profissionais (se vierem)
      salvarSessaoProfissional({
        nome: data.nome,
        orgao: data.orgao,
        registro: data.registro,
        carimbo: data.carimbo || data.carimboDataUrl || data.assinatura || null,
      });

      lembrarEmailSeMarcado(email);
      showToast("Login realizado com sucesso.", "success", 1500);
      window.location.href = "./dashboard.html";
      return;
    }

    // 2) Se API falhou / não carregou, tenta fallback local (opcional)
    const local = tentarLoginLocal(email, senha);
    if (!local) {
      if (tentativaAPI.type === "no_apiFetch") {
        showToast(
          "Falha: api.js não foi carregado nesta página. Verifique o <script> no HTML.",
          "error"
        );
      } else {
        showToast("Falha ao conectar no servidor. Verifique se o server.js está rodando.", "error");
        console.warn("[Login] Erro API:", tentativaAPI.error);
      }
      setLoading(false);
      return;
    }

    salvarSessaoBase(local);
    salvarSessaoProfissional(local);
    lembrarEmailSeMarcado(email);
    showToast("Login realizado com sucesso.", "success", 1500);
    window.location.href = "./dashboard.html";
  });
})();
