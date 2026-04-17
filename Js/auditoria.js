/* =====================================================
   AUDITORIA -" Mini SGH (ADMIN-ONLY)
   - GET /api/auditoria?limit=&acao=&entidade=&usuario=
   - Requer token + role admin (front + back)
   ===================================================== */

(function () {
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getRole() {
    // Ajuste se seu projeto usa outra chave
    return String(localStorage.getItem("auth_role") || localStorage.getItem("role") || "").trim();
  }

  function setStatus(msg, isError) {
    const el = document.getElementById("auditoriaStatus");
    if (!el) return;
    el.innerHTML = isError
      ? `<p style="color:#b91c1c;"><strong>${escapeHtml(msg)}</strong></p>`
      : `<p style="color:#0f766e;"><strong>${escapeHtml(msg)}</strong></p>`;
  }

  function getFiltros() {
    const acao = String(document.getElementById("filtroAcao")?.value || "").trim();
    const entidade = String(document.getElementById("filtroEntidade")?.value || "").trim();
    const usuario = String(document.getElementById("filtroUsuario")?.value || "").trim();
    const limitRaw = String(document.getElementById("filtroLimit")?.value || "200").trim();

    let limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit <= 0) limit = 200;
    if (limit > 1000) limit = 1000;

    return { acao, entidade, usuario, limit };
  }

  function montarUrlAuditoria() {
    const { acao, entidade, usuario, limit } = getFiltros();
    const params = new URLSearchParams();
    params.set("limit", String(limit));

    if (acao) params.set("acao", acao);
    if (entidade) params.set("entidade", entidade);
    if (usuario) params.set("usuario", usuario);

    return `/api/auditoria?${params.toString()}`;
  }

  function renderLista(items) {
    const div = document.getElementById("auditoriaLista");
    if (!div) return;

    if (!Array.isArray(items) || items.length === 0) {
      div.innerHTML = "<p>Nenhum registro encontrado.</p>";
      return;
    }

    // Tabela simples (sem mexer no seu CSS base)
    let html = `
      <div style="overflow:auto; border:1px solid #e5e7eb; border-radius:10px;">
        <table style="width:100%; border-collapse:collapse; min-width:900px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Data/Hora</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Usuário</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Role</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Ação</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Entidade</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">EntidadeId</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">OK</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Rota</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">IP</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;">Detalhe</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const x of items) {
      const okTxt = x?.ok ? "Sim" : "Não";
      const okColor = x?.ok ? "#0f766e" : "#b91c1c";

      html += `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.atISO || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.usuario || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.role || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.acao || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.entidade || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.entidadeId || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb; color:${okColor};"><strong>${okTxt}</strong></td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.rota || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.ip || "")}</td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(x?.detalhe || "")}</td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    div.innerHTML = html;
  }

  async function carregarAuditoria() {
    // o. front guard extra: se não for admin, nem tenta.
    const role = getRole();
    if (role && role !== "admin") {
      setStatus("Acesso negado: esta página é somente para ADMIN.", true);
      renderLista([]);
      return;
    }

    if (typeof window.apiFetch !== "function") {
      setStatus("apiFetch não encontrado. Verifique se ../Js/api.js está carregando.", true);
      return;
    }

    setStatus("Carregando auditoria...", false);

    try {
      const url = montarUrlAuditoria();
      const resp = await window.apiFetch(url, { method: "GET" });

      const items = Array.isArray(resp?.items) ? resp.items : Array.isArray(resp?.data) ? resp.data : [];
      renderLista(items);
      setStatus(`OK: ${items.length} registro(s) carregado(s).`, false);
    } catch (err) {
      setStatus(`Erro ao carregar auditoria: ${err?.message || err}`, true);
      renderLista([]);
    }
  }

  function limparFiltros() {
    const a = document.getElementById("filtroAcao");
    const e = document.getElementById("filtroEntidade");
    const u = document.getElementById("filtroUsuario");
    const l = document.getElementById("filtroLimit");

    if (a) a.value = "";
    if (e) e.value = "";
    if (u) u.value = "";
    if (l) l.value = "200";

    carregarAuditoria();
  }

  // expõe para o HTML
  window.carregarAuditoria = carregarAuditoria;
  window.limparFiltros = limparFiltros;

  // init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", carregarAuditoria);
  } else {
    carregarAuditoria();
  }
})();