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
  let clinicaLogoBase64 = "";

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
      </div>
    `;

    const btn = card.querySelector("button[data-save-mods]");
    if (btn) {
      btn.addEventListener("click", () => salvarModulos(clinica.clinica_id, card));
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

  async function carregarClinicas() {
    try {
      const items = await apiGetClinicas();
      setClinicasLS(items);
      renderClinicas(items);
    } catch {
      renderClinicas(getClinicasLS());
    }
  }

  function bindCadastroClinica() {
    const form = document.getElementById("formClinica");
    if (!form) return;

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

      form.reset();
      resetLogoUploadUi();
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
      } catch (err) {
        alert("Falha ao criar administrador: " + String(err?.message || err));
      }
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
    await carregarClinicas();
  });
})();
