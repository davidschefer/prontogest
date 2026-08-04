(function () {
  const STORAGE_KEY = "superadmin_financeiro";

  function getDefaultData() {
    return [];
  }

  function readData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (error) {
      console.warn("Financeiro: falha ao ler cache local.", error);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDefaultData()));
    return getDefaultData();
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(data) ? data : []));
  }

  async function loadFinanceiro() {
    try {
      if (typeof window.apiFetch === "function") {
        const data = await window.apiFetch("/api/financeiro");
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length) {
          saveData(items);
          return items;
        }
      }
    } catch (error) {
      console.warn("Financeiro: API indisponível, usando fallback local.", error?.message || error);
    }

    return readData();
  }

  function formatCurrency(value) {
    const num = Number(value || 0);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(num);
  }

  function getStatusLabel(status) {
    const labels = {
      trial: "Trial",
      ativo: "Ativo",
      inadimplente: "Inadimplente"
    };

    return labels[String(status || "").toLowerCase()] || "Sem status";
  }

  function getStatusClass(status) {
    const map = {
      trial: "status-trial",
      ativo: "status-ativo",
      inadimplente: "status-inadimplente"
    };

    return map[String(status || "").toLowerCase()] || "status-ativo";
  }

  function getFilteredRows(rows, status, query) {
    const queryText = String(query || "").trim().toLowerCase();

    return rows.filter((item) => {
      const matchesStatus = status === "todos" || String(item.status || "").toLowerCase() === status;
      const matchesQuery = !queryText ||
        String(item.nome || "").toLowerCase().includes(queryText) ||
        String(item.clinica_id || "").toLowerCase().includes(queryText);

      return matchesStatus && matchesQuery;
    });
  }

  function renderSummary(rows) {
    const totalImplantacao = rows.reduce((sum, item) => sum + Number(item.implantacao || 0), 0);
    const totalMensalidade = rows.reduce((sum, item) => sum + Number(item.mensalidade || 0), 0);
    const totalAtivos = rows.filter((item) => String(item.status || "").toLowerCase() === "ativo").length;
    const totalTrial = rows.filter((item) => String(item.status || "").toLowerCase() === "trial").length;
    const totalInadimplentes = rows.filter((item) => String(item.status || "").toLowerCase() === "inadimplente").length;

    document.getElementById("totalImplantacao").textContent = formatCurrency(totalImplantacao);
    document.getElementById("totalMensalidade").textContent = formatCurrency(totalMensalidade);
    document.getElementById("totalAtivos").textContent = String(totalAtivos);
    document.getElementById("totalTrial").textContent = String(totalTrial);
    document.getElementById("totalInadimplentes").textContent = String(totalInadimplentes);
  }

  function renderList(rows) {
    const container = document.getElementById("financeiroLista");
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = '<div class="empty-finance-state">Nenhuma clínica encontrada para os filtros selecionados.</div>';
      return;
    }

    container.innerHTML = rows.map((item) => {
      const statusText = getStatusLabel(item.status);
      const statusClass = getStatusClass(item.status);
      const bloqueadoText = item.bloqueado ? "Bloqueado" : "Sem bloqueio";

      return `
        <article class="finance-item">
          <div class="finance-item-header">
            <h3>${item.nome}</h3>
            <span class="status-pill ${statusClass}">${statusText}</span>
          </div>

          <div class="finance-metrics">
            <div class="finance-metric">
              <span>Implantação</span>
              <strong>${formatCurrency(item.implantacao)}</strong>
            </div>
            <div class="finance-metric">
              <span>Mensalidade</span>
              <strong>${formatCurrency(item.mensalidade)}</strong>
            </div>
            <div class="finance-metric">
              <span>Última cobrança</span>
              <strong>${item.ultimaCobranca || "--"}</strong>
            </div>
            <div class="finance-metric">
              <span>Próximo venc.</span>
              <strong>${item.proximoVencimento || "--"}</strong>
            </div>
            <div class="finance-metric">
              <span>Status da conta</span>
              <strong>${bloqueadoText}</strong>
            </div>
          </div>

          <div class="finance-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="cobrar" data-id="${item.clinica_id}">Gerar cobrança</button>
            <button class="btn btn-sm" type="button" data-action="status" data-id="${item.clinica_id}">Alterar status</button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function refresh() {
    const status = document.getElementById("filtroStatusFinanceiro")?.value || "todos";
    const query = document.getElementById("buscaFinanceiro")?.value || "";
    const rows = await loadFinanceiro();
    const filtered = getFilteredRows(rows, status, query);

    renderSummary(rows);
    renderList(filtered);
  }

  function bindEvents() {
    const filtroStatus = document.getElementById("filtroStatusFinanceiro");
    const buscaFinanceiro = document.getElementById("buscaFinanceiro");
    const btnGerar = document.getElementById("btnGerarCobranca");

    filtroStatus?.addEventListener("change", () => refresh());
    buscaFinanceiro?.addEventListener("input", () => refresh());

    btnGerar?.addEventListener("click", async () => {
      try {
        if (typeof window.apiFetch === "function") {
          const data = await window.apiFetch("/api/financeiro/cobrancas", { method: "POST" });
          if (data?.items?.length) {
            saveData(data.items);
            await refresh();
            alert(`${data.total} cobrança${data.total !== 1 ? "es" : ""} recorrente${data.total !== 1 ? "s" : ""} gerada com sucesso.`);
            return;
          }
        }
      } catch (error) {
        console.warn("Financeiro: falha ao gerar cobrança via API.", error?.message || error);
      }

      const rows = readData();
      const ativos = rows.filter((item) => String(item.status || "").toLowerCase() !== "inadimplente");
      const quantidade = ativos.length;
      alert(`${quantidade} cobrança${quantidade !== 1 ? "es" : ""} recorrente${quantidade !== 1 ? "s" : ""} gerada com sucesso.`);
    });

    document.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;

      const { action, id } = target.dataset;
      const rows = await loadFinanceiro();
      const item = rows.find((entry) => String(entry.clinica_id) === String(id));
      if (!item) return;

      if (action === "cobrar") {
        try {
          if (typeof window.apiFetch === "function") {
            const updated = await window.apiFetch(`/api/financeiro/${encodeURIComponent(id)}/status`, {
              method: "PUT",
              body: { status: "ativo" }
            });
            if (updated?.item) {
              saveData(rows.map((entry) => String(entry.clinica_id) === String(id) ? updated.item : entry));
              await refresh();
              alert(`Cobrança gerada para ${item.nome}.`);
              return;
            }
          }
        } catch (error) {
          console.warn("Financeiro: falha ao cobrar via API.", error?.message || error);
        }

        item.ultimaCobranca = new Date().toISOString().slice(0, 10);
        item.proximoVencimento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        item.status = "ativo";
        item.bloqueado = false;
        saveData(rows);
        await refresh();
        alert(`Cobrança gerada para ${item.nome}.`);
      }

      if (action === "status") {
        const nextStatus = item.status === "trial" ? "ativo" : item.status === "ativo" ? "inadimplente" : "trial";

        try {
          if (typeof window.apiFetch === "function") {
            const updated = await window.apiFetch(`/api/financeiro/${encodeURIComponent(id)}/status`, {
              method: "PUT",
              body: { status: nextStatus }
            });
            if (updated?.item) {
              saveData(rows.map((entry) => String(entry.clinica_id) === String(id) ? updated.item : entry));
              await refresh();
              alert(`Status da clínica ${item.nome} atualizado para ${getStatusLabel(nextStatus)}.`);
              return;
            }
          }
        } catch (error) {
          console.warn("Financeiro: falha ao atualizar status via API.", error?.message || error);
        }

        item.status = nextStatus;
        item.bloqueado = nextStatus === "inadimplente";
        saveData(rows);
        await refresh();
        alert(`Status da clínica ${item.nome} atualizado para ${getStatusLabel(nextStatus)}.`);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    refresh();
  });
})();
