/* =====================================================
   FATURAMENTO - Mini SGH (API-FIRST + fallback)
   - Faturas API:
       GET    /api/faturas            (opcional ?pacienteId=)
       POST   /api/faturas
       PUT    /api/faturas/:id
       DELETE /api/faturas/:id
   - Pacientes API:
       GET /api/pacientes
   - Fallback localStorage:
       faturas_v1
       pacientes_lista_v1
   - Selects:
       #pacienteFiltro = filtro/relatório
       #paciente       = cadastro (pode ser SELECT ou INPUT, compatível com ambos)
   - Mantém seu HTML:
       onclick="adicionarFatura()" continua
       onclick="limparFiltroPaciente()" continua
   ===================================================== */

(function () {
  const LS_FATURAS = "faturas_v1";
  const LS_PACIENTES = "pacientes_lista_v1";

  let pacientes = [];
  let faturas = [];
  let editingId = null;

  const registrarBtn = document.querySelector("button[onclick='adicionarFatura()']");

  /* ---------------------------
     Helpers
  --------------------------- */
  function getUsuarioLogado() {
    const email = localStorage.getItem("auth_email");
    const logged = localStorage.getItem("auth_logged_in");
    if (logged === "true" && email) return email;
    return "não identificado";
  }

  function nowBR() {
    return new Date().toLocaleString("pt-BR");
  }

  function nowISO() {
    return new Date().toISOString();
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
    } catch {}
  }

  function getFiltroPacienteId() {
    const sel = document.getElementById("pacienteFiltro");
    return sel ? String(sel.value || "").trim() : "";
  }

  function setResumo(texto) {
    const el = document.getElementById("resumoFinanceiro");
    if (el) el.textContent = String(texto || "");
  }

  function getPacienteNomeById(id) {
    const pid = String(id || "");
    const p = pacientes.find((x) => String(x?.id) === pid);
    return p?.nome || "Paciente";
  }

  function getPacienteNomeDoFiltro(pid) {
    if (!pid) return "Todos";
    return getPacienteNomeById(pid) || "Paciente";
  }

  function parseValorBR(v) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === "number") return v;

    let s = String(v).trim().replace("R$", "").replace(/\s/g, "");
    if (!s) return NaN;

    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatarMoedaBR(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return 'R$ 0,00';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function ordenarRecentesDesc(a, b) {
    const da = new Date(a?.dataHoraISO || a?.createdAt || 0).getTime();
    const db = new Date(b?.dataHoraISO || b?.createdAt || 0).getTime();
    return db - da;
  }

  function extrairArrayFlex(resp, chaves = []) {
    if (Array.isArray(resp)) return resp;
    if (!resp || typeof resp !== "object") return [];

    for (const k of chaves) {
      if (Array.isArray(resp[k])) return resp[k];
    }

    if (Array.isArray(resp.items)) return resp.items;
    if (Array.isArray(resp.data)) return resp.data;
    if (Array.isArray(resp.lista)) return resp.lista;
    if (Array.isArray(resp.pacientes)) return resp.pacientes;
    if (Array.isArray(resp.faturas)) return resp.faturas;

    return [];
  }

  function limparTextoPacienteLabel(txt) {
    const s = String(txt || "").trim();
    if (!s) return "";
    const idx = s.indexOf("-");
    return idx >= 0 ? s.slice(0, idx).trim() : s;
  }

  function setModoEdicao(ativo) {
    if (registrarBtn) {
      registrarBtn.textContent = ativo ? "Salvar Alterações" : "Registrar Fatura";
    }
  }

  /* ---------------------------
     Storage (fallback)
  --------------------------- */
  function carregarFaturasLS() {
    return lsGetArray(LS_FATURAS);
  }

  function salvarFaturasLS(lista) {
    lsSetArray(LS_FATURAS, lista);
  }

  function filtrarFaturasLS(pacienteId) {
    const all = carregarFaturasLS();
    if (!pacienteId) return all;

    const pid = String(pacienteId);
    return all.filter((f) => String(f?.pacienteId) === pid);
  }

  function mergeCacheFaturas(cacheAtual, novas, pacienteId) {
    const arrAtual = Array.isArray(cacheAtual) ? cacheAtual : [];
    const arrNovas = Array.isArray(novas) ? novas : [];

    if (!pacienteId) return arrNovas;

    const pid = String(pacienteId);
    const outras = arrAtual.filter((f) => String(f?.pacienteId) !== pid);
    return [...outras, ...arrNovas];
  }

  function upsertCacheUnico(cacheAtual, item) {
    const arr = Array.isArray(cacheAtual) ? [...cacheAtual] : [];
    const id = String(item?.id || "");

    if (id) {
      const idx = arr.findIndex((x) => String(x?.id) === id);
      if (idx !== -1) arr[idx] = item;
      else arr.unshift(item);
      return arr;
    }

    const key = `${String(item?.dataHoraISO || "")}|${String(item?.descricao || "")}|${String(
      item?.valor || ""
    )}|${String(item?.pacienteNome || "")}`;

    const idx2 = arr.findIndex((x) => {
      const k2 = `${String(x?.dataHoraISO || "")}|${String(x?.descricao || "")}|${String(
        x?.valor || ""
      )}|${String(x?.pacienteNome || "")}`;
      return k2 === key;
    });

    if (idx2 !== -1) arr[idx2] = item;
    else arr.unshift(item);

    return arr;
  }

  /* ---------------------------
     API helpers (via window.apiFetch)
  --------------------------- */
  async function apiListFaturas(pacienteId) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const url = pacienteId
      ? `/api/faturas?pacienteId=${encodeURIComponent(pacienteId)}`
      : `/api/faturas`;

    const resp = await apiFetchFn(url, { method: "GET" });
    return extrairArrayFlex(resp, ["items", "faturas"]);
  }

  async function apiCreateFatura(payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/faturas", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    return resp?.item || resp?.fatura || null;
  }

  async function apiUpdateFatura(id, payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn(`/api/faturas/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    return resp?.item || resp?.fatura || payload;
  }

  async function apiDeleteFatura(id) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    await apiFetchFn(`/api/faturas/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  }

  async function apiListPacientes() {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/pacientes", { method: "GET" });
    return extrairArrayFlex(resp, ["pacientes", "items", "lista"]);
  }

  /* ---------------------------
     Pacientes (API-FIRST + fallback)
  --------------------------- */
  async function carregarPacientes() {
    if (typeof window.apiFetch !== "function") {
      pacientes = lsGetArray(LS_PACIENTES);
      popularSelectCadastroPacientes();
      popularFiltroPacientes();
      return;
    }

    try {
      pacientes = await apiListPacientes();
      lsSetArray(LS_PACIENTES, pacientes);
    } catch (err) {
      console.warn("Faturamento: falha ao carregar pacientes da API, fallback:", err?.message || err);
      pacientes = lsGetArray(LS_PACIENTES);
    }

    popularSelectCadastroPacientes();
    popularFiltroPacientes();
  }

  function popularFiltroPacientes() {
    const sel = document.getElementById("pacienteFiltro");
    if (!sel) return;

    const valorAtual = String(sel.value || "");
    sel.innerHTML = `<option value="">Todos</option>`;

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
      const cpfTxt = p.cpf ? ` - CPF: ${p.cpf}` : "";
      opt.textContent = `${p.nome || "Sem nome"}${cpfTxt}`;
      sel.appendChild(opt);
    });

    if (valorAtual) sel.value = valorAtual;
  }

  function popularSelectCadastroPacientes() {
    const el = document.getElementById("paciente");
    if (!el) return;

    const tag = String(el.tagName || "").toUpperCase();
    if (tag !== "SELECT") return;

    const valorAtual = String(el.value || "");
    el.innerHTML = `<option value="">Selecione...</option>`;

    if (!pacientes.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(Nenhum paciente cadastrado)";
      el.appendChild(opt);
      return;
    }

    const listaOrdenada = [...pacientes].sort((a, b) =>
      String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR")
    );

    listaOrdenada.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const cpfTxt = p.cpf ? ` - CPF: ${p.cpf}` : "";
      opt.textContent = `${p.nome || "Sem nome"}${cpfTxt}`;
      el.appendChild(opt);
    });

    if (valorAtual) el.value = valorAtual;
  }

  /* ---------------------------
     Sync API -> LS (cache)
  --------------------------- */
  async function syncFaturasFromAPI(pacienteId) {
    try {
      const items = await apiListFaturas(pacienteId);
      faturas = (Array.isArray(items) ? items : []).sort(ordenarRecentesDesc);

      const cache = carregarFaturasLS();
      const merged = mergeCacheFaturas(cache, faturas, pacienteId);
      salvarFaturasLS(merged.sort(ordenarRecentesDesc));

      return true;
    } catch (err) {
      console.warn("Faturamento: falha ao carregar da API, usando localStorage:", err?.message || err);
      faturas = (pacienteId ? filtrarFaturasLS(pacienteId) : carregarFaturasLS()).sort(ordenarRecentesDesc);
      return false;
    }
  }

  /* ---------------------------
     Render / Total / Resumo
  --------------------------- */
  function atualizarLista() {
    const div = document.getElementById("listaFaturas");
    const totalEl = document.getElementById("totalGeral");
    if (!div) return;

    div.classList.add("timeline");
    div.innerHTML = "<h2>Faturas Registradas</h2>";

    const pid = getFiltroPacienteId();

    const periodo = document.getElementById('f_periodo')?.value || '';
    const fstatus = document.getElementById('f_status')?.value || '';
    const ftipo = document.getElementById('f_tipo')?.value || '';
    const fsearch = (document.getElementById('f_search')?.value || '').trim().toLowerCase();
    const fcategoria = document.getElementById('f_categoria')?.value || '';

    const baseLista = pid ? faturas.filter((f) => String(f?.pacienteId) === pid) : faturas;

    const now = Date.now();
    let startTs = 0;
    if (periodo === '7dias') startTs = now - 7 * 24 * 3600 * 1000;
    else if (periodo === '30dias' || !periodo) startTs = now - 30 * 24 * 3600 * 1000;
    else if (periodo === '1ano') startTs = now - 365 * 24 * 3600 * 1000;

    const lista = baseLista.filter((f) => {
      const ts = new Date(f?.dataHoraISO || f?.createdAt || f?.dataHora || 0).getTime();
      if (startTs && ts < startTs) return false;
      if (fstatus && String(f?.status || '').toLowerCase() !== String(fstatus).toLowerCase()) return false;
      if (ftipo && String(f?.tipo || '').toLowerCase() !== String(ftipo).toLowerCase()) return false;
      if (fcategoria && String(f?.categoria || '').toLowerCase() !== String(fcategoria).toLowerCase()) return false;
      if (fsearch) {
        const hay = `${String(f?.descricao || '')} ${String(f?.pacienteNome || '')} ${String(f?.convenio || '')}`.toLowerCase();
        if (!hay.includes(fsearch)) return false;
      }
      return true;
    }).sort(ordenarRecentesDesc);

    if (!lista.length) {
      div.innerHTML += "<p>Nenhuma fatura registrada.</p>";
      if (totalEl) totalEl.textContent = "Total Geral: R$ 0,00";
      setResumo(
        pid
          ? `Paciente: ${getPacienteNomeDoFiltro(pid)} - Total: R$ 0,00`
          : "Paciente: Todos - Total: R$ 0,00"
      );
      // atualizar cards superiores
      renderTopCards({ totalLancamentos: 0 });
      renderResumoFinanceiro(null);
      return;
    }

    // calcular métricas financeiras simples
    let total = 0;
    let entradas = 0;
    let saidas = 0;
    let contasReceber = 0;
    let contasPagas = 0;
    let contasVencidas = 0;

    lista.forEach((f) => {
      const v = Number.isFinite(Number(f?.valor)) ? Number(f.valor) : parseValorBR(f?.valor);
      const val = Number.isFinite(v) ? v : 0;
      total += val;

      // Tipo: se existir campo 'tipo' com 'entrada'/'saida'
      const tipo = String(f?.tipo || "").toLowerCase();
      if (tipo === "saida" || tipo === "despesa") {
        saidas += val;
      } else {
        // padrão: tratar como entrada
        entradas += val;
      }

      // status: 'pago','pendente','vencido'
      const status = String(f?.status || "").toLowerCase();
      if (status === "pago") contasPagas += 1;
      if (status === "pendente") contasReceber += 1;
      if (status === "vencido") contasVencidas += 1;

      const item = document.createElement("div");
      item.className = "item fatura-card";

      const nome = f.pacienteNome || (f.pacienteId ? getPacienteNomeById(f.pacienteId) : "-");
      const statusClass = String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "sem";
      const statusHtml = status ? `<span class="status-badge status-${escapeHtml(statusClass)}">${escapeHtml(status)}</span>` : "";
      const tipoLabel = String(f.tipo || "entrada");
      const tipoClass = String(tipoLabel || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "entrada";
      const vencimento = f.vencimentoISO ? new Date(f.vencimentoISO).toLocaleDateString("pt-BR") : "";

      item.innerHTML = `
        <div class="fatura-card-header">
          <div class="fatura-meta">
            <div class="fatura-desc">${escapeHtml(f.descricao || f.categoria || "-")}</div>
            <div class="fatura-sub">${escapeHtml(nome)}${f.convenio ? ` - ${escapeHtml(f.convenio)}` : ""}</div>
          </div>
          <div class="fatura-right">
            <div class="fatura-valor">${formatarMoedaBR(val)}</div>
            <span class="tipo-badge tipo-${escapeHtml(tipoClass)}">${escapeHtml(tipoLabel)}</span>
          </div>
        </div>

        <div class="fatura-card-body">
          <div class="fatura-chips">
            ${f.categoria ? `<span class="fatura-chip">Categoria: ${escapeHtml(f.categoria)}</span>` : ""}
            ${statusHtml}
            ${f.dataHora ? `<span class="fatura-chip">Data: ${escapeHtml(f.dataHora)}</span>` : ""}
            ${vencimento ? `<span class="fatura-chip">Venc.: ${escapeHtml(vencimento)}</span>` : ""}
            ${f.formaPagamento ? `<span class="fatura-chip">Forma: ${escapeHtml(f.formaPagamento)}</span>` : ""}
          </div>
        </div>

        <div class="fatura-card-footer">
          <div class="fatura-actions">
            <button class="btn btn-sm btn-imprimir" type="button">Imprimir</button>
            <button class="btn btn-primary btn-sm" type="button">Editar</button>
            <button class="btn btn-danger btn-sm" type="button">Remover</button>
            ${status !== 'pago' ? `<button class="btn btn-success btn-sm" type="button">Marcar como Pago</button>` : `<button class="btn btn-warning btn-sm" type="button">Marcar Pendente</button>`}
          </div>
        </div>
      `;

      // attach handlers preserving existing functions
      const actions = item.querySelectorAll('.fatura-actions button');
      if (actions[0]) actions[0].addEventListener('click', () => imprimirFatura(String(f.id)));
      if (actions[1]) actions[1].addEventListener('click', () => editarFatura(String(f.id)));
      if (actions[2]) actions[2].addEventListener('click', () => removerFatura(String(f.id)));
      if (actions[3]) {
        if (status !== 'pago') actions[3].addEventListener('click', () => marcarPago(String(f.id)));
        else actions[3].addEventListener('click', () => marcarPendente(String(f.id)));
      }

      div.appendChild(item);
    });

    const labelTotal = pid ? "Total do Paciente" : "Total Geral";
    if (totalEl) totalEl.textContent = `${labelTotal}: ${formatarMoedaBR(total)}`;
    setResumo(`Paciente: ${getPacienteNomeDoFiltro(pid)} - ${labelTotal}: ${formatarMoedaBR(total)}`);

    // renderizar cards superiores e resumo
    renderTopCards({ entradas, saidas, saldo: entradas - saidas, contasReceber, contasPagas, contasVencidas, totalLancamentos: lista.length });
    renderResumoFinanceiro({ totalRecebido: entradas, totalPendente: contasReceber, totalVencido: contasVencidas, saldoEstimado: entradas - saidas, lancamentos: lista.length });
  }

  /* ---------------------------
     Render helpers (cards e resumo)
  --------------------------- */
  function renderTopCards(metrics) {
    if (!metrics) metrics = {};
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = (typeof v === 'number' && id.toLowerCase().includes('r$')) ? formatarMoedaBR(v) : (id.toLowerCase().includes('r$') ? v : (typeof v === 'number' ? v : v || 0)); };
    const elEntr = document.getElementById('entradasMes'); if (elEntr) elEntr.textContent = formatarMoedaBR(metrics.entradas || 0);
    const elSaidas = document.getElementById('saidasMes'); if (elSaidas) elSaidas.textContent = formatarMoedaBR(metrics.saidas || 0);
    const elSaldo = document.getElementById('saldoMes'); if (elSaldo) elSaldo.textContent = formatarMoedaBR(metrics.saldo || 0);
    const elCR = document.getElementById('contasReceber'); if (elCR) elCR.textContent = metrics.contasReceber != null ? metrics.contasReceber : 0;
    const elCP = document.getElementById('contasPagas'); if (elCP) elCP.textContent = metrics.contasPagas != null ? metrics.contasPagas : 0;
    const elCV = document.getElementById('contasVencidas'); if (elCV) elCV.textContent = metrics.contasVencidas != null ? metrics.contasVencidas : 0;
    const elTL = document.getElementById('totalLancamentos'); if (elTL) elTL.textContent = metrics.totalLancamentos != null ? metrics.totalLancamentos : 0;
  }

  function renderResumoFinanceiro(data) {
    const el = document.getElementById('resumoFinanceiro');
    if (!el) return;
    if (!data) {
      el.textContent = '';
      return;
    }
    el.innerHTML = `Recebido: ${formatarMoedaBR(data.totalRecebido || 0)} · Pendente: ${data.totalPendente || 0} · Vencido: ${data.totalVencido || 0} · Saldo: ${formatarMoedaBR(data.saldoEstimado || 0)} · Lançamentos: ${data.lancamentos || 0}`;
  }

  /* ---------------------------
     CRUD (cadastro usa #paciente que pode ser SELECT ou INPUT)
  --------------------------- */
  function lerPacienteCadastro() {
    const el = document.getElementById("paciente");
    if (!el) return { pacienteId: "", pacienteNome: "" };

    const tag = String(el.tagName || "").toUpperCase();

    if (tag === "SELECT") {
      const pacienteId = String(el.value || "").trim();
      const label =
        el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex].textContent : "";
      const pacienteNome = limparTextoPacienteLabel(label);

      if (!pacienteId) return { pacienteId: "", pacienteNome: "" };

      if (!pacienteNome && pacienteId) {
        return { pacienteId, pacienteNome: getPacienteNomeById(pacienteId) };
      }

      return { pacienteId, pacienteNome };
    }

    const pacienteNome = String(el.value || "").trim();
    if (!pacienteNome) return { pacienteId: "", pacienteNome: "" };

    const match = pacientes.find(
      (p) => (p?.nome || "").trim().toLowerCase() === pacienteNome.toLowerCase()
    );
    const pacienteId = match ? String(match.id) : "";

    return { pacienteId, pacienteNome };
  }

  async function adicionarFatura() {
    const convenioEl = document.getElementById("convenio");
    const valorEl = document.getElementById("valor");
    const descEl = document.getElementById("descricao");

    const tipoEl = document.getElementById("tipoLancamento");
    const categoriaEl = document.getElementById("categoria");
    const dataEl = document.getElementById("dataLancamento");
    const vencEl = document.getElementById("dataVencimento");
    const statusEl = document.getElementById("statusLancamento");
    const obsEl = document.getElementById("observacoes");
    const formaEl = document.getElementById("formaPagamento");

    const { pacienteId, pacienteNome } = lerPacienteCadastro();
    const convenio = String(convenioEl?.value || "").trim();
    const valorRaw = String(valorEl?.value || "").trim();
    const valor = parseValorBR(valorRaw);
    const descricao = String(descEl?.value || "").trim();
    const tipo = String(tipoEl?.value || "entrada").trim().toLowerCase();
    const categoria = String(categoriaEl?.value || "").trim();
    const dataVal = dataEl?.value ? String(dataEl.value) : "";
    const vencVal = vencEl?.value ? String(vencEl.value) : "";
    const status = String(statusEl?.value || "pendente").trim().toLowerCase();
    const observacoes = String(obsEl?.value || "").trim();
    const formaPagamento = String(formaEl?.value || "").trim();

    if (!convenio || !Number.isFinite(valor) || valor <= 0 || !descricao || !tipo || !categoria) {
      alert("Preencha os campos obrigatórios: tipo, categoria, convênio, valor e descrição.");
      return;
    }

    const dataHoraISO = dataVal ? new Date(dataVal).toISOString() : nowISO();
    const dataHoraBR = dataVal ? new Date(dataVal).toLocaleDateString("pt-BR") : nowBR();
    const dataVencISO = vencVal ? new Date(vencVal).toISOString() : "";

    if (editingId) {
      const payloadEdicao = {
        id: editingId,
        pacienteId: String(pacienteId || ""),
        pacienteNome,
        convenio,
        valor,
        descricao,
        tipo,
        categoria,
        dataHora: dataHoraBR,
        dataHoraISO,
        vencimentoISO: dataVencISO,
        status,
        observacoes,
        formaPagamento,
        usuario: getUsuarioLogado(),
        updatedAt: new Date().toISOString()
      };

      if (typeof window.apiFetch === "function") {
        try {
          const salvo = await apiUpdateFatura(editingId, payloadEdicao);
          const itemFinal = { ...payloadEdicao, ...(salvo || {}) };

          faturas = faturas.map((f) => (String(f?.id) === String(editingId) ? itemFinal : f)).sort(ordenarRecentesDesc);

          const cache = carregarFaturasLS();
          const novoCache = upsertCacheUnico(cache, itemFinal).sort(ordenarRecentesDesc);
          salvarFaturasLS(novoCache);

          editingId = null;
          setModoEdicao(false);
          atualizarLista();
          limparCamposCadastro();
          return;
        } catch (err) {
          console.warn("Faturamento: falha ao atualizar na API, fallback:", err?.message || err);
        }
      }

      const cache = carregarFaturasLS();
      const itemFinal = payloadEdicao;
      const novoCache = upsertCacheUnico(cache, itemFinal).sort(ordenarRecentesDesc);
      salvarFaturasLS(novoCache);

      const pid = getFiltroPacienteId();
      faturas = (pid ? filtrarFaturasLS(pid) : carregarFaturasLS()).sort(ordenarRecentesDesc);

      editingId = null;
      setModoEdicao(false);
      atualizarLista();
      limparCamposCadastro();
      return;
    }

    const payload = {
      id: uid(),
      pacienteId: String(pacienteId || ""),
      pacienteNome,
      convenio,
      valor,
      descricao,
      tipo,
      categoria,
      dataHora: dataHoraBR,
      dataHoraISO,
      vencimentoISO: dataVencISO,
      status,
      observacoes,
      formaPagamento,
      usuario: getUsuarioLogado(),
      createdAt: new Date().toISOString()
    };

    if (typeof window.apiFetch === "function") {
      try {
        const salvo = await apiCreateFatura(payload);
        if (salvo) {
          if (!Number.isFinite(Number(salvo.valor))) {
            const pv = parseValorBR(salvo.valor);
            if (Number.isFinite(pv)) salvo.valor = pv;
          }

          faturas = [salvo, ...faturas].sort(ordenarRecentesDesc);

          const cache = carregarFaturasLS();
          const novoCache = upsertCacheUnico(cache, salvo).sort(ordenarRecentesDesc);
          salvarFaturasLS(novoCache);

          popularSelectCadastroPacientes();
          popularFiltroPacientes();

          atualizarLista();
          limparCamposCadastro();
          return;
        }
      } catch (err) {
        console.warn("Faturamento: falha ao salvar na API, fallback:", err?.message || err);
      }
    }

    const cache = carregarFaturasLS();
    const novoCache = upsertCacheUnico(cache, payload).sort(ordenarRecentesDesc);
    salvarFaturasLS(novoCache);

    const pid = getFiltroPacienteId();
    faturas = (pid ? filtrarFaturasLS(pid) : carregarFaturasLS()).sort(ordenarRecentesDesc);

    atualizarLista();
    limparCamposCadastro();
  }

  async function removerFatura(id) {
    const fid = String(id);
    const cache = carregarFaturasLS();
    const idx = cache.findIndex((x) => String(x?.id) === fid);
    if (idx === -1) return;

    if (!confirm("Remover esta fatura?")) return;

    if (typeof window.apiFetch === "function") {
      try {
        await apiDeleteFatura(fid);
      } catch (err) {
        console.warn("Faturamento: falha ao remover na API, removendo do cache:", err?.message || err);
      }
    }

    cache.splice(idx, 1);
    salvarFaturasLS(cache);

    const pid = getFiltroPacienteId();
    faturas = (pid ? filtrarFaturasLS(pid) : carregarFaturasLS()).sort(ordenarRecentesDesc);

    if (editingId === fid) {
      editingId = null;
      setModoEdicao(false);
    }

    atualizarLista();
  }

  function editarFatura(id) {
    const f = faturas.find((x) => String(x?.id) === String(id));
    if (!f) return;

    editingId = String(f.id);

    const pacienteEl = document.getElementById("paciente");
    const convenioEl = document.getElementById("convenio");
    const valorEl = document.getElementById("valor");
    const descEl = document.getElementById("descricao");
    const tipoEl = document.getElementById("tipoLancamento");
    const categoriaEl = document.getElementById("categoria");
    const dataEl = document.getElementById("dataLancamento");
    const vencEl = document.getElementById("dataVencimento");
    const statusEl = document.getElementById("statusLancamento");
    const obsEl = document.getElementById("observacoes");
    const formaEl = document.getElementById("formaPagamento");

    if (pacienteEl) {
      const tag = String(pacienteEl.tagName || "").toUpperCase();
      if (tag === "SELECT") pacienteEl.value = f.pacienteId || "";
      else pacienteEl.value = f.pacienteNome || "";
    }

    if (convenioEl) convenioEl.value = f.convenio || "";
    if (valorEl) valorEl.value = String(f.valor ?? "");
    if (descEl) descEl.value = f.descricao || "";
    if (tipoEl) tipoEl.value = f.tipo || (f.tipo === undefined ? "entrada" : f.tipo);
    if (categoriaEl) categoriaEl.value = f.categoria || "";
    if (dataEl) dataEl.value = f.dataHoraISO ? (new Date(f.dataHoraISO)).toISOString().slice(0,10) : "";
    if (vencEl) vencEl.value = f.vencimentoISO ? (new Date(f.vencimentoISO)).toISOString().slice(0,10) : "";
    if (statusEl) statusEl.value = f.status || "pendente";
    if (obsEl) obsEl.value = f.observacoes || "";
    if (formaEl) formaEl.value = f.formaPagamento || "";

    setModoEdicao(true);
  }

  function imprimirFatura(id) {
    const f = faturas.find((x) => String(x?.id) === String(id));
    if (!f) return;

    const nome = f.pacienteNome || (f.pacienteId ? getPacienteNomeById(f.pacienteId) : "-");
    const html = `
      <html>
      <head><title>Fatura</title></head>
      <body>
        <h2>Fatura</h2>
        <p><strong>Paciente:</strong> ${escapeHtml(nome)}</p>
        <p><strong>Convênio:</strong> ${escapeHtml(f.convenio || "-")}</p>
        <p><strong>Valor:</strong> R$ ${Number(f.valor || 0).toFixed(2)}</p>
        <p><strong>Descrição:</strong> ${escapeHtml(f.descricao || "-")}</p>
        <p><strong>Faturado por:</strong> ${escapeHtml(f.usuario || "-")}</p>
        <p><strong>Data/Hora:</strong> ${escapeHtml(f.dataHora || "-")}</p>
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

  function limparCamposCadastro() {
    const pacienteEl = document.getElementById("paciente");
    const convenioEl = document.getElementById("convenio");
    const valorEl = document.getElementById("valor");
    const descEl = document.getElementById("descricao");

    if (pacienteEl) pacienteEl.value = "";
    if (convenioEl) convenioEl.value = "";
    if (valorEl) valorEl.value = "";
    if (descEl) descEl.value = "";

    const tipoEl = document.getElementById("tipoLancamento");
    const categoriaEl = document.getElementById("categoria");
    const dataEl = document.getElementById("dataLancamento");
    const vencEl = document.getElementById("dataVencimento");
    const statusEl = document.getElementById("statusLancamento");
    const obsEl = document.getElementById("observacoes");
    const formaEl = document.getElementById("formaPagamento");

    if (tipoEl) tipoEl.value = "entrada";
    if (categoriaEl) categoriaEl.value = "";
    if (dataEl) dataEl.value = "";
    if (vencEl) vencEl.value = "";
    if (statusEl) statusEl.value = "pendente";
    if (obsEl) obsEl.value = "";
    if (formaEl) formaEl.value = "";

    editingId = null;
    setModoEdicao(false);
  }

  /* ---------------------------
     Filtro (select novo)
  --------------------------- */
  async function onFiltroChange() {
    const pid = getFiltroPacienteId();

    if (typeof window.apiFetch === "function") {
      await syncFaturasFromAPI(pid);
    } else {
      faturas = (pid ? filtrarFaturasLS(pid) : carregarFaturasLS()).sort(ordenarRecentesDesc);
    }

    atualizarLista();
  }

  function limparFiltroPaciente() {
    const sel = document.getElementById("pacienteFiltro");
    if (sel) sel.value = "";

    faturas = carregarFaturasLS().sort(ordenarRecentesDesc);
    atualizarLista();

    if (typeof window.apiFetch === "function") {
      syncFaturasFromAPI("")
        .then(() => atualizarLista())
        .catch(() => {});
    }
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    faturas = carregarFaturasLS().sort(ordenarRecentesDesc);
    atualizarLista();

    await carregarPacientes();

    const selFiltro = document.getElementById("pacienteFiltro");
    if (selFiltro) selFiltro.addEventListener("change", onFiltroChange);

    const btnFiltrar = document.getElementById('btnFiltrar');
    if (btnFiltrar) btnFiltrar.addEventListener('click', () => atualizarLista());

    if (typeof window.apiFetch === "function") {
      await syncFaturasFromAPI("");
    } else {
      faturas = carregarFaturasLS().sort(ordenarRecentesDesc);
    }

    setModoEdicao(false);
    atualizarLista();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.adicionarFatura = adicionarFatura;
  window.removerFatura = removerFatura;
  window.editarFatura = editarFatura;
  window.imprimirFatura = imprimirFatura;
  window.limparFiltroPaciente = limparFiltroPaciente;
  window.marcarPago = async function (id) {
    await updateStatus(id, 'pago');
  };
  window.marcarPendente = async function (id) {
    await updateStatus(id, 'pendente');
  };

  async function updateStatus(id, status) {
    const fid = String(id || '');
    const idx = faturas.findIndex((x) => String(x?.id) === fid);
    if (idx === -1) return;

    faturas[idx].status = status;
    if (typeof window.apiFetch === 'function') {
      try {
        await apiUpdateFatura(fid, { ...faturas[idx] });
      } catch (e) {
        console.warn('Faturamento: falha ao atualizar status na API, fallback:', e?.message || e);
      }
    }

    const cache = carregarFaturasLS();
    const novo = upsertCacheUnico(cache, faturas[idx]).sort(ordenarRecentesDesc);
    salvarFaturasLS(novo);
    atualizarLista();
  }
})();
