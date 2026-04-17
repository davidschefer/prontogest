/* ============================================================
   3-Prontuario-Eletronico-Do-Paciente.js -" Mini SGH (PEP)
   - API-FIRST + fallback LS
   - Resumo do paciente (triagem / vitais / evolução)
   - Contadores nas abas
   - Modo edição visível + Cancelar
   - Timeline nas evoluções (visual via CSS)
   - Persistência da aba ativa (sem depender do prontuario-tabs.js)
   ============================================================ */

(function () {
  const $ = (id) => document.getElementById(id);

  const LS_KEYS = {
    triagem: (pacienteId) => `triagem_${pacienteId}`,
    patologias: (pacienteId) => `patologias_${pacienteId}`,
    vitais: (pacienteId) => `vitais_${pacienteId}`,
    medicamentos: (pacienteId) => `medicamentos_${pacienteId}`,
    documentos: (pacienteId) => `documentos_${pacienteId}`,
    evolucoes: (pacienteId) => `evolucoes_${pacienteId}`,
  };

  const LS_PRESCRICOES = "prescricoes_v1";
  const LS_ABA_ATIVA = "pep_aba_ativa_v1";
  const CARIMBO_URL = "../IMG/carimbo.png";

  let pacienteAtual = "";
  let pacienteAtualNome = "";
  let pacientes = [];

  let modoEdicaoEvolucaoId = null;

  /* ---------------------------
     LocalStorage utils
  --------------------------- */
  function lsGetArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function lsSetArray(key, arr) {
    lsSet(key, Array.isArray(arr) ? arr : []);
  }

  function nowBR() {
    return new Date().toLocaleString("pt-BR");
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseNumeroFlex(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function resumirDescricaoEvolucao(texto) {
    const raw = String(texto || "").trim();
    if (!raw) return "-";

    const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const target = "emergencia";
    const idx = normalized.indexOf(target);
    if (idx >= 0) {
      const fim = idx + target.length;
      return raw.slice(0, fim).trimEnd() + "...";
    }

    if (raw.length <= 120) return raw;
    return raw.slice(0, 120).trimEnd() + "...";
  }

  /* ---------------------------
     o. Profissional logado (PEP)
     - usa auth_user se existir (igual triagem)
     - fallback para auth_email/auth_role
  --------------------------- */
  function mostrarProfissionalLogado() {
    const box = $("profissionalBox");
    if (!box) return;

    let user = null;
    try {
      user = JSON.parse(localStorage.getItem("auth_user"));
    } catch {
      user = null;
    }

    const emailFallback = localStorage.getItem("auth_email");
    const roleFallback =
      localStorage.getItem("auth_role") ||
      localStorage.getItem("auth_perfil") ||
      localStorage.getItem("auth_tipo") ||
      "";

    const email = user?.email || emailFallback;
    const role = user?.role || roleFallback;

    if (!email) return;

    box.style.display = "block";
    box.innerHTML = `Profissional logado: ${email}${role ? ` (${role})` : ""}`;
  }

  /* ---------------------------
     Usuário logado (para evoluções)
  --------------------------- */
  function getUsuarioLogado() {
    const email = localStorage.getItem("auth_email");
    const logged = localStorage.getItem("auth_logged_in");
    if (logged === "true" && email) return email;
    return "não identificado";
  }

  /* ---------------------------
     Pacientes (API-FIRST + fallback)
  --------------------------- */
  async function carregarPacientes() {
    const apiFetchFn = window.apiFetch;
    const LS_PACIENTES = "pacientes_lista_v1";

    if (typeof apiFetchFn !== "function") {
      pacientes = lsGetArray(LS_PACIENTES);
      return;
    }

    try {
      const resp = await apiFetchFn("/api/pacientes", { method: "GET" });
      pacientes = Array.isArray(resp?.pacientes) ? resp.pacientes : [];
      lsSetArray(LS_PACIENTES, pacientes);
    } catch (err) {
      console.warn("Erro ao carregar pacientes (PEP). Usando fallback:", err?.message || err);
      pacientes = lsGetArray(LS_PACIENTES);
    }
  }

  function getPacienteNomeById(id) {
    const pid = String(id || "");
    const p = pacientes.find((x) => String(x?.id) === pid);
    return p?.nome || "";
  }

  function popularSelectPacientes() {
    const sel = $("pacienteSelect");
    if (!sel) return;

    sel.innerHTML = `<option value="">Selecione um paciente...</option>`;

    if (!pacientes.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(Nenhum paciente cadastrado)";
      sel.appendChild(opt);
      return;
    }

    pacientes.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome || "Sem nome";
      sel.appendChild(opt);
    });
  }

  /* ============================================================
     API helpers (PEP)
  ============================================================ */
  function extrairItemsFlex(resp, entity) {
    if (!resp || typeof resp !== "object") return [];
    if (Array.isArray(resp.items)) return resp.items;

    const alt =
      resp[entity] ||
      resp[entity?.slice(0, -1)] ||
      resp.data ||
      resp.lista;

    return Array.isArray(alt) ? alt : [];
  }

  async function pepApiList(entity, pacienteId) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const url = `/api/${entity}?pacienteId=${encodeURIComponent(pacienteId)}`;
    const resp = await apiFetchFn(url, { method: "GET" });
    return extrairItemsFlex(resp, entity);
  }

  async function pepApiCreate(entity, payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn(`/api/${entity}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return resp?.item || null;
  }

  async function pepApiUpdate(entity, id, payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn(`/api/${entity}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return resp?.item || null;
  }

  async function pepApiDelete(entity, id) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    await apiFetchFn(`/api/${entity}/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  }

  async function pepSyncEntityToLS(entity, pacienteId, lsKey) {
    try {
      const items = await pepApiList(entity, pacienteId);
      lsSetArray(lsKey, items);
      return true;
    } catch (err) {
      console.warn(`PEP: falha ao sync ${entity} da API, usando localStorage:`, err?.message || err);
      return false;
    }
  }

  async function pepSyncAllToLS(pacienteId) {
    await Promise.all([
      pepSyncEntityToLS("patologias", pacienteId, LS_KEYS.patologias(pacienteId)),
      pepSyncEntityToLS("vitais", pacienteId, LS_KEYS.vitais(pacienteId)),
      pepSyncEntityToLS("medicamentos", pacienteId, LS_KEYS.medicamentos(pacienteId)),
      pepSyncEntityToLS("documentos", pacienteId, LS_KEYS.documentos(pacienteId)),
      pepSyncEntityToLS("evolucoes", pacienteId, LS_KEYS.evolucoes(pacienteId)),
    ]);
  }

  /* ============================================================
     Prescrições -> Medicamentos (sem duplicar)
  ============================================================ */
  function importarPrescricoesParaMedicamentos(pacienteId) {
    let todas = [];
    try {
      const raw = localStorage.getItem(LS_PRESCRICOES);
      const data = raw ? JSON.parse(raw) : [];
      todas = Array.isArray(data) ? data : [];
    } catch {
      todas = [];
    }

    const doPaciente = todas.filter((p) => String(p?.pacienteId) === String(pacienteId));
    if (!doPaciente.length) return;

    const keyMed = LS_KEYS.medicamentos(pacienteId);
    const medsAtuais = lsGetArray(keyMed);

    const jaTem = new Set(
      medsAtuais
        .filter((m) => m?.origem === "prescricao" && m?.prescricaoId)
        .map((m) => String(m.prescricaoId))
    );

    let mudou = false;

    doPaciente.forEach((pr) => {
      const prescricaoId = String(pr?.id || "");
      if (!prescricaoId) return;
      if (jaTem.has(prescricaoId)) return;

      const nome = String(pr?.medicamento || "").trim();
      const dose = String(pr?.dose || "").trim();
      const frequencia = String(pr?.frequencia || "").trim();
      const via = String(pr?.via || "").trim();

      medsAtuais.unshift({
        id: uid(),
        pacienteId,
        origem: "prescricao",
        prescricaoId,
        nome,
        posologia: [dose, frequencia, via].filter(Boolean).join(" - "),
        inicio: String(pr?.dataHoraBR || "").trim() || nowBR(),
        status: "Prescrito",
        observacoes: String(pr?.observacoes || "").trim(),
      });

      mudou = true;
    });

    if (mudou) lsSetArray(keyMed, medsAtuais);
  }

  /* ============================================================
     Triagem -> Patologias (diagnóstico)
  ============================================================ */
  async function importarDiagnosticoDaTriagemParaPatologias(pacienteId) {
    const raw = localStorage.getItem(LS_KEYS.triagem(pacienteId));
    if (!raw) return;

    let triagem;
    try {
      triagem = JSON.parse(raw);
    } catch {
      return;
    }

    const diagnostico = String(triagem?.diagnostico || "").trim();
    if (!diagnostico) return;

    const keyPat = LS_KEYS.patologias(pacienteId);
    const patologias = lsGetArray(keyPat);

    const jaExiste = patologias.some(
      (x) =>
        String(x?.nome || "").toLowerCase() === diagnostico.toLowerCase() &&
        x?.origem === "triagem"
    );
    if (jaExiste) return;

    const novo = {
      id: uid(),
      pacienteId,
      nome: diagnostico,
      detalhes: `Importado automaticamente da Triagem em ${nowBR()}`,
      origem: "triagem",
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiCreate("patologias", novo);
        if (salvo) {
          const arr = lsGetArray(keyPat);
          const exists = arr.some((x) => String(x?.id) === String(salvo.id));
          if (!exists) arr.unshift(salvo);
          lsSetArray(keyPat, arr);
          return;
        }
      } catch (err) {
        console.warn("Triagem->Patologias: falha API, usando fallback:", err?.message || err);
      }
    }

    patologias.unshift(novo);
    lsSetArray(keyPat, patologias);
  }

  /* ============================================================
     Resumo + contadores
  ============================================================ */
  function atualizarResumoPaciente() {
    const nomeEl = $("resumoNome");
    const idEl = $("resumoId");
    const triEl = $("resumoTriagem");
    const diagEl = $("resumoDiag");
    const vitEl = $("resumoVitais");
    const vitDataEl = $("resumoVitaisData");
    const evoEl = $("resumoEvolucao");
    const profEl = $("resumoProf");
    if (!nomeEl) return;

    if (!pacienteAtual) {
      nomeEl.textContent = "-";
      if (idEl) idEl.textContent = "ID: -";
      if (triEl) triEl.textContent = "-";
      if (diagEl) diagEl.textContent = "Diagnóstico: -";
      if (vitEl) vitEl.textContent = "-";
      if (vitDataEl) vitDataEl.textContent = "-";
      if (evoEl) evoEl.textContent = "-";
      if (profEl) profEl.textContent = "Profissional: -";
      return;
    }

    const nomePaciente = pacienteAtualNome || getPacienteNomeById(pacienteAtual) || "-";
    nomeEl.textContent = nomePaciente;
    if (idEl) idEl.textContent = `ID: ${pacienteAtual}`;

    let triagem = null;
    try {
      triagem = JSON.parse(localStorage.getItem(LS_KEYS.triagem(pacienteAtual)) || "null");
    } catch {
      triagem = null;
    }

    const triData = triagem?.dataHoraBR || triagem?.dataHora || "Sem triagem";
    const diag = String(triagem?.diagnostico || "").trim() || "-";
    if (triEl) triEl.textContent = triData;
    if (diagEl) diagEl.textContent = `Diagnóstico: ${diag}`;

    const vitais = lsGetArray(LS_KEYS.vitais(pacienteAtual));
    const ultimoVital = vitais[0];
    if (ultimoVital) {
      const pa = ultimoVital.pa || "-";
      const fc = ultimoVital.fc || "-";
      const sat = ultimoVital.sat || "-";
      const temp = ultimoVital.temp || "-";
      vitEl.textContent = `PA ${pa} | FC ${fc} | SAT ${sat} | Temp ${temp}`;
      vitDataEl.textContent = ultimoVital.dataHora || "-";
    } else {
      vitEl.textContent = "Sem registros";
      vitDataEl.textContent = "-";
    }

    const evolucoes = lsGetArray(LS_KEYS.evolucoes(pacienteAtual));
    const ultimaEvo = evolucoes[0];
    if (ultimaEvo) {
      evoEl.textContent = `${ultimaEvo.dataHora || "-"} - ${ultimaEvo.tipo || "Evolução"}`;
      profEl.textContent = `Profissional: ${ultimaEvo.usuario || "-"}`;
    } else {
      evoEl.textContent = "Sem evolução";
      profEl.textContent = "Profissional: -";
    }
  }

  function atualizarContadores() {
    if (!pacienteAtual) {
      if ($("countEvo")) $("countEvo").textContent = "(0)";
      if ($("countPat")) $("countPat").textContent = "(0)";
      if ($("countVit")) $("countVit").textContent = "(0)";
      if ($("countMed")) $("countMed").textContent = "(0)";
      if ($("countDoc")) $("countDoc").textContent = "(0)";
      return;
    }

    const evo = lsGetArray(LS_KEYS.evolucoes(pacienteAtual)).length;
    const pat = lsGetArray(LS_KEYS.patologias(pacienteAtual)).length;
    const vit = lsGetArray(LS_KEYS.vitais(pacienteAtual)).length;
    const med = lsGetArray(LS_KEYS.medicamentos(pacienteAtual)).length;
    const doc = lsGetArray(LS_KEYS.documentos(pacienteAtual)).length;

    if ($("countEvo")) $("countEvo").textContent = `(${evo})`;
    if ($("countPat")) $("countPat").textContent = `(${pat})`;
    if ($("countVit")) $("countVit").textContent = `(${vit})`;
    if ($("countMed")) $("countMed").textContent = `(${med})`;
    if ($("countDoc")) $("countDoc").textContent = `(${doc})`;
  }

  function refreshResumoContadores() {
    atualizarContadores();
    atualizarResumoPaciente();
  }

  /* ============================================================
     Patologias
  ============================================================ */
  function renderPatologias() {
    const tbody = $("tabelaPatologias");
    if (!tbody) return;

    if (!pacienteAtual) {
      tbody.innerHTML = `<tr><td colspan="3">Selecione um paciente.</td></tr>`;
      refreshResumoContadores();
      return;
    }

    const dados = lsGetArray(LS_KEYS.patologias(pacienteAtual));
    if (!dados.length) {
      tbody.innerHTML = `<tr><td colspan="3">Nenhuma patologia cadastrada.</td></tr>`;
      refreshResumoContadores();
      return;
    }

    tbody.innerHTML = dados
      .map(
        (p) => `
        <tr>
          <td>${escapeHtml(p.nome)}</td>
          <td>${escapeHtml(p.detalhes || "")}</td>
          <td>
            <button class="editar" type="button" onclick="editarPatologia('${escapeHtml(p.id)}')">Editar</button>
            <button class="remover" type="button" onclick="removerPatologia('${escapeHtml(p.id)}')">Remover</button>
          </td>
        </tr>
      `
      )
      .join("");

    refreshResumoContadores();
  }

  async function abrirCadastroPatologia() {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const nome = prompt("Patologia (nome):");
    if (!nome || !nome.trim()) return;

    const detalhes = prompt("Detalhes / histórico (opcional):") || "";

    const key = LS_KEYS.patologias(pacienteAtual);
    const dados = lsGetArray(key);

    const novo = {
      id: uid(),
      pacienteId: pacienteAtual,
      nome: nome.trim(),
      detalhes: detalhes.trim(),
      origem: "manual",
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiCreate("patologias", novo);
        if (salvo) {
          dados.unshift(salvo);
          lsSetArray(key, dados);
          renderPatologias();
          return;
        }
      } catch (err) {
        console.warn("Falha ao salvar patologia na API, usando localStorage:", err?.message || err);
      }
    }

    dados.unshift(novo);
    lsSetArray(key, dados);
    renderPatologias();
  }

  async function editarPatologia(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.patologias(pacienteAtual);
    const dados = lsGetArray(key);

    const item = dados.find((x) => String(x?.id) === String(id));
    if (!item) return;

    const novoNome = prompt("Editar patologia:", item.nome);
    if (!novoNome || !novoNome.trim()) return;

    const novosDetalhes = prompt("Editar detalhes:", item.detalhes || "") ?? item.detalhes;

    const patch = {
      nome: novoNome.trim(),
      detalhes: String(novosDetalhes || "").trim(),
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiUpdate("patologias", id, patch);
        if (salvo) {
          Object.assign(item, salvo);
          lsSetArray(key, dados);
          renderPatologias();
          return;
        }
      } catch (err) {
        console.warn("Falha ao editar patologia na API, usando localStorage:", err?.message || err);
      }
    }

    Object.assign(item, patch);
    lsSetArray(key, dados);
    renderPatologias();
  }

  async function removerPatologia(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.patologias(pacienteAtual);
    let dados = lsGetArray(key);

    if (!confirm("Remover esta patologia?")) return;

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        await pepApiDelete("patologias", id);
      } catch (err) {
        console.warn("Falha ao remover patologia na API, removendo do localStorage:", err?.message || err);
      }
    }

    dados = dados.filter((x) => String(x?.id) !== String(id));
    lsSetArray(key, dados);
    renderPatologias();
  }

  function filtrarPatologias() {
    const input = $("buscarPatologia");
    const tbody = $("tabelaPatologias");
    if (!input || !tbody) return;

    if (!pacienteAtual) {
      tbody.innerHTML = `<tr><td colspan="3">Selecione um paciente.</td></tr>`;
      return;
    }

    const q = (input.value || "").toLowerCase().trim();
    const dados = lsGetArray(LS_KEYS.patologias(pacienteAtual));

    const filtrado = dados.filter(
      (p) =>
        String(p?.nome || "").toLowerCase().includes(q) ||
        String(p?.detalhes || "").toLowerCase().includes(q)
    );

    if (!filtrado.length) {
      tbody.innerHTML = `<tr><td colspan="3">Nenhum resultado.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtrado
      .map(
        (p) => `
        <tr>
          <td>${escapeHtml(p.nome)}</td>
          <td>${escapeHtml(p.detalhes || "")}</td>
          <td>
            <button class="editar" type="button" onclick="editarPatologia('${escapeHtml(p.id)}')">Editar</button>
            <button class="remover" type="button" onclick="removerPatologia('${escapeHtml(p.id)}')">Remover</button>
          </td>
        </tr>
      `
      )
      .join("");
  }

  /* ============================================================
     Vitais
  ============================================================ */
  function renderVitais() {
    const tbody = $("tabelaVitais");
    if (!tbody) return;

    if (!pacienteAtual) {
      tbody.innerHTML = `<tr><td colspan="8">Selecione um paciente.</td></tr>`;
      refreshResumoContadores();
      return;
    }

    const dados = lsGetArray(LS_KEYS.vitais(pacienteAtual));
    if (!dados.length) {
      tbody.innerHTML = `<tr><td colspan="8">Nenhum registro de sinais vitais.</td></tr>`;
      refreshResumoContadores();
      return;
    }

    tbody.innerHTML = dados
      .map(
        (v) => `
        <tr>
          <td>${escapeHtml(v.dataHora)}</td>
          <td>${escapeHtml(v.pa)}</td>
          <td>${escapeHtml(v.fc)}</td>
          <td>${escapeHtml(v.fr)}</td>
          <td>${escapeHtml(v.sat)}</td>
          <td>${escapeHtml(v.temp)}</td>
          <td>${escapeHtml(v.hgt)}</td>
          <td>
            <button class="remover" type="button" onclick="removerVitais('${escapeHtml(v.id)}')">Remover</button>
          </td>
        </tr>
      `
      )
      .join("");

    refreshResumoContadores();
  }

  async function abrirCadastroVitais() {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const pa = prompt("PA (ex: 120/80):") || "";
    const fc = prompt("FC (bpm):") || "";
    const fr = prompt("FR (rpm):") || "";
    const sat = prompt("SAT (%):") || "";
    const temp = prompt("Temperatura (°C):") || "";
    const hgt = prompt("HGT (mg/dl):") || "";

    const satNum = parseNumeroFlex(sat);
    if (sat && satNum !== null && (satNum < 0 || satNum > 100)) {
      alert("SAT deve ser 0-100.");
      return;
    }

    const key = LS_KEYS.vitais(pacienteAtual);
    const dados = lsGetArray(key);

    const novo = {
      id: uid(),
      pacienteId: pacienteAtual,
      origem: "manual",
      dataHora: nowBR(),
      dataHoraISO: new Date().toISOString(),
      pa: pa.trim(),
      fc: fc.trim(),
      fr: fr.trim(),
      sat: sat.trim(),
      temp: String(temp).trim().replace(",", "."),
      hgt: hgt.trim(),
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiCreate("vitais", novo);
        if (salvo) {
          dados.unshift(salvo);
          lsSetArray(key, dados);
          renderVitais();
          return;
        }
      } catch (err) {
        console.warn("Falha ao salvar vitais na API, usando localStorage:", err?.message || err);
      }
    }

    dados.unshift(novo);
    lsSetArray(key, dados);
    renderVitais();
  }

  async function removerVitais(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.vitais(pacienteAtual);
    let dados = lsGetArray(key);
    if (!confirm("Remover este registro de sinais vitais?")) return;

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        await pepApiDelete("vitais", id);
      } catch (err) {
        console.warn("Falha ao remover vitais na API, removendo do localStorage:", err?.message || err);
      }
    }

    dados = dados.filter((x) => String(x?.id) !== String(id));
    lsSetArray(key, dados);
    renderVitais();
  }

  /* ============================================================
     Medicamentos
  ============================================================ */
  function renderMedicamentos() {
    const tbody = $("tabelaMedicamentos");
    if (!tbody) return;

    if (!pacienteAtual) {
      tbody.innerHTML = `<tr><td colspan="5">Selecione um paciente.</td></tr>`;
      refreshResumoContadores();
      return;
    }

    const dados = lsGetArray(LS_KEYS.medicamentos(pacienteAtual));
    if (!dados.length) {
      tbody.innerHTML = `<tr><td colspan="5">Nenhum medicamento cadastrado.</td></tr>`;
      refreshResumoContadores();
      return;
    }

    tbody.innerHTML = dados
      .map(
        (m) => `
        <tr>
          <td>${escapeHtml(m.nome)}</td>
          <td>${escapeHtml(m.posologia)}</td>
          <td>${escapeHtml(m.inicio)}</td>
          <td>${escapeHtml(m.status)}</td>
          <td>
            <button class="editar" type="button" onclick="editarMedicamento('${escapeHtml(m.id)}')">Editar</button>
            <button class="remover" type="button" onclick="removerMedicamento('${escapeHtml(m.id)}')">Remover</button>
          </td>
        </tr>
      `
      )
      .join("");

    refreshResumoContadores();
  }

  async function abrirCadastroMedicamento() {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const nome = prompt("Medicamento (nome):");
    if (!nome || !nome.trim()) return;

    const posologia = prompt("Posologia (ex: 1cp 8/8h):") || "";
    const inicio = prompt("Data de início (ex: 03/02/2026):") || nowBR();
    const status = prompt("Status (Ativo / Suspenso):", "Ativo") || "Ativo";

    const key = LS_KEYS.medicamentos(pacienteAtual);
    const dados = lsGetArray(key);

    const novo = {
      id: uid(),
      pacienteId: pacienteAtual,
      origem: "manual",
      nome: nome.trim(),
      posologia: posologia.trim(),
      inicio: String(inicio).trim(),
      status: String(status).trim(),
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiCreate("medicamentos", novo);
        if (salvo) {
          dados.unshift(salvo);
          lsSetArray(key, dados);
          renderMedicamentos();
          return;
        }
      } catch (err) {
        console.warn("Falha ao salvar medicamento na API, usando localStorage:", err?.message || err);
      }
    }

    dados.unshift(novo);
    lsSetArray(key, dados);
    renderMedicamentos();
  }

  async function editarMedicamento(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.medicamentos(pacienteAtual);
    const dados = lsGetArray(key);

    const item = dados.find((x) => String(x?.id) === String(id));
    if (!item) return;

    const nome = prompt("Editar medicamento:", item.nome);
    if (!nome || !nome.trim()) return;

    const posologia = prompt("Editar posologia:", item.posologia) ?? item.posologia;
    const inicio = prompt("Editar início:", item.inicio) ?? item.inicio;
    const status = prompt("Editar status:", item.status) ?? item.status;

    const patch = {
      nome: nome.trim(),
      posologia: String(posologia || "").trim(),
      inicio: String(inicio || "").trim(),
      status: String(status || "").trim(),
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiUpdate("medicamentos", id, patch);
        if (salvo) {
          Object.assign(item, salvo);
          lsSetArray(key, dados);
          renderMedicamentos();
          return;
        }
      } catch (err) {
        console.warn("Falha ao editar medicamento na API, usando localStorage:", err?.message || err);
      }
    }

    Object.assign(item, patch);
    lsSetArray(key, dados);
    renderMedicamentos();
  }

  async function removerMedicamento(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.medicamentos(pacienteAtual);
    let dados = lsGetArray(key);
    if (!confirm("Remover este medicamento?")) return;

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        await pepApiDelete("medicamentos", id);
      } catch (err) {
        console.warn("Falha ao remover medicamento na API, removendo do localStorage:", err?.message || err);
      }
    }

    dados = dados.filter((x) => String(x?.id) !== String(id));
    lsSetArray(key, dados);
    renderMedicamentos();
  }

  function filtrarMedicamentos() {
    const input = $("buscarMedicamento");
    const tbody = $("tabelaMedicamentos");
    if (!input || !tbody) return;

    if (!pacienteAtual) {
      tbody.innerHTML = `<tr><td colspan="5">Selecione um paciente.</td></tr>`;
      return;
    }

    const q = (input.value || "").toLowerCase().trim();
    const dados = lsGetArray(LS_KEYS.medicamentos(pacienteAtual));

    const filtrado = dados.filter(
      (m) =>
        String(m?.nome || "").toLowerCase().includes(q) ||
        String(m?.posologia || "").toLowerCase().includes(q) ||
        String(m?.status || "").toLowerCase().includes(q)
    );

    if (!filtrado.length) {
      tbody.innerHTML = `<tr><td colspan="5">Nenhum resultado.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtrado
      .map(
        (m) => `
        <tr>
          <td>${escapeHtml(m.nome)}</td>
          <td>${escapeHtml(m.posologia)}</td>
          <td>${escapeHtml(m.inicio)}</td>
          <td>${escapeHtml(m.status)}</td>
          <td>
            <button class="editar" type="button" onclick="editarMedicamento('${escapeHtml(m.id)}')">Editar</button>
            <button class="remover" type="button" onclick="removerMedicamento('${escapeHtml(m.id)}')">Remover</button>
          </td>
        </tr>
      `
      )
      .join("");
  }

  /* ============================================================
     Documentos
  ============================================================ */
  function renderDocumentos() {
    const wrap = $("listaDocumentos");
    if (!wrap) return;

    if (!pacienteAtual) {
      wrap.innerHTML = `<p>Selecione um paciente.</p>`;
      refreshResumoContadores();
      return;
    }

    const dados = lsGetArray(LS_KEYS.documentos(pacienteAtual));
    if (!dados.length) {
      wrap.innerHTML = `<p>Nenhum documento anexado.</p>`;
      refreshResumoContadores();
      return;
    }

    wrap.innerHTML = dados
      .map((d) => {
        const nome = escapeHtml(d.nome);
        const desc = escapeHtml(d.descricao || "");
        const url = String(d.url || "").trim();

        const linkHtml = url
          ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir</a></p>`
          : "";

        return `
          <div class="item">
            <h3>${nome}</h3>
            <p>${desc}</p>
            ${linkHtml}
            <button class="remover" type="button" onclick="removerDocumento('${escapeHtml(d.id)}')">Remover</button>
          </div>
        `;
      })
      .join("");

    refreshResumoContadores();
  }

  async function abrirAnexoDocumento() {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const nome = prompt("Nome do documento:");
    if (!nome || !nome.trim()) return;

    const descricao = prompt("Descrição (opcional):") || "";
    const url = prompt("Link do documento (opcional):") || "";

    const key = LS_KEYS.documentos(pacienteAtual);
    const dados = lsGetArray(key);

    const novo = {
      id: uid(),
      pacienteId: pacienteAtual,
      nome: nome.trim(),
      descricao: descricao.trim(),
      url: String(url).trim(),
      dataHora: nowBR(),
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiCreate("documentos", novo);
        if (salvo) {
          dados.unshift(salvo);
          lsSetArray(key, dados);
          renderDocumentos();
          return;
        }
      } catch (err) {
        console.warn("Falha ao salvar documento na API, usando localStorage:", err?.message || err);
      }
    }

    dados.unshift(novo);
    lsSetArray(key, dados);
    renderDocumentos();
  }

  async function removerDocumento(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.documentos(pacienteAtual);
    let dados = lsGetArray(key);
    if (!confirm("Remover este documento?")) return;

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        await pepApiDelete("documentos", id);
      } catch (err) {
        console.warn("Falha ao remover documento na API, removendo do localStorage:", err?.message || err);
      }
    }

    dados = dados.filter((x) => String(x?.id) !== String(id));
    lsSetArray(key, dados);
    renderDocumentos();
  }

  /* ============================================================
     Evoluções (timeline + edição + cancelar + imprimir)
  ============================================================ */
  function renderEvolucoes() {
    const div = $("listaEvolucoes");
    if (!div) return;

    div.innerHTML = `<h2>Evoluções Registradas</h2>`;

    if (!pacienteAtual) {
      div.innerHTML += `<p>Selecione um paciente.</p>`;
      refreshResumoContadores();
      return;
    }

    const dados = lsGetArray(LS_KEYS.evolucoes(pacienteAtual));
    if (!dados.length) {
      div.innerHTML += `<p>Nenhuma evolução registrada.</p>`;
      refreshResumoContadores();
      return;
    }

    dados.forEach((evo) => {
      const item = document.createElement("div");
      item.className = "item";

      const titulo = `${escapeHtml(evo.dataHora || "-")} - ${escapeHtml(evo.tipo || "Evolução")}`;
      const usuario = escapeHtml(evo.usuario || "-");
      const descricaoCurta = escapeHtml(resumirDescricaoEvolucao(evo.descricao || ""));
      const descricaoCompleta = escapeHtml(evo.descricao || "");

      item.innerHTML = `
        <h3>${titulo}</h3>
        <p><strong>Profissional:</strong> ${usuario}</p>
        <div class="evo-compact">
          <div class="evo-desc" title="${descricaoCompleta}">
            <strong>Descricao:</strong> ${descricaoCurta}
          </div>
          <div class="evo-vitais">
            <p>
              <strong>PA:</strong> ${escapeHtml(evo.pa)} |
              <strong>FC:</strong> ${escapeHtml(evo.fc)} |
              <strong>FR:</strong> ${escapeHtml(evo.fr)} |
              <strong>SAT:</strong> ${escapeHtml(evo.sat)} |
              <strong>Temp:</strong> ${escapeHtml(evo.temp)} |
              <strong>HGT:</strong> ${escapeHtml(evo.hgt)}
            </p>
            <p>
              <strong>SVD:</strong> ${escapeHtml(evo.svd)} |
              <strong>Diurese:</strong> ${escapeHtml(evo.diurese)} |
              <strong>Evacuacao:</strong> ${escapeHtml(evo.evacuacao)}
            </p>
          </div>
        </div>

        <div class="evo-actions">
          <button class="btn btn-sm btn-imprimir" type="button" onclick="imprimirEvolucao('${escapeHtml(evo.id)}')">Imprimir</button>
          <button class="btn btn-primary btn-sm" type="button" onclick="editarEvolucao('${escapeHtml(evo.id)}')">Editar</button>
          <button class="btn btn-danger btn-sm" type="button" onclick="removerEvolucao('${escapeHtml(evo.id)}')">Remover</button>
        </div>
      `;

      div.appendChild(item);
    });

    refreshResumoContadores();
  }

  function setModoEdicaoVisual(ativo, infoText) {
    const banner = $("editBanner");
    const info = $("editBannerInfo");
    const box = $("evolucaoBox");
    const btn = $("adicionarBtn");

    if (banner) banner.style.display = ativo ? "flex" : "none";
    if (info) info.textContent = infoText || "Editando evolução";
    if (box) box.classList.toggle("editando", !!ativo);

    if (btn) btn.textContent = ativo ? "Salvar Alterações" : "Adicionar Evolução";
  }

  function cancelarEdicao() {
    modoEdicaoEvolucaoId = null;
    setModoEdicaoVisual(false);
    limparCamposEvolucao();
  }

  async function adicionarEvolucao() {
    if (!pacienteAtual) {
      alert("Selecione um paciente primeiro.");
      return;
    }

    const tipo = ($("tipoEvolucao")?.value || "").trim();
    const descricao = ($("evolucao")?.value || "").trim();

    const pa = ($("pa")?.value || "").trim();
    const fc = ($("fc")?.value || "").trim();
    const fr = ($("fr")?.value || "").trim();
    const sat = ($("saturacao")?.value || "").trim();
    const temp = ($("temp")?.value || "").trim();
    const hgt = ($("hgt")?.value || "").trim();

    const svd = ($("svd")?.value || "").trim();
    const diurese = ($("diurese")?.value || "").trim();
    const evacuacao = ($("evacuacao")?.value || "").trim();

    if (!tipo || !descricao) {
      alert("Selecione o tipo de evolução e preencha a evolução.");
      return;
    }

    const key = LS_KEYS.evolucoes(pacienteAtual);
    const dados = lsGetArray(key);
    const usuario = getUsuarioLogado();

    if (modoEdicaoEvolucaoId) {
      const patch = {
        tipo,
        descricao,
        pa,
        fc,
        fr,
        sat,
        temp,
        hgt,
        svd,
        diurese,
        evacuacao,
        usuario,
        updatedAt: new Date().toISOString(),
      };

      const apiFetchFn = window.apiFetch;
      if (typeof apiFetchFn === "function") {
        try {
          const salvo = await pepApiUpdate("evolucoes", modoEdicaoEvolucaoId, patch);
          const idx = dados.findIndex((x) => String(x?.id) === String(modoEdicaoEvolucaoId));
          if (idx >= 0) dados[idx] = Object.assign({}, dados[idx], salvo || patch);
          lsSetArray(key, dados);
        } catch (err) {
          const idx = dados.findIndex((x) => String(x?.id) === String(modoEdicaoEvolucaoId));
          if (idx >= 0) dados[idx] = Object.assign({}, dados[idx], patch);
          lsSetArray(key, dados);
          console.warn("Falha ao editar evolução na API, usando localStorage:", err?.message || err);
        }
      } else {
        const idx = dados.findIndex((x) => String(x?.id) === String(modoEdicaoEvolucaoId));
        if (idx >= 0) dados[idx] = Object.assign({}, dados[idx], patch);
        lsSetArray(key, dados);
      }

      cancelarEdicao();
      renderEvolucoes();
      return;
    }

    const novo = {
      id: uid(),
      pacienteId: pacienteAtual,
      dataHora: nowBR(),
      dataHoraISO: new Date().toISOString(),
      usuario,
      tipo,
      descricao,
      pa,
      fc,
      fr,
      sat,
      temp,
      hgt,
      svd,
      diurese,
      evacuacao,
    };

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        const salvo = await pepApiCreate("evolucoes", novo);
        dados.unshift(salvo || novo);
        lsSetArray(key, dados);
      } catch (err) {
        dados.unshift(novo);
        lsSetArray(key, dados);
        console.warn("Falha ao salvar evolução na API, usando localStorage:", err?.message || err);
      }
    } else {
      dados.unshift(novo);
      lsSetArray(key, dados);
    }

    limparCamposEvolucao();
    renderEvolucoes();
  }

  function editarEvolucao(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.evolucoes(pacienteAtual);
    const dados = lsGetArray(key);
    const item = dados.find((x) => String(x?.id) === String(id));
    if (!item) return;

    if ($("tipoEvolucao")) $("tipoEvolucao").value = item.tipo || "";
    if ($("evolucao")) $("evolucao").value = item.descricao || "";

    if ($("pa")) $("pa").value = item.pa || "";
    if ($("fc")) $("fc").value = item.fc || "";
    if ($("fr")) $("fr").value = item.fr || "";
    if ($("saturacao")) $("saturacao").value = item.sat || "";
    if ($("temp")) $("temp").value = item.temp || "";
    if ($("hgt")) $("hgt").value = item.hgt || "";

    if ($("svd")) $("svd").value = item.svd || "";
    if ($("diurese")) $("diurese").value = item.diurese || "";
    if ($("evacuacao")) $("evacuacao").value = item.evacuacao || "";

    modoEdicaoEvolucaoId = id;

    setModoEdicaoVisual(true, `Editando: ${item.dataHora || "-"} - ${item.tipo || "Evolução"}`);
  }

  async function removerEvolucao(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.evolucoes(pacienteAtual);
    let dados = lsGetArray(key);
    if (!confirm("Remover esta evolução?")) return;

    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn === "function") {
      try {
        await pepApiDelete("evolucoes", id);
      } catch (err) {
        console.warn("Falha ao remover evolução na API, removendo do localStorage:", err?.message || err);
      }
    }

    dados = dados.filter((x) => String(x?.id) !== String(id));
    lsSetArray(key, dados);

    if (String(modoEdicaoEvolucaoId) === String(id)) {
      cancelarEdicao();
    }

    renderEvolucoes();
  }

  function limparCamposEvolucao() {
    if ($("tipoEvolucao")) $("tipoEvolucao").value = "";
    if ($("evolucao")) $("evolucao").value = "";

    if ($("pa")) $("pa").value = "";
    if ($("fc")) $("fc").value = "";
    if ($("fr")) $("fr").value = "";
    if ($("saturacao")) $("saturacao").value = "";
    if ($("temp")) $("temp").value = "";
    if ($("hgt")) $("hgt").value = "";

    if ($("svd")) $("svd").value = "";
    if ($("diurese")) $("diurese").value = "";
    if ($("evacuacao")) $("evacuacao").value = "";
  }

  function imprimirEvolucao(id) {
    if (!pacienteAtual) return alert("Selecione um paciente primeiro.");

    const key = LS_KEYS.evolucoes(pacienteAtual);
    const dados = lsGetArray(key);
    const evo = dados.find((x) => String(x?.id) === String(id));
    if (!evo) return;

    const nomePaciente = pacienteAtualNome || getPacienteNomeById(pacienteAtual) || pacienteAtual;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Impressão de Evolução</title>
  <style>
    * { box-sizing: border-box; font-family: Arial, sans-serif; }
    body { margin: 24px; color: #111; }
    .top { display:flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .carimbo { width: 180px; max-width: 40vw; border: 1px solid #ddd; padding: 8px; border-radius: 10px; }
    h1 { margin: 0 0 8px 0; font-size: 20px; }
    .meta { font-size: 13px; color: #333; margin-bottom: 14px; }
    .box { border: 1px solid #ddd; border-radius: 12px; padding: 14px; margin-top: 12px; }
    .row { display:flex; gap: 12px; flex-wrap: wrap; }
    .col { flex: 1; min-width: 180px; }
    .label { font-weight: bold; }
    .muted { color:#444; }
    @media print { .no-print { display:none; } }
    button { padding: 10px 12px; border: none; border-radius: 10px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px;">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>

  <div class="top">
    <div>
      <h1>Evolução - Prontuário do Paciente</h1>
      <div class="meta">
        <div><span class="label">Paciente:</span> ${escapeHtml(nomePaciente)}</div>
        <div><span class="label">Tipo:</span> ${escapeHtml(evo.tipo || "Evolução")}</div>
        <div><span class="label">Data/Hora:</span> ${escapeHtml(evo.dataHora || "-")}</div>
        <div><span class="label">Profissional:</span> ${escapeHtml(evo.usuario || "-")}</div>
      </div>
    </div>

    <div>
      <img class="carimbo" src="${CARIMBO_URL}" alt="Carimbo" onerror="this.style.display='none'">
      <div class="muted" style="font-size:12px; margin-top:6px;">
        (Se não aparecer, confira o caminho do carimbo)
      </div>
    </div>
  </div>

  <div class="box">
    <div class="label">Evolução / Descrição:</div>
    <div style="margin-top:8px; white-space: pre-wrap;">${escapeHtml(evo.descricao || "")}</div>
  </div>

  <div class="box">
    <div class="label">Sinais e dados:</div>
    <div class="row" style="margin-top:10px;">
      <div class="col"><span class="label">PA:</span> ${escapeHtml(evo.pa)}</div>
      <div class="col"><span class="label">FC:</span> ${escapeHtml(evo.fc)}</div>
      <div class="col"><span class="label">FR:</span> ${escapeHtml(evo.fr)}</div>
      <div class="col"><span class="label">SAT:</span> ${escapeHtml(evo.sat)}</div>
      <div class="col"><span class="label">Temp:</span> ${escapeHtml(evo.temp)}</div>
      <div class="col"><span class="label">HGT:</span> ${escapeHtml(evo.hgt)}</div>
      <div class="col"><span class="label">SVD:</span> ${escapeHtml(evo.svd)}</div>
      <div class="col"><span class="label">Diurese:</span> ${escapeHtml(evo.diurese)}</div>
      <div class="col"><span class="label">Evacuação:</span> ${escapeHtml(evo.evacuacao)}</div>
    </div>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      alert("Seu navegador bloqueou o pop-up de impressão. Permita pop-ups para imprimir.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* ============================================================
     Persistir aba ativa (sem depender do prontuario-tabs.js)
  ============================================================ */
  function ativarAba(tabId) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const panel = document.getElementById(tabId);

    if (btn) btn.classList.add("active");
    if (panel) panel.classList.add("active");

    localStorage.setItem(LS_ABA_ATIVA, tabId);
  }

  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        if (tabId) ativarAba(tabId);
      });
    });

    const saved = localStorage.getItem(LS_ABA_ATIVA);
    if (saved && document.getElementById(saved)) {
      ativarAba(saved);
    }
  }

  /* ============================================================
     Troca de paciente
  ============================================================ */
  async function onPacienteChange() {
    const sel = $("pacienteSelect");
    pacienteAtual = sel ? sel.value : "";
    pacienteAtualNome = pacienteAtual ? getPacienteNomeById(pacienteAtual) || "" : "";

    cancelarEdicao();

    if (!pacienteAtual) {
      renderPatologias();
      renderVitais();
      renderMedicamentos();
      renderDocumentos();
      renderEvolucoes();
      limparCamposEvolucao();
      return;
    }

    await pepSyncAllToLS(pacienteAtual);
    await importarDiagnosticoDaTriagemParaPatologias(pacienteAtual);
    importarPrescricoesParaMedicamentos(pacienteAtual);

    renderPatologias();
    renderVitais();
    renderMedicamentos();
    renderDocumentos();
    renderEvolucoes();
  }

  /* ============================================================
     Expor funções pro HTML (onclick)
  ============================================================ */
  window.abrirCadastroPatologia = abrirCadastroPatologia;
  window.editarPatologia = editarPatologia;
  window.removerPatologia = removerPatologia;

  window.abrirCadastroVitais = abrirCadastroVitais;
  window.removerVitais = removerVitais;

  window.abrirCadastroMedicamento = abrirCadastroMedicamento;
  window.editarMedicamento = editarMedicamento;
  window.removerMedicamento = removerMedicamento;

  window.abrirAnexoDocumento = abrirAnexoDocumento;
  window.removerDocumento = removerDocumento;

  window.editarEvolucao = editarEvolucao;
  window.removerEvolucao = removerEvolucao;
  window.imprimirEvolucao = imprimirEvolucao;

  /* ============================================================
     Init
  ============================================================ */
  async function initPEP() {
    mostrarProfissionalLogado();

    await carregarPacientes();
    popularSelectPacientes();

    initTabs();

    const sel = $("pacienteSelect");
    if (sel) sel.addEventListener("change", onPacienteChange);

    const buscarPat = $("buscarPatologia");
    if (buscarPat) buscarPat.addEventListener("input", filtrarPatologias);

    const buscarMed = $("buscarMedicamento");
    if (buscarMed) buscarMed.addEventListener("input", filtrarMedicamentos);

    const btnAdd = $("adicionarBtn");
    if (btnAdd) btnAdd.addEventListener("click", adicionarEvolucao);

    const cancelarBtn = $("cancelarEdicaoBtn");
    if (cancelarBtn) cancelarBtn.addEventListener("click", cancelarEdicao);

    renderPatologias();
    renderVitais();
    renderMedicamentos();
    renderDocumentos();
    renderEvolucoes();
    refreshResumoContadores();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPEP);
  } else {
    initPEP();
  }
})();