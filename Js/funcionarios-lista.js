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
      item.className = "item";

      const imgHtml = f.assinaturaDataUrl
        ? `<img src="${f.assinaturaDataUrl}" alt="Assinatura ${escapeHtml(f.nome)}" style="height:40px; max-width:180px; object-fit:contain;">`
        : `<span style="opacity:.7">Sem imagem</span>`;

      item.innerHTML = `
        <p><strong>Nome:</strong> ${escapeHtml(f.nome)}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(f.email)}</p>
        <p><strong>Perfil:</strong> ${escapeHtml(f.role)}</p>
        <p><strong>Órgão:</strong> ${escapeHtml(f.orgao)}</p>
        <p><strong>Registro:</strong> ${escapeHtml(f.registro)}</p>
        <p><strong>Carimbo/Assinatura:</strong> ${imgHtml}</p>
        <div class="list-actions">
          <button type="button" data-id="${String(f.id)}" class="btn btn-sm btn-imprimir">Imprimir</button>
          <button type="button" data-id="${String(f.id)}" class="btn btn-primary btn-sm">Editar</button>
          <button type="button" data-id="${String(f.id)}" class="btn btn-danger btn-sm">Remover</button>
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