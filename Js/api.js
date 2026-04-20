/* ===========================
   api.js - Mini SGH
   - Centraliza chamadas HTTP
   - Injeta JWT automaticamente
   - Tratamento uniforme de erro
   - Suporta respostas vazias (204 No Content)
   - Produção-friendly (mesma origem quando apropriado)
   - Auto-detecta Live Server e aponta p/ Express (3000)
   - Timeout p/ evitar travar quando backend cai
   - 401/403: limpa sessão (pronto p/ redirect se quiser)
   =========================== */

(function () {
  function getToken() {
    return localStorage.getItem("auth_token");
  }

  function limparSessao() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_role");
    localStorage.removeItem("auth_email");
    localStorage.removeItem("auth_logged_in");
  }

  function sanitizeBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function resolveApiBase() {
    // Override manual (prioridade máxima)
    // Ex: localStorage.setItem("api_base", "http://localhost:3000");
    const forced = sanitizeBase(localStorage.getItem("api_base"));
    if (forced) return forced;

    // Auto-detect: quando o FRONT está no Live Server, a API está no Express (3000)
    // Isso mantém o fluxo local funcionando em http://127.0.0.1:5500 ou http://localhost:5500
    const host = String(window.location.hostname || "");
    const port = String(window.location.port || "");

    const isLiveServer =
      port === "5500" || // padrão Live Server
      window.location.protocol === "file:"; // caso alguém abra por arquivo (fallback)

    if (isLiveServer) {
      // usa o mesmo host se for 127.0.0.1/localhost, senão cai pra localhost
      const apiHost =
        host === "127.0.0.1" || host === "localhost" ? host : "localhost";
      return `http://${apiHost}:3000`;
    }

    // Em produção ou quando o front está sendo servido pelo mesmo domínio,
    // usa a própria origem atual (ex.: https://prontogest.com.br)
    return sanitizeBase(window.location.origin);
  }

  function isFormData(body) {
    return typeof FormData !== "undefined" && body instanceof FormData;
  }

  async function apiFetch(path, options = {}) {
    const base = resolveApiBase();
    const token = getToken();

    const method = (options.method || "GET").toUpperCase();

    // headers (não quebra se você passar headers custom)
    const headers = { ...(options.headers || {}) };

    // Se body for JSON (objeto), converte automaticamente
    let body = options.body;
    const bodyIsPlainObject =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      !isFormData(body);

    if (bodyIsPlainObject) {
      body = JSON.stringify(body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    } else {
      // Só força JSON se existir body (evita Content-Type "à toa")
      if (
        body != null &&
        !isFormData(body) &&
        method !== "GET" &&
        method !== "HEAD"
      ) {
        if (!headers["Content-Type"] && !headers["content-type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    // JWT (respeita Authorization/authorization já enviados)
    const hasAuthHeader = Boolean(headers.Authorization || headers.authorization);
    if (token && !hasAuthHeader) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Timeout (padrão 12s). Você pode sobrescrever via options.timeoutMs
    const timeoutMs = Number(options.timeoutMs || 12000);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      // garante path correto
      const url = `${base}${String(path || "").startsWith("/") ? "" : "/"}${path || ""}`;

      res = await fetch(url, {
        ...options,
        method,
        headers,
        body,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(t);
      const msg =
        err?.name === "AbortError"
          ? "Tempo excedido ao conectar no servidor."
          : "Falha de conexão com o servidor.";
      throw new Error(msg);
    } finally {
      clearTimeout(t);
    }

    // 204 No Content
    if (res.status === 204) {
      return { ok: true };
    }

    // tenta JSON, mas não quebra se vier vazio
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    // erros HTTP padronizados
    if (!res.ok) {
      // Limpa sessão apenas quando o token estiver inválido/expirado.
      // 403 = falta de permissão e NÃO deve derrubar o login.
      if (res.status === 401) {
        limparSessao();
        // Se quiser forçar redirect aqui no futuro, descomente:
        // window.location.href = "./login.html";
      }

      throw new Error(data?.error || data?.message || `Erro ${res.status}`);
    }

    return data;
  }

  // expõe globalmente
  window.apiFetch = apiFetch;
})();