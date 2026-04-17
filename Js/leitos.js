/* ===========================
   5-Gerenciamento-De-Leitos.js -" Mini SGH (API-FIRST + fallback)
   - Pacientes: API GET /api/pacientes (fallback: pacientes_lista_v1)
   - Leitos (backend atual):
       GET /api/leitos
       PUT /api/leitos/:numero   (ex: "Leito 1")
   - Fallback seguro localStorage: leitos_v1
   - Mantém HTML/onclick do jeito que está
   =========================== */

(function () {
  const LS_LEITOS = "leitos_v1";
  const LS_PACIENTES = "pacientes_lista_v1";

  let pacientes = [];
  let leitos = [];

  const pacienteSelect = document.getElementById("pacienteSelect");
  const leitoSelect = document.getElementById("leitoSelect");

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

  function nowISO() {
    return new Date().toISOString();
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

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // não quebra por quota/privacidade
    }
  }

  // ordena por número: "Leito 2" antes de "Leito 10"
  function leitoSortKey(l) {
    const s = String(l?.numero || "");
    const m = s.match(/(\d+)/);
    const n = m ? Number(m[1]) : Number.NaN;
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }

  function ordenarLeitos(a, b) {
    const na = leitoSortKey(a);
    const nb = leitoSortKey(b);
    if (na !== nb) return na - nb;
    return String(a?.numero || "").localeCompare(String(b?.numero || ""));
  }

  function normalizarLeitos(arr) {
    const base = Array.isArray(arr) ? arr : [];
    return base
      .map((l, idx) => {
        const numero = String(l?.numero || `Leito ${idx + 1}`);
        return {
          numero,
          ocupado: Boolean(l?.ocupado),
          pacienteId: l?.pacienteId ? String(l.pacienteId) : "",
          pacienteNome: l?.pacienteNome ? String(l.pacienteNome) : "",
          updatedAt: l?.updatedAt ? String(l.updatedAt) : null,
          createdAt: l?.createdAt ? String(l.createdAt) : null
        };
      })
      .sort(ordenarLeitos);
  }

  function gerarLeitosPadrao(qtd = 10) {
    const base = [];
    for (let i = 1; i <= qtd; i++) {
      base.push({
        numero: "Leito " + i,
        ocupado: false,
        pacienteId: "",
        pacienteNome: "",
        createdAt: nowISO(),
        updatedAt: null
      });
    }
    return base;
  }

  function getPacientePorId(id) {
    const pid = String(id || "");
    return pacientes.find((x) => String(x?.id) === pid) || null;
  }

  function isErroConexao(msg) {
    const m = String(msg || "");
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network/i.test(m);
  }

  /* ---------------------------
     API helpers (via window.apiFetch)
  --------------------------- */
  async function apiListLeitos() {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/leitos", { method: "GET" });
    // padrão esperado: { ok:true, items:[...] }
    return Array.isArray(resp?.items) ? resp.items : [];
  }

  async function apiUpdateLeitoByNumero(numero, patch) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn(`/api/leitos/${encodeURIComponent(numero)}`, {
      method: "PUT",
      body: JSON.stringify(patch)
    });
    // padrão esperado: { ok:true, item:{...} }
    return resp?.item || null;
  }

  /* ---------------------------
     Sync API -> LocalStorage
  --------------------------- */
  async function syncLeitosFromAPI() {
    try {
      const items = await apiListLeitos();
      leitos = normalizarLeitos(items);
      lsSet(LS_LEITOS, leitos);
      return true;
    } catch (err) {
      console.warn("Leitos: falha ao carregar da API, usando localStorage:", err?.message || err);
      leitos = normalizarLeitos(lsGetArray(LS_LEITOS));
      return false;
    }
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
      lsSet(LS_PACIENTES, pacientes);
    } catch (err) {
      console.warn("Falha ao carregar pacientes da API, usando fallback:", err?.message || err);
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
     UI (Leitos)
  --------------------------- */
  function popularLeitosSelect() {
    if (!leitoSelect) return;

    leitoSelect.innerHTML = `<option value="">Selecione um leito...</option>`;
    leitos.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.numero; // o. value = "Leito X"
      opt.textContent = l.numero;
      leitoSelect.appendChild(opt);
    });
  }

  function atualizarLeitosUI() {
    const div = document.getElementById("listaLeitos");
    if (!div) return;

    div.innerHTML = "";

    leitos.forEach((l, i) => {
      const item = document.createElement("div");
      item.className = "item " + (l.ocupado ? "ocupado" : "livre");

      const pacienteTxt = l.ocupado
        ? `Paciente: ${escapeHtml(l.pacienteNome || "-")}`
        : "Livre";

      item.innerHTML = `
        <strong>${escapeHtml(l.numero)}</strong><br>
        ${pacienteTxt}
        ${
          l.ocupado
            ? `<br><button type="button" onclick="liberarLeito(${i})">Liberar</button>`
            : ""
        }
      `;

      div.appendChild(item);
    });
  }

  function resetSelects() {
    if (pacienteSelect) pacienteSelect.value = "";
    if (leitoSelect) leitoSelect.value = "";
  }

  /* ---------------------------
     Ações (API-FIRST + fallback)
  --------------------------- */
  async function ocuparLeito() {
    const pacienteId = String(pacienteSelect?.value || "").trim();
    const leitoNumero = String(leitoSelect?.value || "").trim();

    if (!pacienteId || !leitoNumero) {
      alert("Selecione paciente e leito.");
      return;
    }

    const l = leitos.find((x) => String(x?.numero) === leitoNumero);
    if (!l) {
      alert("Leito não encontrado.");
      return;
    }
    if (l.ocupado) {
      alert("Leito já ocupado.");
      return;
    }

    const p = getPacientePorId(pacienteId);
    if (!p) {
      alert("Paciente não encontrado.");
      return;
    }

    const patch = {
      ocupado: true,
      pacienteId,
      pacienteNome: p.nome || "Paciente",
      updatedAt: nowISO()
    };

    // o. API-first
    if (typeof window.apiFetch === "function") {
      try {
        const salvo = await apiUpdateLeitoByNumero(leitoNumero, patch);
        if (salvo) {
          l.ocupado = Boolean(salvo.ocupado);
          l.pacienteId = String(salvo.pacienteId || "");
          l.pacienteNome = String(salvo.pacienteNome || "");
          l.updatedAt = String(salvo.updatedAt || patch.updatedAt);
        } else {
          Object.assign(l, patch);
        }

        // salva sempre no LS como cache
        lsSet(LS_LEITOS, leitos);

        popularLeitosSelect();
        atualizarLeitosUI();
        resetSelects();
        return;
      } catch (err) {
        console.warn("Leitos: falha ao ocupar na API:", err?.message || err);

        // se não for erro de conexão, mostra e não altera local
        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao ocupar leito.");
          return;
        }
      }
    }

    // o. fallback localStorage
    // recarrega do LS antes de escrever (evita sobrescrever alterações feitas em outra aba)
    leitos = normalizarLeitos(lsGetArray(LS_LEITOS));
    const lf = leitos.find((x) => String(x?.numero) === leitoNumero);
    if (!lf) {
      alert("Leito não encontrado (fallback).");
      return;
    }
    if (lf.ocupado) {
      alert("Leito já ocupado (fallback).");
      return;
    }

    Object.assign(lf, patch);
    lsSet(LS_LEITOS, leitos);

    popularLeitosSelect();
    atualizarLeitosUI();
    resetSelects();
  }

  async function liberarLeito(index) {
    const l = leitos[index];
    if (!l) return;

    const patch = {
      ocupado: false,
      pacienteId: "",
      pacienteNome: "",
      updatedAt: nowISO()
    };

    // o. API-first
    if (typeof window.apiFetch === "function") {
      try {
        const salvo = await apiUpdateLeitoByNumero(l.numero, patch);
        if (salvo) {
          l.ocupado = Boolean(salvo.ocupado);
          l.pacienteId = String(salvo.pacienteId || "");
          l.pacienteNome = String(salvo.pacienteNome || "");
          l.updatedAt = String(salvo.updatedAt || patch.updatedAt);
        } else {
          Object.assign(l, patch);
        }

        lsSet(LS_LEITOS, leitos);
        popularLeitosSelect();
        atualizarLeitosUI();
        return;
      } catch (err) {
        console.warn("Leitos: falha ao liberar na API:", err?.message || err);

        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao liberar leito.");
          return;
        }
      }
    }

    // o. fallback localStorage
    leitos = normalizarLeitos(lsGetArray(LS_LEITOS));
    const lf = leitos.find((x) => String(x?.numero) === String(l.numero));
    if (!lf) return;

    Object.assign(lf, patch);
    lsSet(LS_LEITOS, leitos);

    popularLeitosSelect();
    atualizarLeitosUI();
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    // 1) fallback primeiro
    leitos = normalizarLeitos(lsGetArray(LS_LEITOS));

    // 2) se vazio, cria base
    if (!leitos.length) {
      leitos = gerarLeitosPadrao(10);
      lsSet(LS_LEITOS, leitos);
    }

    // 3) render inicial
    popularLeitosSelect();
    atualizarLeitosUI();

    // 4) carrega pacientes (API-first + fallback)
    await carregarPacientes();

    // 5) tenta sincronizar leitos da API (se der erro, segue LS)
    await syncLeitosFromAPI();

    // 6) render final
    popularLeitosSelect();
    atualizarLeitosUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // expõe pro onclick do HTML
  window.ocuparLeito = ocuparLeito;
  window.liberarLeito = liberarLeito;
})();
/* ===========================
   5-Gerenciamento-De-Leitos.js -" Mini SGH (API-FIRST + fallback)
   - Pacientes: API GET /api/pacientes (fallback: pacientes_lista_v1)
   - Leitos (backend atual):
       GET /api/leitos
       PUT /api/leitos/:numero   (ex: "Leito 1")
   - Fallback seguro localStorage: leitos_v1
   - Mantém HTML/onclick do jeito que está
   =========================== */

(function () {
  const LS_LEITOS = "leitos_v1";
  const LS_PACIENTES = "pacientes_lista_v1";

  let pacientes = [];
  let leitos = [];

  const pacienteSelect = document.getElementById("pacienteSelect");
  const leitoSelect = document.getElementById("leitoSelect");

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

  function nowISO() {
    return new Date().toISOString();
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

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // não quebra por quota/privacidade
    }
  }

  function isErroConexao(msg) {
    const m = String(msg || "");
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network|conex/i.test(m);
  }

  // ordena por número: "Leito 2" antes de "Leito 10"
  function leitoSortKey(l) {
    const s = String(l?.numero || "");
    const m = s.match(/(\d+)/);
    const n = m ? Number(m[1]) : Number.NaN;
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }

  function ordenarLeitos(a, b) {
    const na = leitoSortKey(a);
    const nb = leitoSortKey(b);
    if (na !== nb) return na - nb;
    return String(a?.numero || "").localeCompare(String(b?.numero || ""));
  }

  function normalizarLeitos(arr) {
    const base = Array.isArray(arr) ? arr : [];
    return base
      .map((l, idx) => {
        const numero = String(l?.numero || `Leito ${idx + 1}`);
        return {
          numero,
          ocupado: Boolean(l?.ocupado),
          pacienteId: l?.pacienteId ? String(l.pacienteId) : "",
          pacienteNome: l?.pacienteNome ? String(l.pacienteNome) : "",
          updatedAt: l?.updatedAt ? String(l.updatedAt) : null,
          createdAt: l?.createdAt ? String(l.createdAt) : null,
        };
      })
      .sort(ordenarLeitos);
  }

  function gerarLeitosPadrao(qtd = 10) {
    const base = [];
    for (let i = 1; i <= qtd; i++) {
      base.push({
        numero: "Leito " + i,
        ocupado: false,
        pacienteId: "",
        pacienteNome: "",
        createdAt: nowISO(),
        updatedAt: null,
      });
    }
    return base;
  }

  function getPacientePorId(id) {
    const pid = String(id || "");
    return pacientes.find((x) => String(x?.id) === pid) || null;
  }

  function extrairListaLeitosFlex(resp) {
    if (Array.isArray(resp)) return resp;
    if (resp && typeof resp === "object") {
      if (Array.isArray(resp.items)) return resp.items;
      if (Array.isArray(resp.leitos)) return resp.leitos;
      if (Array.isArray(resp.data)) return resp.data;
      if (Array.isArray(resp.lista)) return resp.lista;
    }
    return [];
  }

  function mergeLeitosPorNumero(lsArr, apiArr) {
    // mantém status local caso API esteja vazia/atrasada, mas atualiza quando API trouxer dados
    const map = new Map();

    (Array.isArray(lsArr) ? lsArr : []).forEach((l) => {
      const k = String(l?.numero || "").trim();
      if (k) map.set(k, l);
    });

    (Array.isArray(apiArr) ? apiArr : []).forEach((l) => {
      const k = String(l?.numero || "").trim();
      if (k) map.set(k, l);
    });

    return normalizarLeitos(Array.from(map.values()));
  }

  /* ---------------------------
     API helpers (via window.apiFetch)
  --------------------------- */
  async function apiListLeitos() {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/leitos", { method: "GET" });
    return extrairListaLeitosFlex(resp);
  }

  async function apiUpdateLeitoByNumero(numero, patch) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    // backend: PUT /api/leitos/:numero
    const resp = await apiFetchFn(`/api/leitos/${encodeURIComponent(numero)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });

    // backend pode responder { item }, { leito }, ou o próprio objeto
    if (resp && typeof resp === "object") {
      return resp.item || resp.leito || resp;
    }
    return null;
  }

  /* ---------------------------
     Sync API -> LocalStorage (sem perder fallback)
  --------------------------- */
  async function syncLeitosFromAPI() {
    try {
      const itemsApi = await apiListLeitos();

      const lsAtual = lsGetArray(LS_LEITOS);
      const merged = mergeLeitosPorNumero(lsAtual, itemsApi);

      leitos = merged;
      lsSet(LS_LEITOS, merged);
      return true;
    } catch (err) {
      console.warn("Leitos: falha ao carregar da API, usando localStorage:", err?.message || err);
      leitos = normalizarLeitos(lsGetArray(LS_LEITOS));
      return false;
    }
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
      lsSet(LS_PACIENTES, pacientes);
    } catch (err) {
      console.warn("Falha ao carregar pacientes da API, usando fallback:", err?.message || err);
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
     UI (Leitos)
  --------------------------- */
  function popularLeitosSelect() {
    if (!leitoSelect) return;

    leitoSelect.innerHTML = `<option value="">Selecione um leito...</option>`;
    leitos.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.numero; // value = "Leito X"
      opt.textContent = l.numero;
      leitoSelect.appendChild(opt);
    });
  }

  function atualizarLeitosUI() {
    const div = document.getElementById("listaLeitos");
    if (!div) return;

    div.innerHTML = "";

    leitos.forEach((l, i) => {
      const item = document.createElement("div");
      item.className = "item " + (l.ocupado ? "ocupado" : "livre");

      const pacienteTxt = l.ocupado
        ? `Paciente: ${escapeHtml(l.pacienteNome || "-")}`
        : "Livre";

      item.innerHTML = `
        <strong>${escapeHtml(l.numero)}</strong><br>
        ${pacienteTxt}
        ${
          l.ocupado
            ? `<br><button type="button" onclick="liberarLeito(${i})">Liberar</button>`
            : ""
        }
      `;

      div.appendChild(item);
    });
  }

  function resetSelects() {
    if (pacienteSelect) pacienteSelect.value = "";
    if (leitoSelect) leitoSelect.value = "";
  }

  /* ---------------------------
     Ações (API-FIRST + fallback)
  --------------------------- */
  async function ocuparLeito() {
    const pacienteId = String(pacienteSelect?.value || "").trim();
    const leitoNumero = String(leitoSelect?.value || "").trim();

    if (!pacienteId || !leitoNumero) {
      alert("Selecione paciente e leito.");
      return;
    }

    const l = leitos.find((x) => String(x?.numero) === leitoNumero);
    if (!l) return alert("Leito não encontrado.");
    if (l.ocupado) return alert("Leito já ocupado.");

    const p = getPacientePorId(pacienteId);
    if (!p) return alert("Paciente não encontrado.");

    const patch = {
      ocupado: true,
      pacienteId,
      pacienteNome: p.nome || "Paciente",
      updatedAt: nowISO(),
    };

    if (typeof window.apiFetch === "function") {
      try {
        const salvo = await apiUpdateLeitoByNumero(leitoNumero, patch);
        Object.assign(l, patch, salvo || {});
        lsSet(LS_LEITOS, leitos);

        popularLeitosSelect();
        atualizarLeitosUI();
        resetSelects();
        return;
      } catch (err) {
        console.warn("Leitos: falha ao ocupar na API:", err?.message || err);
        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao ocupar leito.");
          return;
        }
      }
    }

    // fallback
    leitos = normalizarLeitos(lsGetArray(LS_LEITOS));
    const lf = leitos.find((x) => String(x?.numero) === leitoNumero);
    if (!lf) return alert("Leito não encontrado (fallback).");
    if (lf.ocupado) return alert("Leito já ocupado (fallback).");

    Object.assign(lf, patch);
    lsSet(LS_LEITOS, leitos);

    popularLeitosSelect();
    atualizarLeitosUI();
    resetSelects();
  }

  async function liberarLeito(index) {
    const l = leitos[index];
    if (!l) return;

    const patch = {
      ocupado: false,
      pacienteId: "",
      pacienteNome: "",
      updatedAt: nowISO(),
    };

    if (typeof window.apiFetch === "function") {
      try {
        const salvo = await apiUpdateLeitoByNumero(l.numero, patch);
        Object.assign(l, patch, salvo || {});
        lsSet(LS_LEITOS, leitos);

        popularLeitosSelect();
        atualizarLeitosUI();
        return;
      } catch (err) {
        console.warn("Leitos: falha ao liberar na API:", err?.message || err);
        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao liberar leito.");
          return;
        }
      }
    }

    // fallback
    leitos = normalizarLeitos(lsGetArray(LS_LEITOS));
    const lf = leitos.find((x) => String(x?.numero) === String(l.numero));
    if (!lf) return;

    Object.assign(lf, patch);
    lsSet(LS_LEITOS, leitos);

    popularLeitosSelect();
    atualizarLeitosUI();
  }

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    // fallback primeiro
    leitos = normalizarLeitos(lsGetArray(LS_LEITOS));

    // se vazio, cria base
    if (!leitos.length) {
      leitos = gerarLeitosPadrao(10);
      lsSet(LS_LEITOS, leitos);
    }

    // render inicial
    popularLeitosSelect();
    atualizarLeitosUI();

    // carrega pacientes
    await carregarPacientes();

    // tenta sync API (sem destruir fallback)
    await syncLeitosFromAPI();

    // render final
    popularLeitosSelect();
    atualizarLeitosUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // expõe pro onclick do HTML
  window.ocuparLeito = ocuparLeito;
  window.liberarLeito = liberarLeito;
})();
