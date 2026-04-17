/* ===========================
   cadastro-funcionario.js - Mini SGH (API-FIRST + fallback)
   - Admin-only (UI: menu-guard | acesso real: auth-guard)
   - API: POST /api/funcionarios  (admin only)
   - Fallback: localStorage["funcionarios"]
   - Mantém HTML/IDs/submit como está
   =========================== */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formFuncionario");
  if (!form) return;

  const KEY_FUNCIONARIOS = "funcionarios";
  const params = new URLSearchParams(window.location.search);
  const editingId = params.get("id");
  let editSnapshot = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizarEmail(v) {
    return String(v || "").trim().toLowerCase();
  }

  function isAdmin() {
    return (localStorage.getItem("auth_role") || "") === "admin";
  }

  function getFuncionariosLS() {
    try {
      const raw = localStorage.getItem(KEY_FUNCIONARIOS);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function setFuncionariosLS(lista) {
    localStorage.setItem(KEY_FUNCIONARIOS, JSON.stringify(lista));
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve("");

      const MAX_BYTES = 350 * 1024;
      if (file.size > MAX_BYTES) {
        return reject(
          new Error("Imagem muito grande. Use uma assinatura menor (recorte e salve em JPG/WEBP).")
        );
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Falha ao ler imagem"));
      reader.readAsDataURL(file);
    });
  }

  function preencherFormulario(f) {
    if (!f) return;

    const nomeEl = document.getElementById("nome");
    const emailEl = document.getElementById("email");
    const senhaEl = document.getElementById("senha");
    const orgaoEl = document.getElementById("orgao");
    const registroEl = document.getElementById("registro");

    if (nomeEl) nomeEl.value = f.nome || "";
    if (emailEl) emailEl.value = f.email || "";
    if (senhaEl) senhaEl.value = "";
    if (orgaoEl) orgaoEl.value = f.orgao || "COREN";
    if (registroEl) registroEl.value = f.registro || "";

    const btn = form.querySelector("button[type='submit']");
    if (btn) btn.textContent = "Salvar Alterações";
  }

  async function apiCreateFuncionario(payload) {
    const resp = await apiFetch("/api/funcionarios", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return resp?.item || resp?.funcionario || null;
  }

  async function apiUpdateFuncionario(id, payload) {
    const resp = await apiFetch(`/api/funcionarios/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return resp?.item || resp?.funcionario || payload;
  }

  async function apiListFuncionarios() {
    const resp = await apiFetch("/api/funcionarios");
    return Array.isArray(resp?.items)
      ? resp.items
      : Array.isArray(resp?.funcionarios)
      ? resp.funcionarios
      : Array.isArray(resp?.lista)
      ? resp.lista
      : [];
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isAdmin()) {
      alert("Acesso restrito: apenas administradores podem cadastrar funcionários.");
      return;
    }

    const nome = document.getElementById("nome")?.value.trim() || "";
    const email = normalizarEmail(document.getElementById("email")?.value);
    const senha = document.getElementById("senha")?.value || "";
    const orgao = document.getElementById("orgao")?.value || "";
    const registro = document.getElementById("registro")?.value.trim() || "";
    const arquivoAssinatura = document.getElementById("assinatura")?.files?.[0] || null;

    if (!nome || !email || (!editingId && !senha)) {
      alert("Preencha nome, e-mail" + (editingId ? "." : " e senha."));
      return;
    }

    if (!registro) {
      alert("Informe o número do registro.");
      return;
    }

    let assinaturaDataUrl = "";
    try {
      assinaturaDataUrl = await fileToDataURL(arquivoAssinatura);
    } catch (err) {
      alert(err?.message || "Não foi possível ler a imagem da assinatura.");
      return;
    }

    if (editingId && !arquivoAssinatura && editSnapshot?.assinaturaDataUrl) {
      assinaturaDataUrl = editSnapshot.assinaturaDataUrl;
    }

    const payload = {
      id: editingId || uid(),
      nome,
      email,
      senha: senha || editSnapshot?.senha || "",
      role: editSnapshot?.role || "funcionario",
      orgao,
      registro,
      assinaturaDataUrl,
      criadoEm: editSnapshot?.criadoEm || new Date().toISOString(),
    };

    const listaLSAntes = getFuncionariosLS();
    const jaExisteLS = listaLSAntes.some(
      (f) => normalizarEmail(f.email) === email && String(f.id) !== String(editingId || "")
    );

    if (jaExisteLS) {
      alert("Já existe um funcionário com esse e-mail.");
      return;
    }

    try {
      const salvo = editingId
        ? await apiUpdateFuncionario(editingId, payload)
        : await apiCreateFuncionario(payload);

      if (salvo) {
        const listaLS = getFuncionariosLS();
        const idx = listaLS.findIndex((f) => String(f.id) === String(salvo.id));
        if (idx >= 0) listaLS[idx] = salvo;
        else listaLS.unshift(salvo);
        setFuncionariosLS(listaLS);

        alert(editingId ? "Funcionário atualizado com sucesso!" : "Funcionário cadastrado com sucesso!");
        window.location.href = "./funcionarios-lista.html";
        return;
      }
    } catch (err) {
      const msg = String(err?.message || err);

      if (msg.includes("401") || msg.toLowerCase().includes("token")) {
        alert("Sessão expirada. Faça login novamente.");
        return;
      }

      if (msg.includes("403") || msg.toLowerCase().includes("admin")) {
        alert("Apenas administradores podem cadastrar funcionários.");
        return;
      }

      console.warn("Funcionários: falha ao salvar na API, usando fallback:", msg);
    }

    const lista = getFuncionariosLS();
    const idx = lista.findIndex((f) => String(f.id) === String(payload.id));
    if (idx >= 0) lista[idx] = payload;
    else lista.unshift(payload);

    try {
      setFuncionariosLS(lista);
    } catch (err) {
      alert(
        "Não foi possível salvar. Provavelmente a imagem ficou grande e excedeu o limite do navegador."
      );
      return;
    }

    alert(editingId ? "Funcionário atualizado (fallback local) com sucesso!" : "Funcionário cadastrado (fallback local) com sucesso!");
    window.location.href = "./funcionarios-lista.html";
  });

  (async function carregarEdicao() {
    if (!editingId) return;

    try {
      let lista = [];
      if (typeof window.apiFetch === "function") {
        try {
          lista = await apiListFuncionarios();
        } catch {
          lista = getFuncionariosLS();
        }
      } else {
        lista = getFuncionariosLS();
      }

      editSnapshot = lista.find((f) => String(f?.id) === String(editingId)) || null;
      if (editSnapshot) preencherFormulario(editSnapshot);
    } catch {
      // ignora
    }
  })();
});