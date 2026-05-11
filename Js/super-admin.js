(function () {
  const CLINICAS_LS_KEY = "superadmin_clinicas";
  const MOD_NAMES = [
    "dashboard",
    "pacientes",
    "triagem",
    "prontuario",
    "prescricoes",
    "leitos",
    "consultas",
    "farmacia",
    "faturamento",
    "funcionarios",
    "relatorios",
  ];
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  const LOGO_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
  const ADMINS_CACHE_KEY = "superadmin_admins_cache";
  let clinicaLogoBase64 = "";
  let editingClinicaId = "";
  let editingLogoAtual = "";
  let clinicasCache = [];
  let adminsCacheByClinica = {};

  function getRole() {
    return String(localStorage.getItem("auth_role") || "").trim().toLowerCase();
  }

  function getClinicasLS() {
    try {
      const raw = localStorage.getItem(CLINICAS_LS_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function setClinicasLS(items) {
    localStorage.setItem(CLINICAS_LS_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  }

  function getAdminsCacheLS() {
    try {
      const raw = localStorage.getItem(ADMINS_CACHE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function setAdminsCacheLS(data) {
    localStorage.setItem(ADMINS_CACHE_KEY, JSON.stringify(data && typeof data === "object" ? data : {}));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function defaultModules() {
    return {
      dashboard: true,
      pacientes: true,
      triagem: true,
      prontuario: true,
      prescricoes: true,
      leitos: true,
      consultas: true,
      farmacia: true,
      faturamento: true,
      funcionarios: true,
      relatorios: true,
    };
  }

  function resetLogoUploadUi() {
    const statusEl = document.getElementById("logoFileStatus");
    const previewWrap = document.getElementById("logoPreviewWrap");
    const previewImg = document.getElementById("logoPreviewImg");
    const fileInput = document.getElementById("clinicaLogoFile");

    clinicaLogoBase64 = "";

    if (fileInput) fileInput.value = "";
    if (statusEl) {
      statusEl.textContent = "Nenhum arquivo selecionado.";
      statusEl.classList.remove("ok", "error");
    }
    if (previewWrap) previewWrap.hidden = true;
    if (previewImg) previewImg.removeAttribute("src");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("Falha ao ler o arquivo de logo."));
      };
      reader.readAsDataURL(file);
    });
  }

  function bindLogoUpload() {
    const triggerBtn = document.getElementById("btnLogoUpload");
    const fileInput = document.getElementById("clinicaLogoFile");
    const statusEl = document.getElementById("logoFileStatus");
    const previewWrap = document.getElementById("logoPreviewWrap");
    const previewImg = document.getElementById("logoPreviewImg");
    if (!triggerBtn || !fileInput || !statusEl || !previewWrap || !previewImg) return;

    triggerBtn.addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", async function () {
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (!file) {
        resetLogoUploadUi();
        return;
      }

      if (!LOGO_ALLOWED_TYPES.has(String(file.type || "").toLowerCase())) {
        resetLogoUploadUi();
        statusEl.textContent = "Arquivo inválido. Use PNG, JPG, JPEG ou WEBP.";
        statusEl.classList.add("error");
        return;
      }

      if (Number(file.size || 0) > LOGO_MAX_BYTES) {
        resetLogoUploadUi();
        statusEl.textContent = "Arquivo muito grande. Limite de 2MB.";
        statusEl.classList.add("error");
        return;
      }

      try {
        const base64 = await fileToDataUrl(file);
        clinicaLogoBase64 = base64;
        statusEl.textContent = "✓ " + file.name + " carregada";
        statusEl.classList.remove("error");
        statusEl.classList.add("ok");
        previewImg.src = base64;
        previewWrap.hidden = false;
      } catch (err) {
        resetLogoUploadUi();
        statusEl.textContent = String(err?.message || "Falha ao processar a logo.");
        statusEl.classList.add("error");
      }
    });
  }

  async function apiGetClinicas() {
    const data = await window.apiFetch("/api/clinicas");
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function apiGetAdminsClinica(clinicaId) {
    const data = await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinicaId)}/admins`);
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function apiUpdateAdmin(clinicaId, adminId, payload) {
    const data = await window.apiFetch(
      `/api/clinicas/${encodeURIComponent(clinicaId)}/admins/${encodeURIComponent(adminId)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );
    return data?.item || null;
  }

  async function apiDeleteAdmin(clinicaId, adminId) {
    return window.apiFetch(
      `/api/clinicas/${encodeURIComponent(clinicaId)}/admins/${encodeURIComponent(adminId)}`,
      { method: "DELETE" }
    );
  }

  function moduleChecksHtml(clinica) {
    const mods = { ...defaultModules(), ...(clinica?.modulos || {}) };
    return MOD_NAMES.map((k) => {
      const checked = mods[k] ? "checked" : "";
      return `<label><input type="checkbox" data-mod="${k}" ${checked}> ${k}</label>`;
    }).join("");
  }

  async function salvarModulos(clinicaId, card) {
    const checks = card.querySelectorAll("input[data-mod]");
    const modulos = defaultModules();
    checks.forEach((c) => {
      modulos[c.getAttribute("data-mod")] = !!c.checked;
    });

    try {
      await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinicaId)}/modulos`, {
        method: "PUT",
        body: JSON.stringify({ modulos }),
      });
    } catch {
      const items = getClinicasLS();
      const idx = items.findIndex((x) => String(x?.clinica_id) === String(clinicaId));
      if (idx >= 0) {
        items[idx].modulos = modulos;
        setClinicasLS(items);
      }
    }

    localStorage.setItem("clinica_modules_" + clinicaId, JSON.stringify(modulos));
    alert("Módulos atualizados.");
  }

  function preencherFormularioEdicao(clinica) {
    document.getElementById("clinicaNome").value = String(clinica?.nome || "");
    document.getElementById("clinicaId").value = String(clinica?.clinica_id || "");
    document.getElementById("clinicaCnpj").value = String(clinica?.cnpj || "");
    document.getElementById("clinicaTelefone").value = String(clinica?.telefone || "");
    document.getElementById("clinicaEndereco").value = String(clinica?.endereco || "");
    document.getElementById("clinicaEmail").value = String(clinica?.email || "");
    document.getElementById("clinicaResponsavel").value = String(clinica?.responsavel || "");
    document.getElementById("clinicaStatus").value = String(clinica?.status || "ativo");

    const clinicaIdInput = document.getElementById("clinicaId");
    const submitBtn = document.querySelector("#formClinica button[type='submit']");
    const cancelBtn = document.getElementById("btnCancelarEdicao");
    const statusEl = document.getElementById("logoFileStatus");
    const previewWrap = document.getElementById("logoPreviewWrap");
    const previewImg = document.getElementById("logoPreviewImg");

    editingClinicaId = String(clinica?.clinica_id || "");
    editingLogoAtual = String(clinica?.logo || "");
    clinicaLogoBase64 = "";

    if (clinicaIdInput) clinicaIdInput.readOnly = true;
    if (submitBtn) submitBtn.textContent = "Salvar Alterações";
    if (cancelBtn) cancelBtn.hidden = false;

    if (editingLogoAtual && previewWrap && previewImg && statusEl) {
      previewImg.src = editingLogoAtual;
      previewWrap.hidden = false;
      statusEl.textContent = "Logo atual carregada.";
      statusEl.classList.remove("error");
      statusEl.classList.add("ok");
    } else {
      resetLogoUploadUi();
    }
  }

  function sairModoEdicao() {
    editingClinicaId = "";
    editingLogoAtual = "";
    clinicaLogoBase64 = "";

    const form = document.getElementById("formClinica");
    const clinicaIdInput = document.getElementById("clinicaId");
    const submitBtn = document.querySelector("#formClinica button[type='submit']");
    const cancelBtn = document.getElementById("btnCancelarEdicao");

    if (form) form.reset();
    if (clinicaIdInput) clinicaIdInput.readOnly = false;
    if (submitBtn) submitBtn.textContent = "Cadastrar Clínica";
    if (cancelBtn) cancelBtn.hidden = true;

    resetLogoUploadUi();
  }

  async function removerClinica(clinicaId) {
    const confirmado = window.confirm("Tem certeza que deseja remover esta clínica? Essa ação não pode ser desfeita.");
    if (!confirmado) return;

    try {
      await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinicaId)}`, {
        method: "DELETE",
      });
    } catch {
      const items = getClinicasLS().filter((x) => String(x?.clinica_id) !== String(clinicaId));
      setClinicasLS(items);
    }

    if (editingClinicaId === String(clinicaId)) {
      sairModoEdicao();
    }
    await carregarClinicas();
  }

  function montarCardClinica(clinica) {
    const card = document.createElement("div");
    card.className = "clinica-item";
    card.innerHTML = `
      <strong>${clinica.nome || "-"}</strong> (${clinica.clinica_id || "-"})<br>
      CNPJ: ${clinica.cnpj || "-"} | Status: ${clinica.status || "-"}<br>
      Email: ${clinica.email || "-"} | Telefone: ${clinica.telefone || "-"}
      <div class="modulos-grid">${moduleChecksHtml(clinica)}</div>
      <div class="clinica-actions">
        <button class="btn btn-primary" data-save-mods="1">Salvar módulos</button>
        <button class="btn btn-primary" data-edit-clinica="1">Editar</button>
        <button class="btn btn-danger" data-remove-clinica="1">Remover</button>
      </div>
    `;

    const btn = card.querySelector("button[data-save-mods]");
    if (btn) {
      btn.addEventListener("click", () => salvarModulos(clinica.clinica_id, card));
    }
    const btnEdit = card.querySelector("button[data-edit-clinica]");
    if (btnEdit) {
      btnEdit.addEventListener("click", () => preencherFormularioEdicao(clinica));
    }
    const btnRemove = card.querySelector("button[data-remove-clinica]");
    if (btnRemove) {
      btnRemove.addEventListener("click", () => removerClinica(clinica.clinica_id));
    }

    return card;
  }

  function renderClinicas(items) {
    const root = document.getElementById("listaClinicas");
    if (!root) return;
    root.innerHTML = "";

    if (!items.length) {
      root.innerHTML = "<p>Nenhuma clínica cadastrada.</p>";
      return;
    }

    items.forEach((c) => root.appendChild(montarCardClinica(c)));
  }

  function montarLinhaAdmin(admin, clinica_id) {
    const item = document.createElement("div");
    item.className = "admin-item";
    item.innerHTML = `
      <p>
        <strong>Nome:</strong> ${escapeHtml(admin?.nome || "-")} |
        <strong>Email:</strong> ${escapeHtml(admin?.email || "-")} |
        <strong>Role:</strong> ${escapeHtml(admin?.role || "admin")} |
        <strong>Clínica:</strong> ${escapeHtml(clinica_id)} |
        <strong>Status:</strong> ${escapeHtml(admin?.status || "-")}
      </p>
      <div class="admin-actions">
        <button type="button" class="btn btn-primary" data-admin-edit="1">Editar</button>
        <button type="button" class="btn btn-danger" data-admin-remove="1">Remover</button>
      </div>
    `;

    const btnEdit = item.querySelector("button[data-admin-edit]");
    if (btnEdit) {
      btnEdit.addEventListener("click", async function () {
        const novoNome = window.prompt("Nome do administrador:", String(admin?.nome || ""));
        if (novoNome === null) return;
        const novoEmail = window.prompt("Email do administrador:", String(admin?.email || ""));
        if (novoEmail === null) return;
        const novoStatus = window.prompt("Status (ativo/inativo):", String(admin?.status || "ativo"));
        if (novoStatus === null) return;
        const novaSenha = window.prompt("Nova senha (deixe em branco para manter a atual):", "");
        if (novaSenha === null) return;

        const payload = {
          nome: String(novoNome || "").trim(),
          email: String(novoEmail || "").trim(),
          status: String(novoStatus || "").trim() || "ativo",
        };
        if (String(novaSenha || "").trim()) {
          payload.senha = String(novaSenha);
        }

        if (!payload.nome || !payload.email) {
          alert("Nome e email são obrigatórios.");
          return;
        }

        try {
          await apiUpdateAdmin(clinica_id, String(admin?.id || ""), payload);
          await carregarAdmins();
        } catch (err) {
          alert("Falha ao editar administrador: " + String(err?.message || err));
        }
      });
    }

    const btnRemove = item.querySelector("button[data-admin-remove]");
    if (btnRemove) {
      btnRemove.addEventListener("click", async function () {
        const ok = window.confirm("Tem certeza que deseja remover este administrador?");
        if (!ok) return;

        try {
          await apiDeleteAdmin(clinica_id, String(admin?.id || ""));
          await carregarAdmins();
        } catch (err) {
          alert("Falha ao remover administrador: " + String(err?.message || err));
        }
      });
    }

    return item;
  }

  function atualizarFiltroClinicaAdmins() {
    const select = document.getElementById("filtroClinicaAdmins");
    if (!select) return;
    const atual = select.value;
    select.innerHTML = '<option value="">Todas as clínicas</option>';
    clinicasCache.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = String(c?.clinica_id || "");
      opt.textContent = String(c?.nome || c?.clinica_id || "");
      select.appendChild(opt);
    });
    if (atual && Array.from(select.options).some((o) => o.value === atual)) {
      select.value = atual;
    }
  }

  function renderAdmins() {
    const root = document.getElementById("listaAdminsClinica");
    const filtro = document.getElementById("filtroClinicaAdmins");
    if (!root) return;
    root.innerHTML = "";

    const clinicaSelecionada = filtro ? String(filtro.value || "") : "";
    const clinicasExibir = clinicaSelecionada
      ? clinicasCache.filter((c) => String(c?.clinica_id) === clinicaSelecionada)
      : clinicasCache;

    if (!clinicasExibir.length) {
      root.innerHTML = "<p>Nenhum administrador encontrado.</p>";
      return;
    }

    clinicasExibir.forEach((clinica) => {
      const clinica_id = String(clinica?.clinica_id || "");
      const group = document.createElement("div");
      group.className = "admin-clinica-group";
      group.innerHTML = `<h3>${escapeHtml(clinica?.nome || "-")} (${escapeHtml(clinica_id)})</h3>`;

      const admins = Array.isArray(adminsCacheByClinica[clinica_id]) ? adminsCacheByClinica[clinica_id] : [];
      if (!admins.length) {
        const p = document.createElement("p");
        p.textContent = "Nenhum admin cadastrado para esta clínica.";
        group.appendChild(p);
      } else {
        admins.forEach((a) => group.appendChild(montarLinhaAdmin(a, clinica_id)));
      }

      root.appendChild(group);
    });
  }

  async function carregarAdmins() {
    const cache = getAdminsCacheLS();
    const novo = {};
    for (const clinica of clinicasCache) {
      const clinica_id = String(clinica?.clinica_id || "");
      if (!clinica_id) continue;
      try {
        novo[clinica_id] = await apiGetAdminsClinica(clinica_id);
      } catch {
        novo[clinica_id] = Array.isArray(cache[clinica_id]) ? cache[clinica_id] : [];
      }
    }
    adminsCacheByClinica = novo;
    setAdminsCacheLS(adminsCacheByClinica);
    renderAdmins();
  }

  async function carregarClinicas() {
    try {
      const items = await apiGetClinicas();
      clinicasCache = Array.isArray(items) ? items : [];
      setClinicasLS(items);
      renderClinicas(items);
      atualizarFiltroClinicaAdmins();
      await carregarAdmins();
    } catch {
      const localItems = getClinicasLS();
      clinicasCache = Array.isArray(localItems) ? localItems : [];
      renderClinicas(localItems);
      atualizarFiltroClinicaAdmins();
      adminsCacheByClinica = getAdminsCacheLS();
      renderAdmins();
    }
  }

  function bindCadastroClinica() {
    const form = document.getElementById("formClinica");
    const cancelBtn = document.getElementById("btnCancelarEdicao");
    if (!form) return;
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        sairModoEdicao();
      });
    }

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();

      const payload = {
        nome: document.getElementById("clinicaNome")?.value?.trim() || "",
        clinica_id: document.getElementById("clinicaId")?.value?.trim() || "",
        cnpj: document.getElementById("clinicaCnpj")?.value?.trim() || "",
        endereco: document.getElementById("clinicaEndereco")?.value?.trim() || "",
        telefone: document.getElementById("clinicaTelefone")?.value?.trim() || "",
        email: document.getElementById("clinicaEmail")?.value?.trim() || "",
        logo: clinicaLogoBase64 || "",
        responsavel: document.getElementById("clinicaResponsavel")?.value?.trim() || "",
        status: document.getElementById("clinicaStatus")?.value || "ativo",
      };

      if (!payload.nome || !payload.clinica_id) {
        alert("Informe nome e clinica_id.");
        return;
      }

      if (editingClinicaId) {
        payload.logo = clinicaLogoBase64 || editingLogoAtual || "";
        try {
          await window.apiFetch(`/api/clinicas/${encodeURIComponent(editingClinicaId)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } catch {
          const items = getClinicasLS();
          const idx = items.findIndex((x) => String(x?.clinica_id) === String(editingClinicaId));
          if (idx >= 0) {
            items[idx] = {
              ...items[idx],
              nome: payload.nome,
              cnpj: payload.cnpj,
              endereco: payload.endereco,
              telefone: payload.telefone,
              email: payload.email,
              responsavel: payload.responsavel,
              status: payload.status,
              logo: payload.logo,
              personalizacao: {
                ...(items[idx].personalizacao || {}),
                nomeClinica: payload.nome,
                cnpj: payload.cnpj,
                endereco: payload.endereco,
                telefone: payload.telefone,
                logo: payload.logo,
              },
              updatedAt: new Date().toISOString(),
            };
            setClinicasLS(items);
          }
        }
      } else {
        try {
          await window.apiFetch("/api/clinicas", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        } catch (err) {
          const items = getClinicasLS();
          if (items.some((x) => String(x?.clinica_id) === String(payload.clinica_id))) {
            alert("clinica_id já cadastrado.");
            return;
          }

          items.unshift({
            ...payload,
            modulos: defaultModules(),
            personalizacao: {
              nomeClinica: payload.nome,
              cnpj: payload.cnpj,
              endereco: payload.endereco,
              telefone: payload.telefone,
              logo: payload.logo,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setClinicasLS(items);
        }
      }

      sairModoEdicao();
      await carregarClinicas();
    });
  }

  function bindCriarAdminClinica() {
    const form = document.getElementById("formAdminClinica");
    if (!form) return;

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();

      const clinica_id = document.getElementById("adminClinicaId")?.value?.trim() || "";
      const nome = document.getElementById("adminNome")?.value?.trim() || "";
      const email = document.getElementById("adminEmail")?.value?.trim() || "";
      const senha = document.getElementById("adminSenha")?.value || "";

      if (!clinica_id || !nome || !email || !senha) {
        alert("Preencha clinica_id, nome, email e senha.");
        return;
      }

      try {
        await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinica_id)}/admin`, {
          method: "POST",
          body: JSON.stringify({ nome, email, senha, role: "admin" }),
        });
        alert("Administrador criado com sucesso.");
        form.reset();
        await carregarAdmins();
      } catch (err) {
        alert("Falha ao criar administrador: " + String(err?.message || err));
      }
    });
  }

  function bindFiltroAdmins() {
    const select = document.getElementById("filtroClinicaAdmins");
    if (!select) return;
    select.addEventListener("change", function () {
      renderAdmins();
    });
  }

  async function validarAcesso() {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      window.location.href = "./login.html";
      return false;
    }

    if (getRole() === "superadmin") return true;

    try {
      const data = await window.apiFetch("/api/superadmin");
      const role = String(data?.user?.role || "").trim().toLowerCase();
      if (role !== "superadmin") {
        alert("Acesso restrito ao Super Admin.");
        window.location.href = "./dashboard.html";
        return false;
      }

      localStorage.setItem("auth_role", role);
      return true;
    } catch {
      alert("Acesso restrito ao Super Admin.");
      window.location.href = "./dashboard.html";
      return false;
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const ok = await validarAcesso();
    if (!ok) return;

    bindCadastroClinica();
    bindLogoUpload();
    resetLogoUploadUi();
    bindCriarAdminClinica();
    bindFiltroAdmins();
    await carregarClinicas();
  });
})();
