(function () {
  const TIPO_LABELS = {
    reabilitacao: "Clínica de reabilitação",
    "casa-repouso": "Casa de repouso (ILPI)",
    "saude-mental": "Saúde mental",
    ambulatorio: "Ambulatório",
    consultorio: "Consultório",
    laboratorio: "Laboratório",
    hospital: "Pequeno hospital",
    outro: "Outro",
  };

  const INTERESSE_LABELS = {
    trial: "Testar grátis 7 dias",
    proposta: "Quer proposta",
    duvida: "Só tem dúvida",
  };

  const STATUS_LABELS = {
    novo: "Novo",
    em_contato: "Em contato",
    convertido: "Convertido",
    descartado: "Descartado",
  };

  function formatWhatsapp(v) {
    const d = String(v || "").replace(/\D+/g, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d;
  }

  function waLink(v, nome) {
    const d = String(v || "").replace(/\D+/g, "");
    const withCountry = d.startsWith("55") ? d : `55${d}`;
    const msg = encodeURIComponent(`Olá ${nome || ""}! Vi que você se cadastrou na ProntoGest, vamos conversar?`);
    return `https://wa.me/${withCountry}?text=${msg}`;
  }

  function formatDate(iso) {
    if (!iso) return "--";
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  async function loadLeads(status, query) {
    const params = new URLSearchParams();
    if (status && status !== "todos") params.set("status", status);
    if (query) params.set("q", query);
    const qs = params.toString();
    const data = await window.apiFetch(`/api/leads${qs ? `?${qs}` : ""}`);
    return data;
  }

  function renderSummary(resumo) {
    document.getElementById("totalLeads").textContent = String(resumo?.total ?? 0);
    document.getElementById("totalNovo").textContent = String(resumo?.totalNovo ?? 0);
    document.getElementById("totalEmContato").textContent = String(resumo?.totalEmContato ?? 0);
    document.getElementById("totalConvertido").textContent = String(resumo?.totalConvertido ?? 0);
  }

  function renderList(items) {
    const container = document.getElementById("leadsLista");
    if (!container) return;

    if (!items.length) {
      container.innerHTML = '<div class="empty-finance-state">Nenhum lead encontrado para os filtros selecionados.</div>';
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const statusKey = String(item.status || "novo");
        const statusLabel = STATUS_LABELS[statusKey] || statusKey;
        const tipoLabel = TIPO_LABELS[item.tipo] || item.tipo || "--";
        const interesseLabel = INTERESSE_LABELS[item.interesse] || item.interesse || "--";

        return `
          <article class="lead-item">
            <div class="lead-item-header">
              <h3>${item.nome || "Sem nome"}</h3>
              <span class="status-pill status-${statusKey}">${statusLabel}</span>
            </div>
            <p class="lead-sub">${item.instituicao || "--"} · recebido em ${formatDate(item.createdAt)}</p>

            <div class="lead-metrics">
              <div class="lead-metric"><span>Tipo</span><strong>${tipoLabel}</strong></div>
              <div class="lead-metric"><span>WhatsApp</span><strong>${formatWhatsapp(item.whatsapp)}</strong></div>
              <div class="lead-metric"><span>Quer fazer</span><strong>${interesseLabel}</strong></div>
              <div class="lead-metric"><span>Origem</span><strong>${item.origem || "landing-page"}</strong></div>
            </div>

            <div class="lead-actions">
              <a class="btn btn-whatsapp" href="${waLink(item.whatsapp, item.nome)}" target="_blank" rel="noopener noreferrer">
                <i class="fa-brands fa-whatsapp"></i> Chamar no WhatsApp
              </a>
              <button class="btn btn-sm" type="button" data-action="em_contato" data-id="${item.id}">Marcar em contato</button>
              <button class="btn btn-sm" type="button" data-action="convertido" data-id="${item.id}">Marcar convertido</button>
              <button class="btn btn-sm" type="button" data-action="descartado" data-id="${item.id}">Descartar</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function refresh() {
    const status = document.getElementById("filtroStatusLead")?.value || "todos";
    const query = document.getElementById("buscaLead")?.value || "";

    try {
      const data = await loadLeads(status, query);
      renderSummary(data?.resumo);
      renderList(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.warn("Leads: falha ao carregar.", error?.message || error);
      document.getElementById("leadsLista").innerHTML =
        '<div class="empty-finance-state">Não foi possível carregar os leads agora. Tente novamente em instantes.</div>';
    }
  }

  function bindEvents() {
    document.getElementById("filtroStatusLead")?.addEventListener("change", refresh);
    document.getElementById("buscaLead")?.addEventListener("input", refresh);
    document.getElementById("btnAtualizarLeads")?.addEventListener("click", refresh);

    document.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      if (!["em_contato", "convertido", "descartado"].includes(target.dataset.action)) return;

      const { action, id } = target.dataset;
      try {
        await window.apiFetch(`/api/leads/${encodeURIComponent(id)}/status`, {
          method: "PUT",
          body: { status: action },
        });
        await refresh();
      } catch (error) {
        alert(`Não foi possível atualizar o lead: ${error?.message || error}`);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    refresh();
  });
})();
