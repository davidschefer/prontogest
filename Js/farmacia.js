/* ===========================
   6-Farmacia.js -" FARMÁCIA / ESTOQUE (API-FIRST + fallback)
   - Endpoints esperados (quando existirem no server.js):
       GET  /api/farmacia/estoque
       PUT  /api/farmacia/estoque
       GET  /api/farmacia/movimentos
       POST /api/farmacia/movimentos
   - Fallback seguro no localStorage:
       farmacia_estoque_v1       (objeto)
       farmacia_movimentos_v1    (array)
   - Mantém HTML/onclick
   =========================== */

(function () {
  const LS_ESTOQUE = "farmacia_estoque_v1";
  const LS_MOVIMENTOS = "farmacia_movimentos_v1";
  const LS_MED_PADRAO = "medicamentos_padrao_v1";
  const SUGESTOES_ID = "medicamentos-sugestoes";

  /* ---------------------------
     Utils
  --------------------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nowBR() {
    return new Date().toLocaleString("pt-BR");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toInt(v) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeNomeMed(medicamento) {
    const s = String(medicamento ?? "").trim();
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function getMedicamentosBase() {
    return [
      // Hipertensao / cardiacos
      "Losartana",
      "Enalapril",
      "Captopril",
      "Amlodipino",
      "Nifedipino",
      "Valsartana",
      "Lisinopril",
      "Clortalidona",
      "Atenolol",
      "Metoprolol",
      "Carvedilol",
      "Propranolol",
      "Digoxina",
      "Amiodarona",
      "Mononitrato de isossorbida",
      "Nitroglicerina",
      "Ácido acetilsalicílico",
      "Clopidogrel",
      // Diabetes (DM)
      "Metformina",
      "Glibenclamida",
      "Gliclazida",
      "Glimepirida",
      "Sitagliptina",
      "Insulina NPH",
      "Insulina Regular",
      "Insulina Glargina",
      // Diureticos
      "Furosemida",
      "Hidroclorotiazida",
      "Espironolactona",
      "Indapamida",
      "Clortalidona",
      // Antitermicos / analgesicos
      "Dipirona",
      "Paracetamol",
      "Ibuprofeno",
      "Tramadol",
      "Cetorolaco",
      "Ácido acetilsalicílico",
      // Anti-inflamatorios
      "Diclofenaco",
      "Naproxeno",
      "Cetoprofeno",
      "Nimesulida",
      "Meloxicam",
      // Antibioticos
      "Amoxicilina",
      "Amoxicilina + clavulanato de potássio",
      "Azitromicina",
      "Cefalexina",
      "Ceftriaxona",
      "Ciprofloxacino",
      "Levofloxacino",
      "Doxiciclina",
      "Clindamicina",
      "Metronidazol",
      "Sulfametoxazol + Trimetoprim",
    ];
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

  function getMedicamentosPadraoLS() {
    const lista = lsGetArray(LS_MED_PADRAO);
    return lista
      .map((x) => String(x?.nome || "").trim())
      .filter(Boolean);
  }

  function atualizarSugestoesMedicamentos() {
    const datalist = document.getElementById(SUGESTOES_ID);
    if (!datalist) return;

    const base = getMedicamentosBase();
    const padrao = getMedicamentosPadraoLS();
    const estoqueKeys = Object.keys(estoque || {});
    const unicos = Array.from(
      new Set(
        [...base, ...padrao, ...estoqueKeys]
          .map((s) => String(s || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    datalist.innerHTML = unicos.map((m) => `<option value="${escapeHtml(m)}"></option>`).join("");
  }

  function isErroConexaoOuRota(msg) {
    const m = String(msg || "");
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network|404|Not Found/i.test(m);
  }

  function extrairListaFlex(resp) {
    if (Array.isArray(resp)) return resp;
    if (resp && typeof resp === "object") {
      if (Array.isArray(resp.items)) return resp.items;
      if (Array.isArray(resp.movimentos)) return resp.movimentos;
      if (Array.isArray(resp.data)) return resp.data;
      if (Array.isArray(resp.lista)) return resp.lista;
    }
    return [];
  }

  function extrairEstoqueFlex(resp) {
    if (resp && typeof resp === "object") {
      const est = resp.estoque || resp.data || resp.item || resp;
      if (est && typeof est === "object" && !Array.isArray(est)) return est;
    }
    return {};
  }

  /* ---------------------------
     Storage (fallback/cache)
  --------------------------- */
  function carregarEstoqueLS() {
    try {
      const raw = localStorage.getItem(LS_ESTOQUE);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function salvarEstoqueLS(estoque) {
    try {
      localStorage.setItem(LS_ESTOQUE, JSON.stringify(estoque || {}));
    } catch {}
  }

  function carregarMovimentosLS() {
    try {
      const raw = localStorage.getItem(LS_MOVIMENTOS);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function salvarMovimentosLS(lista) {
    try {
      localStorage.setItem(LS_MOVIMENTOS, JSON.stringify(Array.isArray(lista) ? lista : []));
    } catch {}
  }

  /* ---------------------------
     Estado (cache em memória)
  --------------------------- */
  let estoque = carregarEstoqueLS();        // { "Dipirona": 10 }
  let movimentos = carregarMovimentosLS();  // histórico (prepend)

  /* ---------------------------
     API helpers (via window.apiFetch)
  --------------------------- */
  async function apiListEstoque() {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/farmacia/estoque", { method: "GET" });
    return extrairEstoqueFlex(resp);
  }

  async function apiSaveEstoque(estoqueObj) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/farmacia/estoque", {
      method: "PUT",
      body: JSON.stringify({ estoque: estoqueObj }),
    });

    // aceita {estoque:{...}} ou objeto direto
    const est = extrairEstoqueFlex(resp);
    return est && typeof est === "object" ? est : (estoqueObj || {});
  }

  async function apiListMovimentos() {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/farmacia/movimentos", { method: "GET" });
    return extrairListaFlex(resp);
  }

  async function apiCreateMovimento(payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/farmacia/movimentos", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // aceita {item:{...}} ou objeto direto
    if (resp && typeof resp === "object") return resp.item || resp.movimento || resp;
    return null;
  }

  /* ---------------------------
     Sync API -> LocalStorage (cache)
  --------------------------- */
  async function syncFromAPI() {
    if (typeof window.apiFetch !== "function") return false;

    try {
      const [estApi, movApi] = await Promise.all([apiListEstoque(), apiListMovimentos()]);

      estoque = estApi && typeof estApi === "object" ? estApi : {};
      movimentos = Array.isArray(movApi) ? movApi : [];

      salvarEstoqueLS(estoque);
      salvarMovimentosLS(movimentos);
      return true;
    } catch (err) {
      console.warn("Farmácia: falha ao sync da API, usando localStorage:", err?.message || err);
      estoque = carregarEstoqueLS();
      movimentos = carregarMovimentosLS();
      return false;
    }
  }

  /* ---------------------------
     Regras de negócio
  --------------------------- */
  function validarMovimento({ medicamento, quantidade, tipo }) {
    if (!medicamento || !tipo) {
      alert("Preencha todos os campos obrigatórios.");
      return false;
    }

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      alert("Informe uma quantidade válida (maior que 0).");
      return false;
    }

    if (tipo !== "entrada" && tipo !== "saida") {
      alert("Tipo de movimento inválido.");
      return false;
    }

    if (tipo === "saida") {
      const saldoAtual = Number(estoque[medicamento] || 0);
      if (saldoAtual < quantidade) {
        alert("Estoque insuficiente.");
        return false;
      }
    }

    return true;
  }

  function aplicarMovimentoNoEstoque({ medicamento, quantidade, tipo }) {
    const atual = Number(estoque[medicamento] || 0);
    estoque[medicamento] = tipo === "entrada" ? (atual + quantidade) : (atual - quantidade);
    return Number(estoque[medicamento] || 0);
  }

  /* ---------------------------
     UI
  --------------------------- */
  function atualizarLista() {
    const div = document.getElementById("listaMovimentos");
    if (!div) return;

    div.innerHTML = "<h2>Movimentos Registrados</h2>";

    if (!movimentos.length) {
      div.innerHTML += "<p>Nenhum movimento registrado.</p>";
      return;
    }

    movimentos.forEach((m) => {
      const item = document.createElement("div");
      item.className = "item";

      item.innerHTML = `
        <p><strong>Medicamento:</strong> ${escapeHtml(m.medicamento)}</p>
        <p><strong>Quantidade:</strong> ${escapeHtml(m.quantidade)} (${escapeHtml(m.tipo)})</p>
        <p><strong>Lote:</strong> ${escapeHtml(m.lote || "-")}</p>
        <p><strong>Saldo Atual:</strong> ${escapeHtml(m.saldo)}</p>
        <p style="opacity:.75"><small>${escapeHtml(m.dataHoraBR || "")}</small></p>
      `;

      div.appendChild(item);
    });
  }

  function limparCampos() {
    ["medicamento", "quantidade", "lote"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const tipo = document.getElementById("tipoMovimento");
    if (tipo) tipo.value = "";
  }

  function substituirPorClientId(clientId, itemApi) {
    if (!clientId || !itemApi) return false;
    const idx = movimentos.findIndex((x) => String(x?.clientId) === String(clientId));
    if (idx !== -1) {
      movimentos[idx] = itemApi;
      return true;
    }
    return false;
  }

  /* ---------------------------
     Ação principal (onclick)
  --------------------------- */
  async function registrarMovimento() {
    const medicamentoRaw = document.getElementById("medicamento")?.value || "";
    const medicamento = normalizeNomeMed(medicamentoRaw);

    const quantidadeStr = document.getElementById("quantidade")?.value || "";
    const quantidade = toInt(quantidadeStr);

    const tipo = document.getElementById("tipoMovimento")?.value || "";
    const lote = String(document.getElementById("lote")?.value || "").trim();

    if (!validarMovimento({ medicamento, quantidade, tipo })) return;

    // clientId para evitar duplicação quando API gerar id diferente
    const clientId = uid();

    // aplica no estado local (UX imediata)
    const saldo = aplicarMovimentoNoEstoque({ medicamento, quantidade, tipo });

    const movimentoLocal = {
      id: clientId,        // id local
      clientId,            // referência
      medicamento,
      quantidade,
      tipo,
      lote,
      saldo,
      dataHoraBR: nowBR(),
      dataHoraISO: nowISO(),
    };

    // otimista: atualiza UI/LS
    movimentos.unshift(movimentoLocal);
    salvarEstoqueLS(estoque);
    salvarMovimentosLS(movimentos);

    atualizarLista();
    limparCampos();
    atualizarSugestoesMedicamentos();

    // API-first
    if (typeof window.apiFetch === "function") {
      try {
        // 1) registra movimento
        const salvoMov = await apiCreateMovimento(movimentoLocal);

        // 2) salva estoque inteiro (mantém seu padrão atual)
        const estSalvo = await apiSaveEstoque(estoque);

        // 3) normaliza cache
        if (salvoMov) {
          // garante clientId para substituição (se backend não devolver)
          if (!salvoMov.clientId) salvoMov.clientId = clientId;

          const ok = substituirPorClientId(clientId, salvoMov);
          if (!ok) movimentos.unshift(salvoMov);
        }

        if (estSalvo && typeof estSalvo === "object") estoque = estSalvo;

        salvarEstoqueLS(estoque);
        salvarMovimentosLS(movimentos);
        atualizarLista();
        atualizarSugestoesMedicamentos();
      } catch (err) {
        const msg = err?.message || err;
        if (!isErroConexaoOuRota(msg)) {
          console.warn("Farmácia: erro do servidor ao salvar na API:", msg);
          alert("Movimento salvo localmente, mas a API retornou erro. (Veja o console)");
        } else {
          console.warn("Farmácia: API indisponível (ok por enquanto):", msg);
        }
      }
    }
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    estoque = carregarEstoqueLS();
    movimentos = carregarMovimentosLS();
    atualizarLista();
    atualizarSugestoesMedicamentos();

    await syncMedicamentosPadraoFromAPI();
    atualizarSugestoesMedicamentos();

    await syncFromAPI();
    atualizarLista();
    atualizarSugestoesMedicamentos();
  }

  async function syncMedicamentosPadraoFromAPI() {
    if (typeof window.apiFetch !== "function") return false;
    try {
      const resp = await window.apiFetch("/api/medicamentos-padrao", { method: "GET" });
      const lista = Array.isArray(resp?.items)
        ? resp.items
        : Array.isArray(resp?.lista)
        ? resp.lista
        : Array.isArray(resp?.data)
        ? resp.data
        : Array.isArray(resp?.medicamentos)
        ? resp.medicamentos
        : Array.isArray(resp)
        ? resp
        : [];
      if (lista.length) {
        lsSet(LS_MED_PADRAO, lista);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // expõe pro onclick
  window.registrarMovimento = registrarMovimento;
})();
