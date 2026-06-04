/* ===========================
   8-Relatorio.js -" RELAT"RIO SIMPLES (API-FIRST + fallback)
   - API-first:
       /api/pacientes
       /api/triagens
       /api/leitos
       /api/prescricoes
       /api/consultas
       /api/farmacia/estoque
       /api/farmacia/movimentos
   - Fallback (localStorage):
       pacientes_lista_v1
       triagens_lista_v1
       leitos_v1
       prescricoes_v1
       consultas_v1
       farmacia_estoque_v1
       farmacia_movimentos_v1
   - Exportação (demo): JSON para download
   =========================== */

(function () {
  /* ---------------------------
     LocalStorage helpers
  --------------------------- */
  function lsArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function lsObject(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // não quebra por quota/privacidade
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function isErroConexaoOuRota(msg) {
    const m = String(msg || "");
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network|404|Not Found/i.test(m);
  }

  /* ---------------------------
     Extratores flexíveis (respostas API)
  --------------------------- */
  function extrairArrayFlex(resp, chaves = []) {
    if (Array.isArray(resp)) return resp;
    if (!resp || typeof resp !== "object") return [];
    for (const k of chaves) {
      if (Array.isArray(resp[k])) return resp[k];
    }
    // fallback comum
    if (Array.isArray(resp.items)) return resp.items;
    if (Array.isArray(resp.data)) return resp.data;
    if (Array.isArray(resp.lista)) return resp.lista;
    return [];
  }

  function extrairObjectFlex(resp, chaves = []) {
    if (resp && typeof resp === "object" && !Array.isArray(resp)) {
      for (const k of chaves) {
        const v = resp[k];
        if (v && typeof v === "object" && !Array.isArray(v)) return v;
      }
    }
    return {};
  }

  /* ---------------------------
     API safe GET (via window.apiFetch)
  --------------------------- */
  async function apiSafeGet(path) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") {
      return { ok: false, err: new Error("apiFetch indisponível") };
    }

    try {
      const resp = await apiFetchFn(path, { method: "GET" });
      return { ok: true, resp };
    } catch (err) {
      return { ok: false, err };
    }
  }

  /* ---------------------------
     Fontes de dados (API-first + fallback + cache refresh)
  --------------------------- */
  async function obterPacientes() {
    const r = await apiSafeGet("/api/pacientes");
    if (r.ok) {
      const arr = extrairArrayFlex(r.resp, ["pacientes", "items"]);
      lsSet("pacientes_lista_v1", arr);
      return arr;
    }
    return lsArray("pacientes_lista_v1");
  }

  async function obterTriagens() {
    const r = await apiSafeGet("/api/triagens");
    if (r.ok) {
      const arr = extrairArrayFlex(r.resp, ["triagens", "items"]);
      lsSet("triagens_lista_v1", arr);
      return arr;
    }
    return lsArray("triagens_lista_v1");
  }

  async function obterLeitos() {
    const r = await apiSafeGet("/api/leitos");
    if (r.ok) {
      const arr = extrairArrayFlex(r.resp, ["items", "leitos"]);
      lsSet("leitos_v1", arr);
      return arr;
    }
    return lsArray("leitos_v1");
  }

  async function obterPrescricoes() {
    const r = await apiSafeGet("/api/prescricoes");
    if (r.ok) {
      const arr = extrairArrayFlex(r.resp, ["items", "prescricoes"]);
      lsSet("prescricoes_v1", arr);
      return arr;
    }
    return lsArray("prescricoes_v1");
  }

  async function obterConsultas() {
    const r = await apiSafeGet("/api/consultas");
    if (r.ok) {
      const arr = extrairArrayFlex(r.resp, ["items", "consultas"]);
      lsSet("consultas_v1", arr);
      return arr;
    }
    return lsArray("consultas_v1");
  }

  async function obterEstoqueFarmacia() {
    const r = await apiSafeGet("/api/farmacia/estoque");
    if (r.ok) {
      const obj = extrairObjectFlex(r.resp, ["estoque"]);
      lsSet("farmacia_estoque_v1", obj);
      return obj;
    }
    return lsObject("farmacia_estoque_v1");
  }

  async function obterMovimentosFarmacia() {
    const r = await apiSafeGet("/api/farmacia/movimentos");
    if (r.ok) {
      const arr = extrairArrayFlex(r.resp, ["items", "movimentos"]);
      lsSet("farmacia_movimentos_v1", arr);
      return arr;
    }
    return lsArray("farmacia_movimentos_v1");
  }

  /* ---------------------------
     Indicadores
  --------------------------- */
  async function atualizarIndicadores() {
    const [pacientes, triagens, leitos, prescricoes, consultas, estoque] =
      await Promise.all([
        obterPacientes(),
        obterTriagens(),
        obterLeitos(),
        obterPrescricoes(),
        obterConsultas(),
        obterEstoqueFarmacia()
      ]);

    const pacientesArr = Array.isArray(pacientes) ? pacientes : [];
    const triagensArr = Array.isArray(triagens) ? triagens : [];
    const leitosArr = Array.isArray(leitos) ? leitos : [];
    const prescricoesArr = Array.isArray(prescricoes) ? prescricoes : [];
    const consultasArr = Array.isArray(consultas) ? consultas : [];

    // Leitos ocupados: cobre ocupado=true OU status="ocupado"
    const leitosOcupados = leitosArr.filter(
      (l) => l && (l.ocupado === true || String(l.status || "").toLowerCase() === "ocupado")
    ).length;

    const leitosLivres = leitosArr.length ? leitosArr.length - leitosOcupados : 0;

    const triagensTotal = triagensArr.length;

    // Estoque: conta meds com saldo > 0
    const meds = Object.entries(estoque || {});
    const medicamentosEmEstoque = meds.filter(([, q]) => Number(q) > 0).length;

    // Críticos: saldo >0 e <=2
    const medicamentosCriticos = meds.filter(([, q]) => Number(q) > 0 && Number(q) <= 2).length;

    setText("internados", leitosOcupados);
    setText("triagem", triagensTotal);

    setText("leitosOcupados", leitosOcupados);
    setText("leitosLivres", leitosLivres);

    setText("estoqueMedicamentos", medicamentosEmEstoque);
    setText("medicamentosCriticos", medicamentosCriticos);

    setText("consultasAgendadas", consultasArr.length);
    setText("prescricoes", prescricoesArr.length);

    // se existir no HTML
    setText("pacientesTotal", pacientesArr.length);

    // retornar métricas para uso em resumo/insights
    return {
      pacientes: pacientesArr.length,
      triagens: triagensTotal,
      leitosOcupados,
      leitosLivres,
      consultas: consultasArr.length,
      prescricoes: prescricoesArr.length,
      estoqueMedicamentos: medicamentosEmEstoque,
      medicamentosCriticos,
      fonteApi: typeof window.apiFetch === "function"
    };
  }

  function renderResumo(metrics) {
    try {
      if (!metrics) {
        setText('res_pacientes', '-');
        setText('res_triagens', '-');
        setText('res_consultas', '-');
        setText('res_leitos', '-');
        setText('res_criticos', '-');
        return;
      }
      setText('res_pacientes', metrics.pacientes);
      setText('res_triagens', metrics.triagens);
      setText('res_consultas', metrics.consultas);
      setText('res_leitos', metrics.leitosOcupados);
      setText('res_criticos', metrics.medicamentosCriticos);
    } catch (e) {
      console.warn('Erro renderResumo', e);
    }
  }

  function renderInsights(metrics) {
    const container = document.getElementById('insightsList');
    if (!container) return;
    container.innerHTML = '';

    const items = [];
    if (!metrics) {
      container.innerHTML = '<div class="evo-empty">Nenhum insight disponível.</div>';
      return;
    }

    if (metrics.medicamentosCriticos && Number(metrics.medicamentosCriticos) > 0) {
      items.push({ type: 'critico', text: `${metrics.medicamentosCriticos} itens críticos no estoque` });
    }

    if (metrics.leitosOcupados && metrics.leitosOcupados > 0) {
      const pct = metrics.leitosOcupados + ' leitos ocupados';
      items.push({ type: 'leitos', text: pct });
    }

    if (metrics.triagens && metrics.triagens > metrics.consultas) {
      items.push({ type: 'triagem', text: `Triagens (${metrics.triagens}) superiores a consultas (${metrics.consultas})` });
    }

    if (!items.length) {
      container.innerHTML = '<div class="evo-empty">Nenhum ponto de atenção detectado.</div>';
      return;
    }

    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'insight-item';
      el.textContent = it.text;
      container.appendChild(el);
    });
  }

  /* ---------------------------
     Export (demo)
  --------------------------- */
  async function exportar() {
    const [pacientes, triagens, leitos, prescricoes, consultas, estoque, movimentos] =
      await Promise.all([
        obterPacientes(),
        obterTriagens(),
        obterLeitos(),
        obterPrescricoes(),
        obterConsultas(),
        obterEstoqueFarmacia(),
        obterMovimentosFarmacia()
      ]);

    const payload = {
      geradoEm: new Date().toISOString(),
      fonte: { apiFetchDisponivel: typeof window.apiFetch === "function" },
      pacientes,
      triagens,
      leitos,
      prescricoes,
      consultas,
      farmacia: { estoque, movimentos }
    };

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-mini-sgh-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      alert(
        "Exportação (demo): baixei um JSON com os dados atuais.\n" +
          "PDF entra quando integrarmos backend."
      );
    } catch (err) {
      alert("Não foi possível exportar agora. (Veja o console)");
      console.warn("Erro ao exportar JSON:", err);
    }
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    try {
      const metrics = await atualizarIndicadores();
      renderResumo(metrics);
      renderInsights(metrics);
    } catch (err) {
      const msg = err?.message || err;
      console.warn("Relatório: falha ao atualizar indicadores:", msg);

      if (!isErroConexaoOuRota(msg)) {
        // erro -oreal- (não conexão/rota) -" mantemos silencioso pra não irritar o usuário
      }
    }

    // mantém compat com onclick
    window.exportar = exportar;
    // ligar botão gerar
    const btn = document.getElementById('btnGerar');
    if (btn) btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const m = await atualizarIndicadores();
        renderResumo(m);
        renderInsights(m);
      } catch (err) {
        console.warn('Falha ao gerar relatório:', err);
      }
      btn.disabled = false;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
