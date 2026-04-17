/* --- Cadastro de Pacientes (API-FIRST + fallback) --- */
/* Arquivo: Js/1-Cadastro-De-Pacientes.js */

(function () {
  // atalhos
  const el = (id) => document.getElementById(id);

  // lista em memória
  let lista = [];

  // modo edição
  let editandoId = null;

  // fallback key (mantém seu padrão atual)
  const LS_KEY_PACIENTES = "pacientes_lista_v1";

  /* ---------------------------
     Utils
  --------------------------- */
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isNetworkLikeError(msg) {
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network|conex/i.test(
      String(msg || "")
    );
  }

  // ======================
  // Fallback helpers (localStorage)
  // ======================
  function lsGetArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function lsSetArray(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {
      // não quebra por quota/privacidade
    }
  }

  function gerarIdLocal() {
    return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  // ======================
  // Validações e helpers
  // ======================
  function validarCPF(cpf) {
    cpf = (cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    const nums = cpf.split("").map(Number);

    const d1 =
      ((nums.slice(0, 9).reduce((a, c, i) => a + c * (10 - i), 0) * 10) % 11) %
      10;

    const d2 =
      ((nums.slice(0, 10).reduce((a, c, i) => a + c * (11 - i), 0) * 10) % 11) %
      10;

    return d1 === nums[9] && d2 === nums[10];
  }

  function verificarCampos() {
    const convenio = (el("convenio")?.value || "").trim();
    const planoDiv = el("planoSaude");

    // mostra/esconde campo do plano
    if (planoDiv) {
      if (convenio === "Plano de Saúde") {
        planoDiv.style.display = "block";
      } else {
        planoDiv.style.display = "none";
        if (el("planoSaudeInput")) el("planoSaudeInput").value = "";
      }
    }

    // campos obrigatórios
    const obrigatorios = [
      "nome",
      "nascimento",
      "telefone",
      "cpf",
      "rua",
      "numero",
      "cidade",
      "estado",
      "cep",
    ];

    const camposObrigatoriosOk = obrigatorios.every((id) => {
      const v = (el(id)?.value || "").trim();
      return v !== "";
    });

    const cpfValido = validarCPF(el("cpf")?.value || "");

    const planoOk = !(
      convenio === "Plano de Saúde" &&
      ((el("planoSaudeInput")?.value || "").trim() === "")
    );

    const btn = el("cadastrarBtn");
    if (btn) btn.disabled = !(camposObrigatoriosOk && cpfValido && planoOk);
  }

  function limparCampos() {
    // limpa inputs
    document.querySelectorAll("input").forEach((i) => (i.value = ""));

    // select
    if (el("convenio")) el("convenio").value = "";

    // plano
    if (el("planoSaude")) el("planoSaude").style.display = "none";
    if (el("planoSaudeInput")) el("planoSaudeInput").value = "";

    // sai do modo edição
    editandoId = null;

    // texto do botão
    const btn = el("cadastrarBtn");
    if (btn) btn.textContent = "Cadastrar Paciente";

    verificarCampos();
  }

  function montarPayloadPaciente() {
    const convenio = (el("convenio")?.value || "").trim();

    return {
      nome: (el("nome")?.value || "").trim(),
      nascimento: (el("nascimento")?.value || "").trim(),
      telefone: (el("telefone")?.value || "").trim(),

      // campos do familiar
      familiarResponsavel: (el("familiarResponsavel")?.value || "").trim(),
      telefoneFamiliar: (el("telefoneFamiliar")?.value || "").trim(),

      cpf: (el("cpf")?.value || "").trim(),
      convenio,
      planoSaude:
        convenio === "Plano de Saúde"
          ? (el("planoSaudeInput")?.value || "").trim()
          : "",

      endereco: {
        rua: (el("rua")?.value || "").trim(),
        numero: (el("numero")?.value || "").trim(),
        complemento: (el("complemento")?.value || "").trim(),
        cidade: (el("cidade")?.value || "").trim(),
        estado: (el("estado")?.value || "").trim(),
        cep: (el("cep")?.value || "").trim(),
      },
    };
  }

  // ======================
  // Renderização da lista
  // ======================
  function atualizarListaPacientes() {
    const div = el("listaPacientes");
    if (!div) return;

    div.classList.add("timeline");
    div.innerHTML = "<h2>Pacientes Cadastrados</h2>";

    if (!lista.length) {
      const vazio = document.createElement("div");
      vazio.className = "item";
      vazio.innerHTML = `<div style="padding:10px;">Nenhum paciente cadastrado.</div>`;
      div.appendChild(vazio);
      return;
    }

    lista.forEach((p, i) => {
      const item = document.createElement("div");
      item.className = "item";

      const endereco = p.endereco || {};

      item.innerHTML = `
        <div class="linha">
          <div><strong>Nome:</strong> ${escapeHtml(p.nome || "")}</div>
          <div><strong>Nascimento:</strong> ${escapeHtml(p.nascimento || "")}</div>
        </div>

        <div class="linha">
          <div><strong>Telefone:</strong> ${escapeHtml(p.telefone || "")}</div>
          <div><strong>Telefone do Familiar:</strong> ${escapeHtml(p.telefoneFamiliar || "")}</div>
        </div>

        <div class="linha">
          <div><strong>Familiar/Responsável:</strong> ${escapeHtml(p.familiarResponsavel || "")}</div>
        </div>

        <div class="linha">
          <div><strong>CPF:</strong> ${escapeHtml(p.cpf || "")}</div>
          <div><strong>Convênio:</strong> ${escapeHtml(p.convenio || "")}</div>
        </div>

        ${
          p.convenio === "Plano de Saúde"
            ? `<div><strong>Plano:</strong> ${escapeHtml(p.planoSaude || "")}</div>`
            : ""
        }

        <div>
          <strong>Endereço:</strong>
          ${escapeHtml(endereco.rua || "")}, ${escapeHtml(endereco.numero || "")}${
        endereco.complemento ? `, ${escapeHtml(endereco.complemento)}` : ""
      }, ${escapeHtml(endereco.cidade || "")} - ${escapeHtml(
        endereco.estado || ""
      )}, ${escapeHtml(endereco.cep || "")}
        </div>

        <div class="list-actions">
          <button type="button" class="btn btn-sm btn-imprimir" data-index="${i}">Imprimir</button>
          <button type="button" class="btn btn-primary btn-sm" data-index="${i}">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-index="${i}">Remover</button>
        </div>
      `;

      div.appendChild(item);
    });

    // eventos (sem onclick inline)
    div.querySelectorAll("button.btn-imprimir").forEach((btn) => {
      btn.addEventListener("click", () =>
        imprimirPaciente(Number(btn.dataset.index))
      );
    });

    div.querySelectorAll("button.btn-primary").forEach((btn) => {
      btn.addEventListener("click", () =>
        editarPaciente(Number(btn.dataset.index))
      );
    });

    div.querySelectorAll("button.btn-danger").forEach((btn) => {
      btn.addEventListener("click", () =>
        removerPaciente(Number(btn.dataset.index))
      );
    });
  }

  function imprimirPaciente(index) {
    const p = lista[index];
    if (!p) return;
    const endereco = p.endereco || {};
    const html = `
      <html><head><title>Paciente</title></head><body>
      <h2>Paciente</h2>
      <p><strong>Nome:</strong> ${escapeHtml(p.nome || "-")}</p>
      <p><strong>Nascimento:</strong> ${escapeHtml(p.nascimento || "-")}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(p.telefone || "-")}</p>
      <p><strong>Telefone do Familiar:</strong> ${escapeHtml(p.telefoneFamiliar || "-")}</p>
      <p><strong>Familiar/Responsável:</strong> ${escapeHtml(p.familiarResponsavel || "-")}</p>
      <p><strong>CPF:</strong> ${escapeHtml(p.cpf || "-")}</p>
      <p><strong>Convênio:</strong> ${escapeHtml(p.convenio || "-")}</p>
      ${p.convenio === "Plano de Saúde" ? `<p><strong>Plano:</strong> ${escapeHtml(p.planoSaude || "-")}</p>` : ""}
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

  // ======================
  // API (com fallback)
  // ======================
  async function carregarPacientes() {
    const apiFetchFn = window.apiFetch;

    // se não tiver apiFetch, vai direto no fallback
    if (typeof apiFetchFn !== "function") {
      lista = lsGetArray(LS_KEY_PACIENTES);
      atualizarListaPacientes();
      return;
    }

    try {
      const resp = await apiFetchFn("/api/pacientes", { method: "GET" });
      lista = Array.isArray(resp?.pacientes) ? resp.pacientes : [];
      lsSetArray(LS_KEY_PACIENTES, lista); // mantém fallback atualizado
    } catch (err) {
      console.warn(
        "Falha ao carregar pacientes da API. Usando fallback:",
        err?.message || err
      );
      lista = lsGetArray(LS_KEY_PACIENTES);
    }

    atualizarListaPacientes();
  }

  async function apiCreatePaciente(payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") return null;

    return await apiFetchFn("/api/pacientes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function apiUpdatePaciente(id, payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") return null;

    return await apiFetchFn(`/api/pacientes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async function apiDeletePaciente(id) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") return null;

    return await apiFetchFn(`/api/pacientes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  // ======================
  // Fallback actions (localStorage)
  // ======================
  function localCreatePaciente(payload) {
    const arr = lsGetArray(LS_KEY_PACIENTES);

    // evita duplicar CPF no modo local
    const cpfNorm = String(payload.cpf || "").trim();
    if (cpfNorm && arr.some((p) => String(p?.cpf || "").trim() === cpfNorm)) {
      throw new Error("Já existe um paciente com este CPF (fallback).");
    }

    const novo = { ...payload, id: gerarIdLocal() };
    arr.push(novo);

    lsSetArray(LS_KEY_PACIENTES, arr);
    return novo;
  }

  function localUpdatePaciente(id, payload) {
    const arr = lsGetArray(LS_KEY_PACIENTES);
    const idx = arr.findIndex((p) => String(p?.id) === String(id));
    if (idx < 0) throw new Error("Paciente não encontrado (fallback).");

    // se CPF mudou, checa duplicidade
    const cpfNorm = String(payload.cpf || "").trim();
    if (
      cpfNorm &&
      arr.some((p, i) => i !== idx && String(p?.cpf || "").trim() === cpfNorm)
    ) {
      throw new Error("Já existe outro paciente com este CPF (fallback).");
    }

    arr[idx] = { ...arr[idx], ...payload, id: arr[idx].id };
    lsSetArray(LS_KEY_PACIENTES, arr);
    return arr[idx];
  }

  function localDeletePaciente(id) {
    const arr = lsGetArray(LS_KEY_PACIENTES);
    const novo = arr.filter((p) => String(p?.id) !== String(id));
    lsSetArray(LS_KEY_PACIENTES, novo);
    return true;
  }

  // ======================
  // Ações (Cadastrar / Editar / Remover)
  // ======================
  async function cadastrar() {
    verificarCampos(); // garante validação atual

    const payload = montarPayloadPaciente();

    // validações rápidas (além do botão disabled)
    if (!payload.nome || payload.nome.length < 3) {
      alert("Informe um nome válido.");
      return;
    }
    if (!validarCPF(payload.cpf)) {
      alert("CPF inválido.");
      return;
    }

    const apiFetchFn = window.apiFetch;

    try {
      if (typeof apiFetchFn === "function") {
        if (editandoId) {
          await apiUpdatePaciente(editandoId, payload);
          alert("Paciente atualizado com sucesso!");
        } else {
          await apiCreatePaciente(payload);
          alert("Paciente cadastrado com sucesso!");
        }

        limparCampos();
        await carregarPacientes();
        return;
      }

      // fallback (sem apiFetch)
      if (editandoId) {
        localUpdatePaciente(editandoId, payload);
        alert("Paciente atualizado com sucesso! (fallback)");
      } else {
        localCreatePaciente(payload);
        alert("Paciente cadastrado com sucesso! (fallback)");
      }

      limparCampos();
      await carregarPacientes();
    } catch (err) {
      const msg = err?.message || "Erro ao salvar paciente.";

      if (typeof apiFetchFn === "function" && isNetworkLikeError(msg)) {
        try {
          if (editandoId) {
            localUpdatePaciente(editandoId, payload);
            alert("Backend indisponível. Alteração salva no fallback local.");
          } else {
            localCreatePaciente(payload);
            alert("Backend indisponível. Cadastro salvo no fallback local.");
          }
          limparCampos();
          await carregarPacientes();
          return;
        } catch (e2) {
          alert(e2?.message || msg);
          return;
        }
      }

      alert(msg);
    }
  }

  function editarPaciente(index) {
    const p = lista[index];
    if (!p) return;

    editandoId = p.id;

    // preenche form
    if (el("nome")) el("nome").value = p.nome || "";
    if (el("nascimento")) el("nascimento").value = p.nascimento || "";
    if (el("telefone")) el("telefone").value = p.telefone || "";

    if (el("telefoneFamiliar"))
      el("telefoneFamiliar").value = p.telefoneFamiliar || "";
    if (el("familiarResponsavel"))
      el("familiarResponsavel").value = p.familiarResponsavel || "";

    if (el("cpf")) el("cpf").value = p.cpf || "";
    if (el("convenio")) el("convenio").value = p.convenio || "";

    if (p.convenio === "Plano de Saúde") {
      if (el("planoSaude")) el("planoSaude").style.display = "block";
      if (el("planoSaudeInput"))
        el("planoSaudeInput").value = p.planoSaude || "";
    } else {
      if (el("planoSaude")) el("planoSaude").style.display = "none";
      if (el("planoSaudeInput")) el("planoSaudeInput").value = "";
    }

    const end = p.endereco || {};
    if (el("rua")) el("rua").value = end.rua || "";
    if (el("numero")) el("numero").value = end.numero || "";
    if (el("complemento")) el("complemento").value = end.complemento || "";
    if (el("cidade")) el("cidade").value = end.cidade || "";
    if (el("estado")) el("estado").value = end.estado || "";
    if (el("cep")) el("cep").value = end.cep || "";

    const btn = el("cadastrarBtn");
    if (btn) btn.textContent = "Salvar Alterações";

    verificarCampos();
  }

  async function removerPaciente(index) {
    const paciente = lista[index];
    if (!paciente) return;

    if (!confirm(`Remover o paciente "${paciente.nome || "sem nome"}"?`)) return;

    const apiFetchFn = window.apiFetch;

    try {
      if (typeof apiFetchFn === "function") {
        await apiDeletePaciente(paciente.id);
        alert("Paciente removido com sucesso!");
        await carregarPacientes();

        if (editandoId === paciente.id) limparCampos();
        return;
      }

      // fallback
      localDeletePaciente(paciente.id);
      alert("Paciente removido com sucesso! (fallback)");
      await carregarPacientes();

      if (editandoId === paciente.id) limparCampos();
    } catch (err) {
      const msg = err?.message || "Erro ao remover paciente.";

      if (typeof apiFetchFn === "function" && isNetworkLikeError(msg)) {
        try {
          localDeletePaciente(paciente.id);
          alert("Backend indisponível. Remoção aplicada no fallback local.");
          await carregarPacientes();
          if (editandoId === paciente.id) limparCampos();
          return;
        } catch (e2) {
          alert(e2?.message || msg);
          return;
        }
      }

      console.error(err);
      alert(msg);
    }
  }

  // ======================
  // Expor função para HTML (sem mudar onclick)
  // ======================
  window.cadastrar = cadastrar;

  // ======================
  // Listeners e init
  // ======================
  document.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", verificarCampos);
  });

  // estado inicial
  verificarCampos();

  function init() {
    carregarPacientes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
function verificarCampos() {
  // Se você ainda não definiu a lógica, deixa vazio por enquanto
  // ou coloca um console.log para confirmar:
  // console.log("verificarCampos acionado");
}

window.verificarCampos = verificarCampos;
