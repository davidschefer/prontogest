/* ===========================
   LISTA DE PACIENTES -" Mini SGH (API-FIRST + fallback)
   - API:
       GET    /api/pacientes
       DELETE /api/pacientes/:id
   - Fallback localStorage:
       pacientes_lista_v1 (principal)
       pacientes_v1 (compat antiga, se existir)
   - o. Se falhar remover (token/offline), NfO some da tela
   - Editar: apenas aviso (mantém seu HTML)
   =========================== */

(function () {
  let lista = [];

  const LS_KEYS = ["pacientes_lista_v1", "pacientes_v1"];

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ---------------------------
     LocalStorage (fallback)
  --------------------------- */
  function lsGetFirstArray(keys) {
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        const data = raw ? JSON.parse(raw) : [];
        if (Array.isArray(data)) return data;
      } catch {}
    }
    return [];
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function normalizarLista(arr) {
    const base = Array.isArray(arr) ? arr : [];
    // dedupe por id
    const map = new Map();
    base.forEach((p) => {
      const id = String(p?.id || "");
      if (!id) return;
      if (!map.has(id)) map.set(id, p);
    });
    // mantém a ordem por nome (opcional, para UX)
    return Array.from(map.values()).sort((a, b) =>
      String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR", { sensitivity: "base" })
    );
  }

  function cachePacientesLS(arr) {
    // mantém o cache principal sempre atualizado
    lsSet("pacientes_lista_v1", normalizarLista(arr));
  }

  /* ---------------------------
     API
  --------------------------- */
  async function carregarPacientesAPI() {
    if (typeof window.apiFetch !== "function") {
      lista = normalizarLista(lsGetFirstArray(LS_KEYS));
      return false;
    }

    try {
      const resp = await window.apiFetch("/api/pacientes", { method: "GET" });
      lista = normalizarLista(Array.isArray(resp?.pacientes) ? resp.pacientes : []);
      cachePacientesLS(lista);
      return true;
    } catch (err) {
      console.warn("Lista Pacientes: falha ao carregar da API, fallback:", err?.message || err);
      lista = normalizarLista(lsGetFirstArray(LS_KEYS));
      return false;
    }
  }

  async function removerPacienteAPI(id) {
    if (typeof window.apiFetch !== "function") throw new Error("apiFetch indisponível");

    await window.apiFetch(`/api/pacientes/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    return true;
  }

  /* ---------------------------
     UI
  --------------------------- */
  function render() {
    const div = document.getElementById("listaPacientes");
    if (!div) return;

    div.classList.add("timeline");
    div.innerHTML = "<h2>Pacientes Cadastrados</h2>";

    if (!lista.length) {
      div.innerHTML += "<p>Nenhum paciente cadastrado.</p>";
      return;
    }

    lista.forEach((p, i) => {
      const item = document.createElement("div");
      item.className = "item";

      const endereco = p.endereco || {};

      item.innerHTML = `
        <div class="linha">
          <div><strong>Nome:</strong> ${escapeHtml(p.nome || "-")}</div>
          <div><strong>Nascimento:</strong> ${escapeHtml(p.nascimento || "-")}</div>
        </div>

        <div class="linha">
          <div><strong>Telefone:</strong> ${escapeHtml(p.telefone || "-")}</div>
          <div><strong>CPF:</strong> ${escapeHtml(p.cpf || "-")}</div>
        </div>

        <div class="linha">
          <div><strong>Convênio:</strong> ${escapeHtml(p.convenio || "-")}</div>
          <div><strong>Cidade:</strong> ${escapeHtml(endereco.cidade || "-")}</div>
        </div>

        <div class="list-actions">
          <button class="btn btn-sm btn-imprimir" type="button" data-index="${i}">Imprimir</button>
          <button class="btn btn-primary btn-sm" type="button" data-index="${i}">Editar</button>
          <button class="btn btn-danger btn-sm" type="button" data-index="${i}">Remover</button>
        </div>
      `;

      div.appendChild(item);
    });

    // listeners (sem onclick inline)
    div.querySelectorAll("button.btn-imprimir").forEach((btn) => {
      btn.addEventListener("click", () => imprimir(Number(btn.dataset.index)));
    });

    div.querySelectorAll("button.btn-primary").forEach((btn) => {
      btn.addEventListener("click", () => editar(Number(btn.dataset.index)));
    });

    div.querySelectorAll("button.btn-danger").forEach((btn) => {
      btn.addEventListener("click", () => remover(Number(btn.dataset.index)));
    });
  }

  function editar(index) {
    const p = lista[index];
    if (!p) return;

    // redireciona para cadastro com id
    const destino = "pacientes.html?id=" + encodeURIComponent(p.id);
    window.location.href = "./" + destino;
  }

  function imprimir(index) {
    const p = lista[index];
    if (!p) return;
    const endereco = p.endereco || {};
    const html = `
      <html><head><title>Paciente</title></head><body>
      <h2>Paciente</h2>
      <p><strong>Nome:</strong> ${escapeHtml(p.nome || "-")}</p>
      <p><strong>Nascimento:</strong> ${escapeHtml(p.nascimento || "-")}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(p.telefone || "-")}</p>
      <p><strong>CPF:</strong> ${escapeHtml(p.cpf || "-")}</p>
      <p><strong>Convênio:</strong> ${escapeHtml(p.convenio || "-")}</p>
      <p><strong>Endereço:</strong> ${escapeHtml(endereco.rua || "")}, ${escapeHtml(endereco.numero || "")}${endereco.complemento ? `, ${escapeHtml(endereco.complemento)}` : ""}, ${escapeHtml(endereco.cidade || "")} - ${escapeHtml(endereco.estado || "")}, ${escapeHtml(endereco.cep || "")}</p>
      <script>window.print();</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("Seu navegador bloqueou o pop-up de impressão. Permita pop-ups para imprimir.");
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  async function remover(index) {
    const p = lista[index];
    if (!p) return;

    if (!confirm(`Remover o paciente "${p.nome || "sem nome"}"?`)) return;

    // o. API-first: só remove da UI se API confirmar
    if (typeof window.apiFetch === "function") {
      try {
        await removerPacienteAPI(p.id);

        // remove localmente (mais leve que init)
        lista = lista.filter((x) => String(x?.id) !== String(p.id));
        cachePacientesLS(lista);
        render();

        alert("Paciente removido com sucesso!");
        return;
      } catch (err) {
        alert(err?.message || "Erro ao remover paciente (API).");
        // o. não altera lista local
        return;
      }
    }

    // o. fallback (sem API): remove do localStorage
    const cache = normalizarLista(lsGetFirstArray(LS_KEYS));
    const nova = cache.filter((x) => String(x?.id) !== String(p.id));
    cachePacientesLS(nova);

    // atualiza lista e UI
    lista = nova;
    render();
    alert("Paciente removido (fallback localStorage).");
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    await carregarPacientesAPI();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
