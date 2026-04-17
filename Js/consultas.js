/* ===========================
   7-Consultas.js - AGENDA DE CONSULTAS (API-FIRST + fallback)
   - Pacientes: API GET /api/pacientes (fallback: pacientes_lista_v1)
   - Consultas (backend):
       GET  /api/consultas            (opcional ?pacienteId=)
       POST /api/consultas
       PUT  /api/consultas/:id
       DELETE /api/consultas/:id
   - Fallback localStorage: consultas_v1
   - Mantém HTML/onclick
   =========================== */

(function () {
  const LS_CONSULTAS = "consultas_v1";
  const LS_PACIENTES = "pacientes_lista_v1";

  let pacientes = [];
  let consultas = [];
  let editingId = null;

  const pacienteSelect = document.getElementById("pacienteSelect");
  const dataEl = document.getElementById("data");
  const horaEl = document.getElementById("hora");
  const tipoEl = document.getElementById("tipoConsulta");
  const registrarBtn = document.querySelector("button[onclick='adicionarConsulta()']");

  /* ---------------------------
     Utils
  --------------------------- */
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

  function formatarDataBR(yyyy_mm_dd) {
    if (!yyyy_mm_dd) return "";
    const [y, m, d] = String(yyyy_mm_dd).split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
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
      localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
    } catch {}
  }

  function isErroConexao(msg) {
    const m = String(msg || "");
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network/i.test(m);
  }

  function sortConsultas(a, b) {
    const da = `${String(a?.data || "")}T${String(a?.hora || "00:00")}`;
    const db = `${String(b?.data || "")}T${String(b?.hora || "00:00")}`;
    return da.localeCompare(db);
  }

  function getPacienteNomeById(id) {
    const pid = String(id || "");
    const p = pacientes.find((x) => String(x?.id) === pid);
    return p?.nome || "Paciente";
  }

  function extrairListaFlex(resp) {
    if (Array.isArray(resp)) return resp;
    if (resp && typeof resp === "object") {
      if (Array.isArray(resp.items)) return resp.items;
      if (Array.isArray(resp.consultas)) return resp.consultas;
      if (Array.isArray(resp.pacientes)) return resp.pacientes;
      if (Array.isArray(resp.data)) return resp.data;
      if (Array.isArray(resp.lista)) return resp.lista;
    }
    return [];
  }

  /* ---------------------------
     Storage (fallback)
  --------------------------- */
  function carregarConsultasLS() {
    return lsGetArray(LS_CONSULTAS);
  }

  function salvarConsultasLS(lista) {
    lsSet(LS_CONSULTAS, lista);
  }

  function filtrarConsultasLS(pacienteId) {
    const all = carregarConsultasLS();
    if (!pacienteId) return all;
    return all.filter((c) => String(c?.pacienteId) === String(pacienteId));
  }

  /* ---------------------------
     API helpers (via window.apiFetch)
  --------------------------- */
  async function apiListConsultas(pacienteId) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const url = pacienteId
      ? `/api/consultas?pacienteId=${encodeURIComponent(pacienteId)}`
      : `/api/consultas`;

    const resp = await apiFetchFn(url, { method: "GET" });
    return extrairListaFlex(resp);
  }

  async function apiCreateConsulta(payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/consultas", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (resp && typeof resp === "object") return resp.item || resp.consulta || resp;
    return null;
  }

  async function apiUpdateConsulta(id, payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn(`/api/consultas/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    if (resp && typeof resp === "object") return resp.item || resp.consulta || resp;
    return payload;
  }

  async function apiDeleteConsulta(id) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    await apiFetchFn(`/api/consultas/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
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
      pacientes = extrairListaFlex(resp);

      try {
        localStorage.setItem(LS_PACIENTES, JSON.stringify(pacientes));
      } catch {}
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
     Cache merge (LS consistente)
     - se filtrado por paciente, substitui só daquele paciente
     - se sem filtro, substitui tudo
  --------------------------- */
  function mergeCacheConsultas(cacheAtual, novas, pacienteId) {
    const arrAtual = Array.isArray(cacheAtual) ? cacheAtual : [];
    const arrNovas = Array.isArray(novas) ? novas : [];

    if (!pacienteId) return arrNovas;

    const pid = String(pacienteId);
    const outras = arrAtual.filter((c) => String(c?.pacienteId) !== pid);
    return [...outras, ...arrNovas];
  }

  function substituirPorClientId(clientId, itemApi) {
    if (!clientId || !itemApi) return false;

    let idx = consultas.findIndex((x) => String(x?.clientId) === String(clientId));
    if (idx !== -1) {
      consultas[idx] = itemApi;
      return true;
    }

    const cache = carregarConsultasLS();
    idx = cache.findIndex((x) => String(x?.clientId) === String(clientId));
    if (idx !== -1) {
      cache[idx] = itemApi;
      salvarConsultasLS(cache);
      return true;
    }

    return false;
  }

  /* ---------------------------
     Sync API -> LocalStorage (cache)
  --------------------------- */
  async function syncConsultasFromAPI(pacienteId) {
    try {
      const items = await apiListConsultas(pacienteId);
      consultas = Array.isArray(items) ? items : [];
      consultas.sort(sortConsultas);

      const cacheAtual = carregarConsultasLS();
      salvarConsultasLS(mergeCacheConsultas(cacheAtual, consultas, pacienteId));

      return true;
    } catch (err) {
      console.warn("Consultas: falha ao carregar da API, usando localStorage:", err?.message || err);
      consultas = filtrarConsultasLS(pacienteId);
      consultas.sort(sortConsultas);
      return false;
    }
  }

  /* ---------------------------
     CRUD (API-first + fallback)
  --------------------------- */
  async function adicionarConsulta() {
    const pacienteId = String(pacienteSelect?.value || "").trim();
    const data = String(dataEl?.value || "").trim();
    const hora = String(horaEl?.value || "").trim();
    const tipo = String(tipoEl?.value || "").trim();

    if (!pacienteId || !data || !hora || !tipo) {
      alert("Preencha todos os campos.");
      return;
    }

    const clientId = uid();

    const payload = {
      id: editingId || clientId,
      clientId,
      pacienteId,
      pacienteNome: getPacienteNomeById(pacienteId),
      data,
      hora,
      tipo,
      dataBR: formatarDataBR(data),
      createdAtISO: new Date().toISOString()
    };

    if (editingId) {
      if (typeof window.apiFetch === "function") {
        try {
          const salvo = await apiUpdateConsulta(editingId, payload);
          const idx = consultas.findIndex((x) => String(x?.id) === String(editingId));

          if (idx !== -1) {
            consultas[idx] = { ...consultas[idx], ...salvo };
          }

          const cache = carregarConsultasLS();
          const idxCache = cache.findIndex((x) => String(x?.id) === String(editingId));
          if (idxCache !== -1) {
            cache[idxCache] = { ...cache[idxCache], ...(salvo || payload) };
            salvarConsultasLS(cache);
          }

          consultas.sort(sortConsultas);
          editingId = null;
          if (registrarBtn) registrarBtn.textContent = "Registrar Consulta";
          atualizarLista();
          limparCampos();
          return;
        } catch (err) {
          console.warn("Consultas: falha ao atualizar na API:", err?.message || err);

          if (!isErroConexao(err?.message || err)) {
            alert(err?.message || "Erro ao atualizar consulta.");
            return;
          }
        }
      }

      const cache = carregarConsultasLS();
      const idxCache = cache.findIndex((x) => String(x?.id) === String(editingId));
      if (idxCache !== -1) {
        cache[idxCache] = { ...cache[idxCache], ...payload, id: editingId };
        salvarConsultasLS(cache);
      }

      consultas = filtrarConsultasLS(String(pacienteSelect?.value || "").trim());
      consultas.sort(sortConsultas);

      editingId = null;
      if (registrarBtn) registrarBtn.textContent = "Registrar Consulta";
      atualizarLista();
      limparCampos();
      return;
    }

    if (typeof window.apiFetch === "function") {
      try {
        const salvo = await apiCreateConsulta(payload);
        if (salvo) {
          if (!salvo.clientId) salvo.clientId = clientId;

          const ok = substituirPorClientId(clientId, salvo);
          if (!ok) consultas.push(salvo);

          consultas.sort(sortConsultas);

          const cache = carregarConsultasLS();
          const merged = mergeCacheConsultas(
            cache,
            consultas.filter((c) => String(c?.pacienteId) === pacienteId),
            pacienteId
          );
          salvarConsultasLS(merged);

          atualizarLista();
          limparCampos();
          return;
        }
      } catch (err) {
        console.warn("Consultas: falha ao salvar na API:", err?.message || err);

        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao salvar consulta.");
          return;
        }
      }
    }

    const cache = carregarConsultasLS();
    cache.unshift(payload);
    salvarConsultasLS(cache);

    consultas = filtrarConsultasLS(pacienteId);
    consultas.sort(sortConsultas);

    atualizarLista();
    limparCampos();
  }

  async function removerConsulta(id) {
    const consultaId = String(id);

    const cache = carregarConsultasLS();
    const idxCache = cache.findIndex((x) => String(x?.id) === consultaId);
    if (idxCache === -1) return;

    if (!confirm("Remover esta consulta?")) return;

    if (typeof window.apiFetch === "function") {
      try {
        await apiDeleteConsulta(consultaId);
      } catch (err) {
        console.warn("Consultas: falha ao remover na API:", err?.message || err);

        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao remover consulta.");
          return;
        }
      }
    }

    cache.splice(idxCache, 1);
    salvarConsultasLS(cache);

    const pacienteId = String(pacienteSelect?.value || "").trim();
    consultas = filtrarConsultasLS(pacienteId);
    consultas.sort(sortConsultas);

    atualizarLista();
  }

  function atualizarLista() {
    const div = document.getElementById("listaConsultas");
    if (!div) return;

    div.classList.add("timeline");
    div.innerHTML = "<h2>Consultas Agendadas</h2>";

    const pacienteId = String(pacienteSelect?.value || "").trim();

    let lista = consultas;

    if (typeof window.apiFetch !== "function") {
      lista = filtrarConsultasLS(pacienteId);
    } else if (pacienteId) {
      lista = (consultas || []).filter((c) => String(c?.pacienteId) === pacienteId);
    }

    lista = Array.isArray(lista) ? [...lista].sort(sortConsultas) : [];

    if (!lista.length) {
      div.innerHTML += "<p>Nenhuma consulta agendada.</p>";
      return;
    }

    lista.forEach((c) => {
      const item = document.createElement("div");
      item.className = "item";

      const nome = c.pacienteNome || getPacienteNomeById(c.pacienteId) || "-";
      const dataBR = c.dataBR || formatarDataBR(c.data);

      item.innerHTML = `
        <p><strong>Paciente:</strong> ${escapeHtml(nome)}</p>
        <p><strong>Data:</strong> ${escapeHtml(dataBR)}</p>
        <p><strong>Hora:</strong> ${escapeHtml(c.hora || "")}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(c.tipo || "")}</p>
        <div class="list-actions">
          <button type="button" class="btn btn-sm btn-imprimir" onclick="imprimirConsulta('${String(c.id)}')">Imprimir</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="editarConsulta('${String(c.id)}')">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="removerConsulta('${String(c.id)}')">Remover</button>
        </div>
      `;

      div.appendChild(item);
    });
  }

  function limparCampos() {
    ["data", "hora"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const tipo = document.getElementById("tipoConsulta");
    if (tipo) tipo.value = "";

    if (pacienteSelect && !editingId) {
      pacienteSelect.value = "";
    }
  }

  /* ---------------------------
     Troca de paciente (filtro)
  --------------------------- */
  async function onPacienteChange() {
    const pacienteId = String(pacienteSelect?.value || "").trim();

    if (typeof window.apiFetch === "function") {
      await syncConsultasFromAPI(pacienteId);
      atualizarLista();
      return;
    }

    consultas = filtrarConsultasLS(pacienteId);
    consultas.sort(sortConsultas);
    atualizarLista();
  }

  function editarConsulta(id) {
    const c = consultas.find((x) => String(x?.id) === String(id));
    if (!c) return;

    editingId = String(c.id);

    if (pacienteSelect) pacienteSelect.value = String(c.pacienteId || "");
    if (dataEl) dataEl.value = String(c.data || "");
    if (horaEl) horaEl.value = String(c.hora || "");
    if (tipoEl) tipoEl.value = String(c.tipo || "");

    if (registrarBtn) registrarBtn.textContent = "Salvar Alterações";
  }

  function imprimirConsulta(id) {
    const c = consultas.find((x) => String(x?.id) === String(id));
    if (!c) return;

    const nome = c.pacienteNome || getPacienteNomeById(c.pacienteId) || "-";
    const dataBR = c.dataBR || formatarDataBR(c.data);

    const html = `
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Consulta</title>
      </head>
      <body>
        <h2>Consulta</h2>
        <p><strong>Paciente:</strong> ${escapeHtml(nome)}</p>
        <p><strong>Data:</strong> ${escapeHtml(dataBR)}</p>
        <p><strong>Hora:</strong> ${escapeHtml(c.hora || "-")}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(c.tipo || "-")}</p>
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

  /* ---------------------------
     Init
  --------------------------- */
  async function init() {
    consultas = carregarConsultasLS();

    await carregarPacientes();

    if (pacienteSelect) pacienteSelect.addEventListener("change", onPacienteChange);

    const pacienteId = String(pacienteSelect?.value || "").trim();
    if (typeof window.apiFetch === "function") {
      await syncConsultasFromAPI(pacienteId);
    } else {
      consultas = filtrarConsultasLS(pacienteId);
      consultas.sort(sortConsultas);
    }

    atualizarLista();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.adicionarConsulta = adicionarConsulta;
  window.removerConsulta = removerConsulta;
  window.editarConsulta = editarConsulta;
  window.imprimirConsulta = imprimirConsulta;
})();
