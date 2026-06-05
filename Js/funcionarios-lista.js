/* ===========================
   funcionarios-lista.js - Mini SGH (API-FIRST + fallback)
   - Lista funcionários
   - Fonte principal: API (/api/funcionarios)
   - Fallback: localStorage["funcionarios"]
   - Mantém assinatura (base64)
   =========================== */

document.addEventListener("DOMContentLoaded", async () => {
  const listaEl = document.getElementById("listaFuncionarios");
  if (!listaEl) return;

  const KEY_FUNCIONARIOS = "funcionarios";

  function garantirCssFuncionarios() {
    const href = "../Css/funcionarios-cadastro.css";
    const jaCarregado = Array.from(document.styleSheets || []).some((sheet) =>
      String(sheet.href || "").endsWith("/Css/funcionarios-cadastro.css")
    );
    if (jaCarregado) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  garantirCssFuncionarios();

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getFuncionariosLS() {
    try {
      const raw = localStorage.getItem(KEY_FUNCIONARIOS);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function setFuncionariosLS(lista) {
    localStorage.setItem(KEY_FUNCIONARIOS, JSON.stringify(lista));
  }

  async function apiListFuncionarios() {
    const resp = await apiFetch("/api/funcionarios");
    return Array.isArray(resp?.items)
      ? resp.items
      : Array.isArray(resp?.funcionarios)
      ? resp.funcionarios
      : Array.isArray(resp?.lista)
      ? resp.lista
      : [];
  }

  function renderFuncionarios(lista) {
    listaEl.innerHTML = "<h2>Funcionários Cadastrados</h2>";

    if (!lista.length) {
      listaEl.innerHTML += "<p>Nenhum funcionário cadastrado.</p>";
      return;
    }

    lista.forEach((f) => {
      const item = document.createElement("div");
      item.className = "item funcionario-card";
      const id = escapeHtml(f.id || f.email || f.nome || "");
      const assinaturaOk = Boolean(f.assinaturaDataUrl);

      const imgHtml = f.assinaturaDataUrl
        ? `<img src="${escapeHtml(f.assinaturaDataUrl)}" alt="Assinatura ${escapeHtml(f.nome)}">`
        : `<span>Sem imagem</span>`;

      item.innerHTML = `
        <div class="func-header">
          <div class="func-main">
            <div class="func-nome">${escapeHtml(f.nome || "-")}</div>
            <div class="func-email">${escapeHtml(f.email || "-")}</div>
          </div>
          <div class="func-badges">
            <span class="func-badge">${escapeHtml(f.role || "perfil")}</span>
            <span class="func-badge ${assinaturaOk ? "ok" : "muted"}">${assinaturaOk ? "Com assinatura" : "Sem assinatura"}</span>
          </div>
        </div>

        <div class="func-body">
          <div class="func-chips">
            ${f.orgao ? `<span class="func-chip-meta"><span class="chip-label">Órgão:</span><span class="func-chip">${escapeHtml(f.orgao)}</span></span>` : ""}
            ${f.registro ? `<span class="func-chip-meta"><span class="chip-label">Registro:</span><span class="func-chip">${escapeHtml(f.registro)}</span></span>` : ""}
            ${f.role ? `<span class="func-chip-meta"><span class="chip-label">Perfil:</span><span class="func-chip">${escapeHtml(f.role)}</span></span>` : ""}
          </div>
          <div class="func-assinatura">${imgHtml}</div>
        </div>

        <div class="func-footer list-actions">
          <button type="button" class="btn btn-sm btn-imprimir" data-id="${id}">Imprimir</button>
          <button type="button" class="btn btn-primary btn-sm" data-id="${id}">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-id="${id}">Remover</button>
        </div>
      `;

      listaEl.appendChild(item);
    });

    listaEl.querySelectorAll("button.btn-imprimir").forEach((btn) => {
      btn.addEventListener("click", () => imprimirFuncionario(btn.dataset.id));
    });

    listaEl.querySelectorAll("button.btn-primary").forEach((btn) => {
      btn.addEventListener("click", () => editarFuncionario(btn.dataset.id));
    });

    listaEl.querySelectorAll("button.btn-danger").forEach((btn) => {
      btn.addEventListener("click", () => removerFuncionario(btn.dataset.id));
    });
  }

  let funcionarios = [];

  try {
    const apiData = await apiListFuncionarios();
    const lsData = getFuncionariosLS();

    funcionarios = Array.isArray(apiData) && apiData.length ? apiData : lsData;
    setFuncionariosLS(funcionarios);
  } catch (err) {
    console.warn("Funcionários: falha ao carregar da API, usando localStorage:", err?.message || err);
    funcionarios = getFuncionariosLS();
  }

  renderFuncionarios(funcionarios);
});

function imprimirFuncionario(id) {
  const lista = JSON.parse(localStorage.getItem("funcionarios") || "[]");
  const f = lista.find((x) => String(x?.id) === String(id));
  if (!f) return;

  const html = `
    <html>
    <head><title>Funcionário</title></head>
    <body>
      <h2>Funcionário</h2>
      <p><strong>Nome:</strong> ${f.nome || "-"}</p>
      <p><strong>E-mail:</strong> ${f.email || "-"}</p>
      <p><strong>Perfil:</strong> ${f.role || "-"}</p>
      <p><strong>Órgão:</strong> ${f.orgao || "-"}</p>
      <p><strong>Registro:</strong> ${f.registro || "-"}</p>
      ${f.assinaturaDataUrl ? `<p><img src="${f.assinaturaDataUrl}" style="height:60px;"></p>` : ""}
      <script>window.print();</script>
    </body>
    </html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Seu navegador bloqueou o pop-up de impressão. Permita pop-ups para imprimir.");
    return;
  }

  w.document.write(html);
  w.document.close();
}

function editarFuncionario(id) {
  window.location.href = "./funcionarios-cadastro.html?id=" + encodeURIComponent(id);
}

async function removerFuncionario(id) {
  if (!confirm("Remover este funcionário?")) return;

  try {
    if (typeof window.apiFetch === "function") {
      await window.apiFetch(`/api/funcionarios/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
  } catch (err) {
    console.warn("Falha ao remover na API:", err?.message || err);
  }

  const lista = JSON.parse(localStorage.getItem("funcionarios") || "[]");
  const nova = lista.filter((x) => String(x?.id) !== String(id));
  localStorage.setItem("funcionarios", JSON.stringify(nova));
  window.location.reload();
}
