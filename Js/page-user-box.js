(function () {
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getAuthInfo() {
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem("auth_user"));
    } catch {
      user = null;
    }

    const email = user?.email || localStorage.getItem("auth_email") || "";
    const role =
      user?.role ||
      localStorage.getItem("auth_role") ||
      localStorage.getItem("auth_perfil") ||
      localStorage.getItem("auth_tipo") ||
      "";

    return { email, role };
  }

  function findTitle() {
    return (
      document.querySelector(".content h1") ||
      document.querySelector(".container h1") ||
      document.querySelector("h1")
    );
  }

  function getPageName() {
    const raw = (document.title || findTitle()?.textContent || "Página")
      .replace(/\s*[-–—]\s*ProntoGest\s*$/i, "")
      .replace(/\s*[-–—]\s*Mini SGH\s*$/i, "")
      .trim();
    return raw || "Página";
  }

  function applySidebarState() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;
    const collapsed = localStorage.getItem("ui_sidebar_collapsed_v1") === "1";
    document.body.classList.toggle("sidebar-collapsed", collapsed);
  }

  function toggleSidebar() {
    document.body.classList.toggle("sidebar-collapsed");
    const collapsed = document.body.classList.contains("sidebar-collapsed");
    localStorage.setItem("ui_sidebar_collapsed_v1", collapsed ? "1" : "0");
  }

  function buildHeader() {
    const content = document.querySelector(".content");
    const title = findTitle();
    if (!content || !title) return null;

    let header = document.querySelector(".his-header");
    if (header) return header;

    header = document.createElement("div");
    header.className = "his-header";
    header.setAttribute("aria-label", "Barra de contexto");
    header.innerHTML = `
      <div class="his-header-left">
        <button type="button" class="his-menu-toggle" id="globalMenuToggle" aria-label="Recolher menu" title="Recolher menu">
          <i class="fa-solid fa-bars"></i>
        </button>
        <span class="his-breadcrumb">${escapeHtml(getPageName())} - ProntoGest</span>
      </div>
      <div class="his-header-right">
        <input type="text" class="his-search" id="globalPageSearch" placeholder="Buscar nesta página..." />
      </div>
    `;

    title.insertAdjacentElement("beforebegin", header);
    return header;
  }

  function ensureBoxAfterTitle() {
    const title = findTitle();
    if (!title) return null;

    let box = document.getElementById("profissionalBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "profissionalBox";
      box.className = "prof-box";
      box.style.display = "none";
      title.insertAdjacentElement("afterend", box);
    }
    return box;
  }

  function buildPageHero() {
    const content = document.querySelector(".content");
    const title = findTitle();
    const header = buildHeader();
    const box = ensureBoxAfterTitle();
    if (!content || !title || !header || !box) return null;
    if (document.querySelector(".dashboard-hero")) return null;

    let hero = document.querySelector(".page-hero");
    if (!hero) {
      hero = document.createElement("section");
      hero.className = "page-hero";
      hero.innerHTML = `
        <div class="page-hero-left">
          <p class="page-eyebrow">PRONTOGEST - PAINEL OPERACIONAL</p>
        </div>
        <div class="page-hero-right">
          <div class="page-hero-chip is-action" id="btnAssistencia" tabindex="0" role="button">
            <i class="fa-solid fa-shield-heart"></i>
            <div>
              <strong>Assistência segura</strong>
              <span>Fluxo clínico organizado</span>
            </div>
          </div>
          <div class="page-hero-chip is-action" id="btnIndicadores" tabindex="0" role="button">
            <i class="fa-solid fa-chart-line"></i>
            <div>
              <strong>Indicadores ativos</strong>
              <span>Acompanhe em tempo real</span>
            </div>
          </div>
        </div>
      `;
      content.insertBefore(hero, content.firstChild);
    }

    const left = hero.querySelector('.page-hero-left');
    [header, title, box].forEach((el) => {
      if (el && el.parentElement !== left) left.appendChild(el);
    });

    return hero;
  }

  function renderUserBox() {
    const box = ensureBoxAfterTitle();
    if (!box) return;

    const { email, role } = getAuthInfo();
    if (!email) {
      box.style.display = "none";
      return;
    }

    box.innerHTML = `Profissional logado: ${escapeHtml(email)}${role ? ` (${escapeHtml(role)})` : ""}`;
    box.style.display = "block";
  }

  function getSearchTargets() {
    const targets = [];

    document.querySelectorAll("tbody tr").forEach((el) => targets.push(el));

    document.querySelectorAll(".lista, [id^='lista']").forEach((container) => {
      Array.from(container.children).forEach((child) => {
        if (/^(H1|H2|H3|P|SPAN|SMALL)$/i.test(child.tagName)) return;
        targets.push(child);
      });
    });

    document.querySelectorAll(".cards .card, .timeline-item, .item, .prescricao-item, .evolucao-item, .leito-card, .consulta-card").forEach((el) => {
      targets.push(el);
    });

    return Array.from(new Set(targets)).filter(Boolean);
  }

  function applySearch(term) {
    const normalized = term.trim().toLowerCase();
    const targets = getSearchTargets();
    if (!targets.length) return;

    targets.forEach((el) => {
      const text = (el.innerText || el.textContent || "").toLowerCase();
      const shouldHide = normalized && !text.includes(normalized);
      el.classList.toggle("his-hidden-by-search", !!shouldHide);
    });
  }

  function bindSearch(input) {
    if (!input || input.dataset.boundSearch) return;
    input.addEventListener("input", function () {
      applySearch(input.value || "");
    });
    input.dataset.boundSearch = "1";
  }

  function highlightCurrentMenu() {
    const current = (window.location.pathname.split("/").pop() || "").toLowerCase();
    if (!current) return;

    document.querySelectorAll(".sidebar a[href]").forEach((link) => {
      const href = (link.getAttribute("href") || "").split("/").pop().toLowerCase();
      link.classList.toggle("is-active", !!href && href === current);
    });
  }

  function ensureAssistModal() {
    let modal = document.getElementById('assistModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'assistModal';
    modal.className = 'assist-modal';
    modal.innerHTML = `
      <div class="assist-modal-card" role="dialog" aria-modal="true" aria-labelledby="assistModalTitle">
        <h3 id="assistModalTitle">Assistência segura</h3>
        <p>Resumo rápido da sessão e do ambiente para manter seu fluxo operacional claro e seguro.</p>
        <div class="assist-modal-list" id="assistModalList"></div>
        <div class="assist-modal-actions">
          <button type="button" class="btn btn-primary" id="assistModalClose">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) modal.classList.remove('is-open');
    });
    modal.querySelector('#assistModalClose')?.addEventListener('click', () => {
      modal.classList.remove('is-open');
    });
    return modal;
  }

  function openAssistModal() {
    const modal = ensureAssistModal();
    const { email, role } = getAuthInfo();
    const list = modal.querySelector('#assistModalList');
    if (list) {
      list.innerHTML = `
        <div class="assist-modal-item"><strong>Usuário logado</strong><span>${escapeHtml(email || 'Não identificado')}</span></div>
        <div class="assist-modal-item"><strong>Perfil de acesso</strong><span>${escapeHtml(role || 'Não informado')}</span></div>
        <div class="assist-modal-item"><strong>Página atual</strong><span>${escapeHtml(getPageName())}</span></div>
      `;
    }
    modal.classList.add('is-open');
  }

  function scrollToIndicators() {
    const target = document.querySelector('.dashboard-kpis, .cards, .lista, .table-wrap, .card-sgh-md, .card');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindAssistActions(root) {
    if (!root) return;
    root.querySelectorAll('#btnAssistencia, [data-action="assistencia"]')
      .forEach((el) => {
        if (el.dataset.boundAction) return;
        const handler = (ev) => {
          if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          openAssistModal();
        };
        el.addEventListener('click', handler);
        el.addEventListener('keydown', handler);
        el.dataset.boundAction = '1';
      });

    root.querySelectorAll('#btnIndicadores, [data-action="indicadores"]')
      .forEach((el) => {
        if (el.dataset.boundAction) return;
        const handler = (ev) => {
          if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
          ev.preventDefault();
          scrollToIndicators();
        };
        el.addEventListener('click', handler);
        el.addEventListener('keydown', handler);
        el.dataset.boundAction = '1';
      });
  }

  function ensureHeader() {
    const header = buildHeader() || document.querySelector(".his-header");
    if (!header) return null;

    const breadcrumb = header.querySelector(".his-breadcrumb");
    if (breadcrumb && !breadcrumb.textContent.trim()) {
      breadcrumb.textContent = `${getPageName()} - ProntoGest`;
    }

    const existingToggle = header.querySelector("#hisMenuToggle, #globalMenuToggle, .his-menu-toggle");
    if (existingToggle && !existingToggle.dataset.boundToggle) {
      existingToggle.addEventListener("click", toggleSidebar);
      existingToggle.dataset.boundToggle = "1";
    }

    const searchInput = header.querySelector(".his-search");
    if (searchInput) {
      searchInput.placeholder = searchInput.placeholder || "Buscar nesta página...";
      bindSearch(searchInput);
    }

    return header;
  }

  function init() {
    enforceClinicaModuleGuard();
    applySidebarState();
    ensureHeader();
    renderUserBox();
    buildPageHero();
    bindAssistActions(document);
    highlightCurrentMenu();
  }

  function enforceClinicaModuleGuard() {
    const role = String(localStorage.getItem("auth_role") || "").trim().toLowerCase();
    if (role === "superadmin") return;

    const clinicaId = String(localStorage.getItem("auth_clinica_id") || "").trim();
    if (!clinicaId) return;

    let mods = null;
    try {
      const raw = localStorage.getItem("clinica_modules_" + clinicaId);
      mods = raw ? JSON.parse(raw) : null;
    } catch {
      mods = null;
    }
    if (!mods || typeof mods !== "object") return;

    const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
    const pageMap = {
      "dashboard.html": "dashboard",
      "pacientes.html": "pacientes",
      "triagem.html": "triagem",
      "prontuario.html": "prontuario",
      "prescricoes.html": "prescricoes",
      "leitos.html": "leitos",
      "consultas.html": "consultas",
      "farmacia.html": "farmacia",
      "faturamento.html": "faturamento",
      "funcionarios-cadastro.html": "funcionarios",
      "funcionarios-lista.html": "funcionarios",
      "relatorios.html": "relatorios",
    };

    const moduleKey = pageMap[page];
    if (!moduleKey) return;
    if (mods[moduleKey] === false) {
      alert("Módulo desativado para esta clínica.");
      window.location.href = "./dashboard.html";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
