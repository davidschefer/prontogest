/* =====================================================
   TRIAGEM -" Mini SGH (API-FIRST + fallback)
   - Pacientes: API GET /api/pacientes (fallback: pacientes_lista_v1)
   - Triagens:  API GET/POST/PUT/DELETE /api/triagens (fallback: triagens_lista_v1)
   - PEP (temporário): localStorage guarda a sLTIMA triagem por paciente (triagem_<pacienteId>)
   - Mantém HTML/onclick: window.adicionarTriagem / window.cancelarEdicao
   - o. Profissional (identidade): usa campos profissionalNome/orgao/registro/carimbo se vierem da API
   ===================================================== */

(function () {
  /* ===== Estado ===== */
  let pacientes = [];
  let triagens = [];
  let editingId = null;
  let editingPacienteIdOriginal = null;

  /* ===== Fallback keys ===== */
  const LS_PACIENTES = "pacientes_lista_v1";
  const LS_TRIAGENS = "triagens_lista_v1";

  /* ===== Elementos ===== */
  const pacienteSelect = document.getElementById("pacienteSelect");
  const btnRegistrar = document.getElementById("registrarBtn");
  const btnCancelar = document.getElementById("cancelarEdicaoBtn");
  const msgBox = document.getElementById("triagemMsg");

  const evolucaoEl = document.getElementById("evolucao");
  const contadorEl = document.getElementById("contadorEvolucao");
  const hgtEl = document.getElementById("hgt");

  // inputs obrigatórios por id (do seu HTML)
  const diagnosticoEl = document.getElementById("diagnostico");
  const paEl = document.getElementById("pa");
  const fcEl = document.getElementById("fc");
  const frEl = document.getElementById("fr");
  const tempEl = document.getElementById("temp");
  const saturacaoEl = document.getElementById("saturacao");
  const riscoEl = document.getElementById("risco");

  // o. identidade profissional (topo)
  const profissionalBox = document.getElementById("profissionalBox");

  // o. modal
  const triagemModal = document.getElementById("triagemModal");
  const triagemModalBody = document.getElementById("triagemModalBody");
  const triagemModalClose = document.getElementById("triagemModalClose");
  const triagemModalPrint = document.getElementById("triagemModalPrint");

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

  function isErroConexao(msg) {
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network|conex/i.test(
      String(msg || "")
    );
  }

  function gerarIdLocal(prefix = "t") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

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

  function getUsuarioLogado() {
    const email = localStorage.getItem("auth_email");
    const logged = localStorage.getItem("auth_logged_in");
    if (logged === "true" && email) return email;
    return "não identificado";
  }

  function nowBR() {
    return new Date().toLocaleString("pt-BR");
  }

  function normalizarNumeroFlex(v) {
    return String(v || "").trim().replace(",", ".");
  }

  function showMsg(texto, tipo = "ok") {
    if (!msgBox) return;

    msgBox.textContent = texto;
    msgBox.style.display = "block";
    msgBox.style.padding = "10px";
    msgBox.style.marginTop = "10px";
    msgBox.style.borderRadius = "8px";
    msgBox.style.fontWeight = "600";

    if (tipo === "ok") {
      msgBox.style.background = "#e8fff1";
      msgBox.style.color = "#0b6b2d";
      msgBox.style.border = "1px solid #b7f0cb";
    } else if (tipo === "warn") {
      msgBox.style.background = "#fff7e6";
      msgBox.style.color = "#7a4b00";
      msgBox.style.border = "1px solid #ffe1a6";
    } else {
      msgBox.style.background = "#ffecec";
      msgBox.style.color = "#8a0b0b";
      msgBox.style.border = "1px solid #ffbdbd";
    }

    clearTimeout(showMsg._t);
    showMsg._t = setTimeout(() => {
      if (msgBox) msgBox.style.display = "none";
    }, 3500);
  }

  function getPacientePorId(id) {
    const pid = String(id || "").trim();
    return pacientes.find((p) => String(p?.id) === pid) || null;
  }

  function getPacienteNome(pacienteId) {
    const p = getPacientePorId(pacienteId);
    return p?.nome || "Paciente";
  }

  function formatarProfissional(t) {
    const nome = String(t?.profissionalNome || "").trim();
    const orgao = String(t?.profissionalOrgao || "").trim();
    const registro = String(t?.profissionalRegistro || "").trim();
    const usuario = String(t?.usuario || "").trim();

    if (nome) {
      const conselhoTxt =
        orgao || registro ? ` -" ${orgao}${orgao ? ":" : ""} ${registro}`.trim() : "";
      return `${nome}${conselhoTxt}`.trim();
    }

    return usuario || "-";
  }

  function resumoTexto(txt, max = 110) {
    const s = String(txt || "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    if (s.length <= max) return s;
    return s.slice(0, max).trimEnd() + "-";
  }
  function resumirDescricaoTriagem(texto) {
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
     PEP (localStorage): última triagem do paciente
  --------------------------- */
  function salvarTriagemParaPEP(triagemUI) {
    const pid = String(triagemUI?.pacienteId || "").trim();
    if (!pid) return;
    localStorage.setItem(`triagem_${pid}`, JSON.stringify(triagemUI));
  }

  function removerTriagemDoPEP(pacienteId) {
    const pid = String(pacienteId || "").trim();
    if (!pid) return;
    localStorage.removeItem(`triagem_${pid}`);
  }

  function ordenarTriagensDesc(a, b) {
    const da = new Date(a?.dataHoraISO || a?.createdAt || 0).getTime();
    const db = new Date(b?.dataHoraISO || b?.createdAt || 0).getTime();
    return db - da;
  }

  function normalizarTriagemParaUI(t) {
    const pid = String(t?.pacienteId || "").trim();
    return {
      id: t?.id,
      pacienteId: pid,
      pacienteNome: getPacienteNome(pid),

      diagnostico: t?.diagnostico || "",
      evolucao: t?.evolucao || "",

      pa: t?.pa || "",
      fc: t?.fc || "",
      fr: t?.fr || "",
      temp: t?.temp || "",

      hgt: t?.hgt || "",

      saturacao: t?.saturacao || "",
      risco: t?.risco || "",

      usuario: t?.usuario || "",
      dataHoraBR: t?.dataHoraBR || "",
      dataHoraISO: t?.dataHoraISO || t?.createdAt || "",

      // o. identidade profissional (se vier da API)
      profissionalEmail: t?.profissionalEmail || "",
      profissionalNome: t?.profissionalNome || "",
      profissionalOrgao: t?.profissionalOrgao || "",
      profissionalRegistro: t?.profissionalRegistro || "",
      profissionalCarimbo: t?.profissionalCarimbo || "",

      createdAt: t?.createdAt,
      updatedAt: t?.updatedAt,
    };
  }

  function atualizarPEPDoPaciente(pacienteId) {
    const pid = String(pacienteId || "").trim();
    if (!pid) return;

    const lista = triagens
      .filter((t) => String(t?.pacienteId) === pid)
      .sort(ordenarTriagensDesc);

    const ultima = lista[0];
    if (ultima) {
      salvarTriagemParaPEP(normalizarTriagemParaUI(ultima));
    } else {
      removerTriagemDoPEP(pid);
    }
  }

  function atualizarPEPAll() {
    const pids = new Set(
      triagens.map((t) => String(t?.pacienteId || "").trim()).filter(Boolean)
    );
    pids.forEach((pid) => atualizarPEPDoPaciente(pid));
  }

  /* ---------------------------
     Validações amigáveis
  --------------------------- */
  function validarCampos({
    pacienteId,
    diagnostico,
    pa,
    fc,
    fr,
    temp,
    saturacao,
    risco,
    hgt,
  }) {
    if (!pacienteId) return "Selecione um paciente.";
    if (!diagnostico) return "Preencha o diagnóstico.";
    if (!pa) return "Preencha a PA.";
    if (!fc) return "Preencha a FC.";
    if (!fr) return "Preencha a FR.";
    if (!temp) return "Preencha a temperatura.";
    if (!saturacao) return "Preencha a saturação.";
    if (!risco) return "Selecione o risco.";

    const satNum = Number(normalizarNumeroFlex(saturacao));
    if (!Number.isFinite(satNum) || satNum < 0 || satNum > 100) {
      return "Saturação deve ser um número entre 0 e 100.";
    }

    const tempNum = Number(normalizarNumeroFlex(temp));
    if (!Number.isFinite(tempNum)) return "Temperatura inválida (ex: 36,8).";

    if (!/^\d+(\.\d+)?$/.test(normalizarNumeroFlex(fc)))
      return "FC deve ser numérica.";
    if (!/^\d+(\.\d+)?$/.test(normalizarNumeroFlex(fr)))
      return "FR deve ser numérica.";

    if (
      String(pa || "").includes("/") &&
      !/^\d{2,3}\/\d{2,3}$/.test(String(pa).trim())
    ) {
      return "PA inválida. Use formato 120/80.";
    }

    const hgtTxt = String(hgt || "").trim();
    if (hgtTxt && !/^\d+(\.\d+)?$/.test(normalizarNumeroFlex(hgtTxt))) {
      return "HGT deve ser numérico (ex: 98 ou 98,5).";
    }

    const ev = String(evolucaoEl?.value || "");
    if (ev.length > 3000) return "Evolução excedeu 3000 caracteres.";

    return null;
  }

  /* ---------------------------
     UI: contador de evolução
  --------------------------- */
  function atualizarContadorEvolucao() {
    if (!evolucaoEl || !contadorEl) return;
    contadorEl.textContent = `${evolucaoEl.value.length}/3000`;
  }

  /* ---------------------------
     o. UI: identidade do profissional (topo)
  --------------------------- */
  function montarIdentidadeTopo() {
    const email = localStorage.getItem("auth_email") || "";
    const role = localStorage.getItem("auth_role") || "";
    if (!profissionalBox) return;

    if (!email) {
      profissionalBox.style.display = "none";
      return;
    }

    profissionalBox.innerHTML = `Profissional logado: <span>${escapeHtml(
      email
    )}</span>${role ? ` <span style="opacity:.7;">(${escapeHtml(role)})</span>` : ""}`;
    profissionalBox.style.display = "block";
  }

  /* ---------------------------
     Pacientes (API-FIRST + fallback)
  --------------------------- */
  async function carregarPacientes() {
    const apiFetchFn = window.apiFetch;

    if (typeof apiFetchFn !== "function") {
      pacientes = lsGetArray(LS_PACIENTES);
      popularPacientes();
      return;
    }

    try {
      const resp = await apiFetchFn("/api/pacientes", { method: "GET" });
      pacientes = Array.isArray(resp?.pacientes) ? resp.pacientes : [];
      lsSetArray(LS_PACIENTES, pacientes);
    } catch (err) {
      console.warn(
        "Falha ao carregar pacientes da API. Usando fallback:",
        err?.message || err
      );
      pacientes = lsGetArray(LS_PACIENTES);
    }

    popularPacientes();
  }

  function popularPacientes() {
    if (!pacienteSelect) return;

    pacienteSelect.innerHTML = `<option value="">Selecione um paciente...</option>`;

    if (!pacientes.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(Nenhum paciente cadastrado ainda)";
      pacienteSelect.appendChild(opt);
      return;
    }

    pacientes.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const cpfTxt = p.cpf ? ` - CPF: ${p.cpf}` : "";
      opt.textContent = `${p.nome || "Sem nome"}${cpfTxt}`;
      pacienteSelect.appendChild(opt);
    });
  }

  /* ---------------------------
     Triagens (API-FIRST + fallback)
  --------------------------- */
  async function carregarTriagens() {
    const apiFetchFn = window.apiFetch;

    if (typeof apiFetchFn !== "function") {
      triagens = lsGetArray(LS_TRIAGENS);
      atualizarPEPAll();
      atualizarLista();
      return;
    }

    try {
      const resp = await apiFetchFn("/api/triagens", { method: "GET" });
      triagens = Array.isArray(resp?.triagens) ? resp.triagens : [];
      lsSetArray(LS_TRIAGENS, triagens);
    } catch (err) {
      console.warn(
        "Falha ao carregar triagens da API. Usando fallback:",
        err?.message || err
      );
      triagens = lsGetArray(LS_TRIAGENS);
    }

    atualizarPEPAll();
    atualizarLista();
  }

  /* ---------------------------
     Modo edição (UX)
  --------------------------- */
  function setModoEdicao(ativo) {
    if (btnRegistrar)
      btnRegistrar.textContent = ativo ? "Salvar Alterações" : "Registrar Triagem";
    if (btnCancelar) btnCancelar.style.display = ativo ? "inline-block" : "none";
  }

  function limparCampos() {
    if (pacienteSelect) pacienteSelect.value = "";
    if (diagnosticoEl) diagnosticoEl.value = "";

    if (evolucaoEl) evolucaoEl.value = "";
    atualizarContadorEvolucao();

    if (hgtEl) hgtEl.value = "";

    if (paEl) paEl.value = "";
    if (fcEl) fcEl.value = "";
    if (frEl) frEl.value = "";
    if (tempEl) tempEl.value = "";
    if (saturacaoEl) saturacaoEl.value = "";
    if (riscoEl) riscoEl.value = "";
  }

  function cancelarEdicao() {
    editingId = null;
    editingPacienteIdOriginal = null;
    setModoEdicao(false);
    limparCampos();
    showMsg("Edição cancelada.", "ok");
  }

  /* ---------------------------
     Fallback CRUD (local)
  --------------------------- */
  function localCreateTriagem(payload) {
    const arr = lsGetArray(LS_TRIAGENS);
    const iso = payload.dataHoraISO || new Date().toISOString();

    const novo = {
      ...payload,
      id: gerarIdLocal("triagem"),
      createdAt: iso,
      updatedAt: iso,
    };

    arr.push(novo);
    lsSetArray(LS_TRIAGENS, arr);
    return novo;
  }

  function localUpdateTriagem(id, payload) {
    const arr = lsGetArray(LS_TRIAGENS);
    const idx = arr.findIndex((t) => String(t?.id) === String(id));
    if (idx < 0) throw new Error("Triagem não encontrada (fallback).");

    arr[idx] = {
      ...arr[idx],
      ...payload,
      id: arr[idx].id,
      updatedAt: new Date().toISOString(),
    };

    lsSetArray(LS_TRIAGENS, arr);
    return arr[idx];
  }

  function localDeleteTriagem(id) {
    const arr = lsGetArray(LS_TRIAGENS);
    const novo = arr.filter((t) => String(t?.id) !== String(id));
    lsSetArray(LS_TRIAGENS, novo);
    return true;
  }

  /* ---------------------------
     Criar / Atualizar (API-FIRST + fallback)
  --------------------------- */
  async function adicionarTriagem() {
    const pacienteId = String(pacienteSelect?.value || "").trim();

    const diagnostico = String(diagnosticoEl?.value || "").trim();
    const evolucao = String(evolucaoEl?.value || "").trim();

    const pa = String(paEl?.value || "").trim();
    const fc = String(fcEl?.value || "").trim();
    const fr = String(frEl?.value || "").trim();
    const temp = String(tempEl?.value || "").trim();

    const hgt = String(hgtEl?.value || "").trim();

    const saturacao = String(saturacaoEl?.value || "").trim();
    const risco = String(riscoEl?.value || "").trim();

    const erro = validarCampos({
      pacienteId,
      diagnostico,
      pa,
      fc,
      fr,
      temp,
      saturacao,
      risco,
      hgt,
    });
    if (erro) {
      showMsg(erro, "warn");
      return;
    }

    const payload = {
      pacienteId,
      diagnostico,
      evolucao,

      hgt,

      pa,
      fc,
      fr,
      temp: normalizarNumeroFlex(temp),
      saturacao,
      risco,

      // mantém compatibilidade; backend pode substituir por identidade real
      usuario: getUsuarioLogado(),
      dataHoraBR: nowBR(),
      dataHoraISO: new Date().toISOString(),
    };

    const apiFetchFn = window.apiFetch;

    try {
      if (typeof apiFetchFn === "function") {
        if (editingId) {
          const pacienteAntigo = editingPacienteIdOriginal;
          const pacienteNovo = pacienteId;

          await apiFetchFn(`/api/triagens/${encodeURIComponent(editingId)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });

          showMsg("o. Triagem atualizada com sucesso!", "ok");

          editingId = null;
          editingPacienteIdOriginal = null;
          setModoEdicao(false);
          limparCampos();

          await carregarTriagens();
          if (pacienteAntigo) atualizarPEPDoPaciente(pacienteAntigo);
          if (pacienteNovo) atualizarPEPDoPaciente(pacienteNovo);
          return;
        }

        await apiFetchFn("/api/triagens", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        showMsg("o. Triagem registrada com sucesso!", "ok");
        limparCampos();

        await carregarTriagens();
        atualizarPEPDoPaciente(pacienteId);
        return;
      }

      // fallback (sem apiFetch)
      if (editingId) {
        const pacienteAntigo = editingPacienteIdOriginal;
        const pacienteNovo = pacienteId;

        localUpdateTriagem(editingId, payload);

        showMsg("o. Triagem atualizada! (fallback)", "ok");

        editingId = null;
        editingPacienteIdOriginal = null;
        setModoEdicao(false);
        limparCampos();

        await carregarTriagens();
        if (pacienteAntigo) atualizarPEPDoPaciente(pacienteAntigo);
        if (pacienteNovo) atualizarPEPDoPaciente(pacienteNovo);
        return;
      }

      localCreateTriagem(payload);
      showMsg("o. Triagem registrada! (fallback)", "ok");
      limparCampos();
      await carregarTriagens();
      atualizarPEPDoPaciente(pacienteId);
    } catch (err) {
      const msg = err?.message || String(err);

      if (typeof apiFetchFn === "function" && isErroConexao(msg)) {
        try {
          if (editingId) {
            const pacienteAntigo = editingPacienteIdOriginal;
            const pacienteNovo = pacienteId;

            localUpdateTriagem(editingId, payload);
            showMsg("Backend indisponível. Alteração salva no fallback local.", "warn");

            editingId = null;
            editingPacienteIdOriginal = null;
            setModoEdicao(false);
            limparCampos();

            await carregarTriagens();
            if (pacienteAntigo) atualizarPEPDoPaciente(pacienteAntigo);
            if (pacienteNovo) atualizarPEPDoPaciente(pacienteNovo);
            return;
          }

          localCreateTriagem(payload);
          showMsg("Backend indisponível. Triagem salva no fallback local.", "warn");
          limparCampos();
          await carregarTriagens();
          atualizarPEPDoPaciente(pacienteId);
          return;
        } catch (e2) {
          showMsg(e2?.message || msg, "err");
          return;
        }
      }

      if (String(msg).includes("Token ausente") || String(msg).includes("401")) {
        showMsg("s Sessão expirada. Faça login novamente.", "err");
      } else {
        showMsg("O Não foi possível salvar a triagem.", "err");
      }
      console.warn("Falha ao salvar triagem:", err);
    }
  }

  /* ---------------------------
     o. Modal: Ver completo + impressão
     (ALINHADO: carimbo acima da linha e bem próximo)
  --------------------------- */
  function fecharModal() {
    if (!triagemModal) return;
    triagemModal.style.display = "none";
    if (triagemModalBody) triagemModalBody.innerHTML = "";
  }

  function imprimirConteudo(html) {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      showMsg("Pop-up bloqueado. Permita pop-ups para imprimir.", "warn");
      return;
    }

    w.document.open();
    w.document.write(`
      <html><head><title>Impressão -" Triagem</title>
      <meta charset="utf-8"/>
      <style>
        body{ font-family: Arial, sans-serif; padding: 18px; }
        h2{ margin-top: 0; }

        .assinatura-container{
          display:flex;
          justify-content: space-between;
          align-items:flex-end;
          gap: 24px;
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px solid #ddd;
        }
        .dados-profissional{ flex: 1; min-width: 240px; }
        .assinatura-right{
          width: 420px;
          display:flex;
          flex-direction: column;
          align-items: flex-end;
        }
        img.carimbo-img{
          max-width: 280px;
          max-height: 90px;
          height:auto;
          object-fit: contain;
          display:block;
          margin: 0 0 6px 0; /* <<< colado na linha */
        }
        .assinatura-linha{
          display:flex;
          align-items:flex-end;
          gap: 10px;
          width: 100%;
          justify-content: flex-end;
          margin-top: 0;
        }
        .assinatura-linha .label{
          white-space: nowrap;
        }
        .assinatura-linha .linha{
          flex:1;
          border-bottom: 1px solid #000;
          height: 14px;
        }
      </style>
      </head><body>${html}</body></html>
    `);

    w.document.close();
    w.focus();
    w.print();
  }

  function abrirModalTriagem(t) {
    if (!triagemModal || !triagemModalBody) return;

    const profTxt = formatarProfissional(t);

    const nomeProf = String(t?.profissionalNome || "").trim();
    const orgao = String(t?.profissionalOrgao || "").trim();
    const registro = String(t?.profissionalRegistro || "").trim();
    const carimbo = String(t?.profissionalCarimbo || "").trim();

    const temCarimbo = carimbo.startsWith("data:image");
    const nomeParaExibir = nomeProf || profTxt || "";

    const conselhoLinha =
      orgao || registro ? `${orgao}${orgao ? ":" : ""} ${registro}`.trim() : "";

    const html = `
      <p><strong>Paciente:</strong> ${escapeHtml(t.pacienteNome || "-")}</p>
      <p><strong>Diagnóstico:</strong> ${escapeHtml(t.diagnostico || "-")}</p>
      <p><strong>Evolução / Observações:</strong><br/>${escapeHtml(
        t.evolucao || "-"
      ).replaceAll("\n", "<br/>")}</p>
      <p><strong>Profissional:</strong> ${escapeHtml(profTxt || "-")}</p>
      <p><strong>Data/Hora:</strong> ${escapeHtml(t.dataHoraBR || "-")}</p>
      <p>
        <strong>PA:</strong> ${escapeHtml(t.pa || "-")},
        <strong>FC:</strong> ${escapeHtml(t.fc || "-")},
        <strong>FR:</strong> ${escapeHtml(t.fr || "-")},
        <strong>Temp:</strong> ${escapeHtml(t.temp || "-")}°C,
        <strong>HGT:</strong> ${escapeHtml(t.hgt || "-")} mg/dl,
        <strong>Saturação:</strong> ${escapeHtml(t.saturacao || "-")}%
      </p>
      <p><strong>Risco:</strong> ${escapeHtml(t.risco || "-")}</p>

      <div class="assinatura-container">
        <div class="dados-profissional">
          ${nomeParaExibir ? `<div><strong>${escapeHtml(nomeParaExibir)}</strong></div>` : ""}
          ${conselhoLinha ? `<div>${escapeHtml(conselhoLinha)}</div>` : ""}
        </div>

        <div class="assinatura-right">
          ${temCarimbo ? `<img class="carimbo-img" src="${escapeHtml(carimbo)}" alt="Carimbo e assinatura">` : ""}
          <div class="assinatura-linha">
            <span class="label">Assinatura do profissional:</span>
            <span class="linha"></span>
          </div>
        </div>
      </div>
    `;

    triagemModalBody.innerHTML = html;
    triagemModal.style.display = "flex";

    if (triagemModalPrint) {
      triagemModalPrint.onclick = () => imprimirConteudo(html);
    }
  }

  function imprimirTriagem(id) {
    const raw = triagens.find((x) => String(x?.id) === String(id));
    if (!raw) return;
    const t = normalizarTriagemParaUI(raw);

    const profTxt = formatarProfissional(t);
    const nomeProf = String(t?.profissionalNome || "").trim();
    const orgao = String(t?.profissionalOrgao || "").trim();
    const registro = String(t?.profissionalRegistro || "").trim();
    const carimbo = String(t?.profissionalCarimbo || "").trim();
    const temCarimbo = carimbo.startsWith("data:image");
    const nomeParaExibir = nomeProf || profTxt || "";
    const conselhoLinha =
      orgao || registro ? `${orgao}${orgao ? ":" : ""} ${registro}`.trim() : "";

    const html = `
      <p><strong>Paciente:</strong> ${escapeHtml(t.pacienteNome || "-")}</p>
      <p><strong>Diagnóstico:</strong> ${escapeHtml(t.diagnostico || "-")}</p>
      <p><strong>Evolução / Observações:</strong><br/>${escapeHtml(
        t.evolucao || "-"
      ).replaceAll("\n", "<br/>")}</p>
      <p><strong>Profissional:</strong> ${escapeHtml(profTxt || "-")}</p>
      <p><strong>Data/Hora:</strong> ${escapeHtml(t.dataHoraBR || "-")}</p>
      <p>
        <strong>PA:</strong> ${escapeHtml(t.pa || "-")},
        <strong>FC:</strong> ${escapeHtml(t.fc || "-")},
        <strong>FR:</strong> ${escapeHtml(t.fr || "-")},
        <strong>Temp:</strong> ${escapeHtml(t.temp || "-")}°C,
        <strong>HGT:</strong> ${escapeHtml(t.hgt || "-")} mg/dl,
        <strong>Saturação:</strong> ${escapeHtml(t.saturacao || "-")}%
      </p>
      <p><strong>Risco:</strong> ${escapeHtml(t.risco || "-")}</p>

      <div class="assinatura-container">
        <div class="dados-profissional">
          ${nomeParaExibir ? `<div><strong>${escapeHtml(nomeParaExibir)}</strong></div>` : ""}
          ${conselhoLinha ? `<div>${escapeHtml(conselhoLinha)}</div>` : ""}
        </div>

        <div class="assinatura-right">
          ${temCarimbo ? `<img class="carimbo-img" src="${escapeHtml(carimbo)}" alt="Carimbo e assinatura">` : ""}
          <div class="assinatura-linha">
            <span class="label">Assinatura do profissional:</span>
            <span class="linha"></span>
          </div>
        </div>
      </div>
    `;

    imprimirConteudo(html);
  }

  /* ---------------------------
     Lista / Ações
  --------------------------- */
  function atualizarLista() {
    const div = document.getElementById("listaTriagens");
    if (!div) return;

    div.innerHTML = "<h2>Triagens Registradas</h2>";

    if (!triagens.length) {
      div.innerHTML += `<p>Nenhuma triagem registrada.</p>`;
      return;
    }

    const uiList = triagens.map(normalizarTriagemParaUI).sort(ordenarTriagensDesc);

    uiList.forEach((t) => {
      const item = document.createElement("div");
      item.className = "item";

      const profTxt = formatarProfissional(t);
      const risco = String(t.risco || "-");
      const evolucaoCurta = escapeHtml(resumirDescricaoTriagem(t.evolucao || ""));
      const evolucaoCompleta = escapeHtml(t.evolucao || "");

      item.innerHTML = `
        <h3>${escapeHtml(t.dataHoraBR || "-")} - Triagem</h3>
        <p><strong>Paciente:</strong> ${escapeHtml(t.pacienteNome || "-")}</p>
        <p><strong>Diagnostico:</strong> ${escapeHtml(t.diagnostico || "-")}</p>
        <p><strong>Profissional:</strong> ${escapeHtml(profTxt || "-")}</p>
        <div class="triagem-compact">
          <div class="triagem-desc" title="${evolucaoCompleta}">
            <strong>Evolucao:</strong> ${evolucaoCurta}
          </div>
          <div class="triagem-vitais">
            <p>
              <strong>PA:</strong> ${escapeHtml(t.pa || "-")} |
              <strong>FC:</strong> ${escapeHtml(t.fc || "-")} |
              <strong>FR:</strong> ${escapeHtml(t.fr || "-")} |
              <strong>SAT:</strong> ${escapeHtml(t.saturacao || "-")} |
              <strong>Temp:</strong> ${escapeHtml(t.temp || "-")} |
              <strong>HGT:</strong> ${escapeHtml(t.hgt || "-")}
            </p>
            <p><strong>Risco:</strong> <span class="pill-risco risco-${escapeHtml(risco.toLowerCase())}">${escapeHtml(risco)}</span></p>
          </div>
        </div>
        <div class="triagem-actions">
          <button type="button" class="btn btn-sm btn-imprimir">Imprimir</button>
          <button type="button" class="btn btn-primary btn-sm">Editar</button>
          <button type="button" class="btn btn-danger btn-sm">Remover</button>
        </div>
      `;

      item.querySelector(".btn-imprimir").addEventListener("click", () => imprimirTriagem(t.id));
      item.querySelector(".btn-primary").addEventListener("click", () => editarTriagem(t.id));
      item.querySelector(".btn-danger").addEventListener("click", () => removerTriagem(t.id, t.pacienteId));

      div.appendChild(item);
    });
  }
  function editarTriagem(id) {
    const raw = triagens.find((x) => String(x?.id) === String(id));
    if (!raw) return;

    const t = normalizarTriagemParaUI(raw);

    editingId = t.id;
    editingPacienteIdOriginal = t.pacienteId || null;
    setModoEdicao(true);

    if (pacienteSelect) pacienteSelect.value = t.pacienteId || "";
    if (diagnosticoEl) diagnosticoEl.value = t.diagnostico || "";
    if (evolucaoEl) evolucaoEl.value = t.evolucao || "";
    if (hgtEl) hgtEl.value = t.hgt || "";

    if (paEl) paEl.value = t.pa || "";
    if (fcEl) fcEl.value = t.fc || "";
    if (frEl) frEl.value = t.fr || "";
    if (tempEl) tempEl.value = t.temp || "";
    if (saturacaoEl) saturacaoEl.value = t.saturacao || "";
    if (riscoEl) riscoEl.value = t.risco || "";

    atualizarContadorEvolucao();
    showMsg("o Editando triagem. Ajuste e clique em Salvar Alterações.", "warn");
  }

  async function removerTriagem(id, pacienteId) {
    if (!confirm("Remover esta triagem?")) return;

    const apiFetchFn = window.apiFetch;

    try {
      if (typeof apiFetchFn === "function") {
        await apiFetchFn(`/api/triagens/${encodeURIComponent(id)}`, { method: "DELETE" });

        showMsg("Y-' Triagem removida.", "ok");

        await carregarTriagens();
        atualizarPEPDoPaciente(pacienteId);

        if (String(editingId) === String(id)) cancelarEdicao();
        return;
      }

      // fallback
      localDeleteTriagem(id);
      showMsg("Y-' Triagem removida. (fallback)", "ok");

      await carregarTriagens();
      atualizarPEPDoPaciente(pacienteId);

      if (String(editingId) === String(id)) cancelarEdicao();
    } catch (err) {
      const msg = err?.message || String(err);

      if (typeof apiFetchFn === "function" && isErroConexao(msg)) {
        try {
          localDeleteTriagem(id);
          showMsg("Backend indisponível. Remoção aplicada no fallback local.", "warn");

          await carregarTriagens();
          atualizarPEPDoPaciente(pacienteId);

          if (String(editingId) === String(id)) cancelarEdicao();
          return;
        } catch (e2) {
          showMsg(e2?.message || msg, "err");
          return;
        }
      }

      showMsg("O Não foi possível remover a triagem.", "err");
      console.warn("Falha ao remover triagem:", err);
    }
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    montarIdentidadeTopo();

    // contador evolução
    if (evolucaoEl) {
      evolucaoEl.addEventListener("input", atualizarContadorEvolucao);
      atualizarContadorEvolucao();
    }

    // modal
    if (triagemModalClose) triagemModalClose.addEventListener("click", fecharModal);
    if (triagemModal) {
      triagemModal.addEventListener("click", (e) => {
        if (e.target === triagemModal) fecharModal();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fecharModal();
    });

    await carregarPacientes();
    await carregarTriagens();

    setModoEdicao(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // mantém compatibilidade com HTML/onclick
  window.adicionarTriagem = adicionarTriagem;
  window.cancelarEdicao = cancelarEdicao;
})();
