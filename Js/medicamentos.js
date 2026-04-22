/* ===========================
   Medicamentos Padrão (API-first + fallback)
   - GET  /api/medicamentos-padrao
   - PUT  /api/medicamentos-padrao   { lista: [...] }
   - Fallback: medicamentos_padrao_v1
=========================== */

(function () {
  const LS_MED_PADRAO = "medicamentos_padrao_v1";

  const nomeEl = document.getElementById("medPadraoNome");
  const classeEl = document.getElementById("medPadraoClasse");
  const obsEl = document.getElementById("medPadraoObs");
  const salvarBtn = document.getElementById("medPadraoSalvarBtn");
  const buscaEl = document.getElementById("medPadraoBusca");
  const tabelaWrap = document.getElementById("medPadraoTabelaWrap");
  const syncBtn = document.getElementById("medPadraoSyncBtn");

  let lista = [];
  let editingId = null;

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
      localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
    } catch {}
  }

  function normalizeNomeMed(s) {
    const t = String(s ?? "").trim();
    if (!t) return "";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function getClasses() {
    return [
      "Hipertensão",
      "Cardíacos",
      "Diabetes (DM)",
      "Diuréticos",
      "Antitérmicos / Analgésicos",
      "Anti-inflamatórios",
      "Antibióticos",
      "Outros",
    ];
  }

  function getBaseList() {
    return [
      // Hipertensão
      { nome: "Losartana", classe: "Hipertensão" },
      { nome: "Enalapril", classe: "Hipertensão" },
      { nome: "Captopril", classe: "Hipertensão" },
      { nome: "Amlodipino", classe: "Hipertensão" },
      { nome: "Nifedipino", classe: "Hipertensão" },
      { nome: "Valsartana", classe: "Hipertensão" },
      { nome: "Lisinopril", classe: "Hipertensão" },
      { nome: "Clortalidona", classe: "Hipertensão" },
      // Cardíacos
      { nome: "Atenolol", classe: "Cardíacos" },
      { nome: "Metoprolol", classe: "Cardíacos" },
      { nome: "Carvedilol", classe: "Cardíacos" },
      { nome: "Propranolol", classe: "Cardíacos" },
      { nome: "Digoxina", classe: "Cardíacos" },
      { nome: "Amiodarona", classe: "Cardíacos" },
      { nome: "Mononitrato de isossorbida", classe: "Cardíacos" },
      { nome: "Nitroglicerina", classe: "Cardíacos" },
      { nome: "Ácido acetilsalicílico", classe: "Cardíacos" },
      { nome: "Clopidogrel", classe: "Cardíacos" },
      // Diabetes (DM)
      { nome: "Metformina", classe: "Diabetes (DM)" },
      { nome: "Glibenclamida", classe: "Diabetes (DM)" },
      { nome: "Gliclazida", classe: "Diabetes (DM)" },
      { nome: "Glimepirida", classe: "Diabetes (DM)" },
      { nome: "Sitagliptina", classe: "Diabetes (DM)" },
      { nome: "Insulina NPH", classe: "Diabetes (DM)" },
      { nome: "Insulina Regular", classe: "Diabetes (DM)" },
      { nome: "Insulina Glargina", classe: "Diabetes (DM)" },
      // Diuréticos
      { nome: "Furosemida", classe: "Diuréticos" },
      { nome: "Hidroclorotiazida", classe: "Diuréticos" },
      { nome: "Espironolactona", classe: "Diuréticos" },
      { nome: "Indapamida", classe: "Diuréticos" },
      { nome: "Clortalidona", classe: "Diuréticos" },
      // Antitérmicos / Analgésicos
      { nome: "Dipirona", classe: "Antitérmicos / Analgésicos" },
      { nome: "Paracetamol", classe: "Antitérmicos / Analgésicos" },
      { nome: "Ibuprofeno", classe: "Antitérmicos / Analgésicos" },
      { nome: "Tramadol", classe: "Antitérmicos / Analgésicos" },
      { nome: "Cetorolaco", classe: "Antitérmicos / Analgésicos" },
      // Anti-inflamatórios
      { nome: "Diclofenaco", classe: "Anti-inflamatórios" },
      { nome: "Naproxeno", classe: "Anti-inflamatórios" },
      { nome: "Cetoprofeno", classe: "Anti-inflamatórios" },
      { nome: "Nimesulida", classe: "Anti-inflamatórios" },
      { nome: "Meloxicam", classe: "Anti-inflamatórios" },
      // Antibióticos
      { nome: "Amoxicilina", classe: "Antibióticos" },
      { nome: "Amoxicilina + clavulanato de potássio", classe: "Antibióticos" },
      { nome: "Azitromicina", classe: "Antibióticos" },
      { nome: "Cefalexina", classe: "Antibióticos" },
      { nome: "Ceftriaxona", classe: "Antibióticos" },
      { nome: "Ciprofloxacino", classe: "Antibióticos" },
      { nome: "Levofloxacino", classe: "Antibióticos" },
      { nome: "Doxiciclina", classe: "Antibióticos" },
      { nome: "Clindamicina", classe: "Antibióticos" },
      { nome: "Metronidazol", classe: "Antibióticos" },
      { nome: "Sulfametoxazol + Trimetoprim", classe: "Antibióticos" },
    ].map((x) => ({ ...x, id: uid() }));
  }

  function extrairListaFlex(resp) {
    if (Array.isArray(resp)) return resp;
    if (resp && typeof resp === "object") {
      if (Array.isArray(resp.items)) return resp.items;
      if (Array.isArray(resp.lista)) return resp.lista;
      if (Array.isArray(resp.data)) return resp.data;
      if (Array.isArray(resp.medicamentos)) return resp.medicamentos;
    }
    return [];
  }

  async function apiGetLista() {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");
    const resp = await apiFetchFn("/api/medicamentos-padrao", { method: "GET" });
    return extrairListaFlex(resp);
  }

  async function apiSaveLista(listaToSave) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");
    const resp = await apiFetchFn("/api/medicamentos-padrao", {
      method: "PUT",
      body: JSON.stringify({ lista: listaToSave }),
    });
    return extrairListaFlex(resp);
  }

  function seedIfEmpty() {
    const local = lsGetArray(LS_MED_PADRAO);
    if (local.length) {
      lista = local;
      return;
    }
    lista = getBaseList();
    lsSet(LS_MED_PADRAO, lista);
  }

  function renderClasses() {
    if (!classeEl) return;
    classeEl.innerHTML = "";
    getClasses().forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      classeEl.appendChild(opt);
    });
  }

  function limparCampos() {
    if (nomeEl) nomeEl.value = "";
    if (obsEl) obsEl.value = "";
    if (classeEl) classeEl.selectedIndex = 0;
    editingId = null;
    if (salvarBtn) salvarBtn.textContent = "Adicionar";
  }

  function validar(nome, classe) {
    if (!nome || !classe) {
      alert("Informe o medicamento e a classe.");
      return false;
    }
    return true;
  }

  function salvarLocal() {
    lsSet(LS_MED_PADRAO, lista);
  }

  async function syncToAPI() {
    if (typeof window.apiFetch !== "function") return;
    try {
      const respLista = await apiSaveLista(lista);
      if (Array.isArray(respLista) && respLista.length) {
        lista = respLista;
        salvarLocal();
      }
    } catch (err) {
      console.warn("Medicamentos padrão: erro ao salvar na API:", err?.message || err);
    }
  }

  async function syncFromAPI() {
    if (typeof window.apiFetch !== "function") return false;
    try {
      const respLista = await apiGetLista();
      if (Array.isArray(respLista) && respLista.length) {
        lista = respLista;
        salvarLocal();
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Medicamentos padrão: falha ao buscar na API:", err?.message || err);
      return false;
    }
  }

  function renderLista() {
    if (!tabelaWrap) return;
    const termo = String(buscaEl?.value || "").trim().toLowerCase();
    const filtrada = lista.filter((m) => {
      const n = String(m.nome || "").toLowerCase();
      const c = String(m.classe || "").toLowerCase();
      return !termo || n.includes(termo) || c.includes(termo);
    });

    if (!filtrada.length) {
      tabelaWrap.innerHTML = "<p>Nenhum medicamento encontrado.</p>";
      return;
    }

    const rows = filtrada
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
      .map((m) => `
        <tr>
          <td>${escapeHtml(m.nome)}</td>
          <td><span class="tag">${escapeHtml(m.classe || "Outros")}</span></td>
          <td>${escapeHtml(m.obs || "-")}</td>
          <td>
            <button class="btn btn-edit" onclick="editarMedPadrao('${String(m.id)}')">Editar</button>
            <button class="btn btn-danger" onclick="removerMedPadrao('${String(m.id)}')">Remover</button>
          </td>
        </tr>
      `)
      .join("");

    tabelaWrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Classe</th>
            <th>Observações</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function editarMedPadrao(id) {
    const item = lista.find((x) => String(x.id) === String(id));
    if (!item) return;
    editingId = String(item.id);
    if (nomeEl) nomeEl.value = item.nome || "";
    if (obsEl) obsEl.value = item.obs || "";
    if (classeEl) classeEl.value = item.classe || "Outros";
    if (salvarBtn) salvarBtn.textContent = "Salvar Alterações";
  }

  function removerMedPadrao(id) {
    if (!confirm("Remover este medicamento padrão?")) return;
    lista = lista.filter((x) => String(x.id) !== String(id));
    salvarLocal();
    renderLista();
    syncToAPI();
  }

  async function salvarMedPadrao() {
    const nome = normalizeNomeMed(nomeEl?.value || "");
    const classe = String(classeEl?.value || "").trim();
    const obs = String(obsEl?.value || "").trim();

    if (!validar(nome, classe)) return;

    if (editingId) {
      const idx = lista.findIndex((x) => String(x.id) === String(editingId));
      if (idx !== -1) {
        lista[idx] = { ...lista[idx], nome, classe, obs, updatedAt: nowISO() };
      }
      salvarLocal();
      renderLista();
      syncToAPI();
      limparCampos();
      return;
    }

    lista.push({
      id: uid(),
      nome,
      classe,
      obs,
      createdAt: nowISO(),
    });

    salvarLocal();
    renderLista();
    syncToAPI();
    limparCampos();
  }

  async function onSyncClick() {
    const ok = await syncFromAPI();
    if (ok) {
      renderLista();
      return;
    }
    alert("Não foi possível sincronizar da API. Usando a lista local.");
  }

  function init() {
    renderClasses();
    seedIfEmpty();
    renderLista();

    if (salvarBtn) salvarBtn.addEventListener("click", salvarMedPadrao);
    if (buscaEl) buscaEl.addEventListener("input", renderLista);
    if (syncBtn) syncBtn.addEventListener("click", onSyncClick);

    if (typeof window.apiFetch === "function") {
      syncFromAPI().then(() => renderLista());
    }
  }

  window.editarMedPadrao = editarMedPadrao;
  window.removerMedPadrao = removerMedPadrao;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
