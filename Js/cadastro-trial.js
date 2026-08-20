(function () {
  function getRole() {
    return String(localStorage.getItem("auth_role") || "").trim().toLowerCase();
  }

  function slugify(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function gerarSenha() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 8; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function diasParaISO(dias) {
    const d = new Date();
    d.setDate(d.getDate() + Number(dias || 14));
    return d.toISOString();
  }

  function diasRestantes(isoStr) {
    if (!isoStr) return null;
    const alvo = new Date(isoStr).getTime();
    if (Number.isNaN(alvo)) return null;
    const diffMs = alvo - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function formatarDataBr(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR");
  }

  let idEditadoManualmente = false;

  function bindAutoId() {
    const nomeInput = document.getElementById("trialNome");
    const idInput = document.getElementById("trialId");
    if (!nomeInput || !idInput) return;

    nomeInput.addEventListener("input", function () {
      if (idEditadoManualmente) return;
      idInput.value = slugify(nomeInput.value);
    });

    idInput.addEventListener("input", function () {
      idEditadoManualmente = true;
    });
  }

  function bindSenhaAuto() {
    const senhaInput = document.getElementById("trialSenha");
    if (!senhaInput) return;
    senhaInput.value = gerarSenha();
  }

  async function apiGetClinicas() {
    const data = await window.apiFetch("/api/clinicas");
    return Array.isArray(data?.items) ? data.items : [];
  }

  function badgeHtml(clinica) {
    const dias = diasRestantes(clinica.trial_expires_at);
    if (dias === null) return "";
    if (dias < 0) return `<span class="trial-badge expired">Expirado</span>`;
    if (dias <= 2) return `<span class="trial-badge warn">${dias} dia(s) restante(s)</span>`;
    return `<span class="trial-badge ok">${dias} dia(s) restante(s)</span>`;
  }

  function montarCardTrial(clinica) {
    const card = document.createElement("div");
    card.className = "clinica-item";
    card.innerHTML = `
      <strong>${clinica.nome || "-"}</strong> (${clinica.clinica_id || "-"}) ${badgeHtml(clinica)}<br>
      Responsável: ${clinica.responsavel || "-"} | Telefone: ${clinica.telefone || "-"}<br>
      Email: ${clinica.email || "-"} | Expira em: ${formatarDataBr(clinica.trial_expires_at)}
      <div class="clinica-actions">
        <button class="btn btn-primary" data-converter="1">Converter para Cliente</button>
        <button class="btn btn-danger" data-encerrar="1">Encerrar Trial</button>
      </div>
    `;

    const btnConverter = card.querySelector("button[data-converter]");
    if (btnConverter) {
      btnConverter.addEventListener("click", async function () {
        try {
          await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinica.clinica_id)}`, {
            method: "PUT",
            body: JSON.stringify({ status: "ativo", trial_expires_at: null }),
          });
          alert("Trial convertido para cliente ativo.");
          await carregarTrials();
        } catch (err) {
          alert("Falha ao converter: " + String(err?.message || err));
        }
      });
    }

    const btnEncerrar = card.querySelector("button[data-encerrar]");
    if (btnEncerrar) {
      btnEncerrar.addEventListener("click", async function () {
        const ok = window.confirm("Encerrar e remover este acesso trial?");
        if (!ok) return;
        try {
          await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinica.clinica_id)}`, {
            method: "DELETE",
          });
          await carregarTrials();
        } catch (err) {
          alert("Falha ao encerrar: " + String(err?.message || err));
        }
      });
    }

    return card;
  }

  async function carregarTrials() {
    const root = document.getElementById("listaTrials");
    if (!root) return;
    try {
      const items = await apiGetClinicas();
      const trials = items
        .filter((c) => String(c?.status || "").trim().toLowerCase() === "trial")
        .sort((a, b) => (diasRestantes(a.trial_expires_at) ?? 999) - (diasRestantes(b.trial_expires_at) ?? 999));

      root.innerHTML = "";
      if (!trials.length) {
        root.innerHTML = "<p>Nenhum trial ativo no momento.</p>";
        return;
      }
      trials.forEach((c) => root.appendChild(montarCardTrial(c)));
    } catch (err) {
      root.innerHTML = `<p>Falha ao carregar trials: ${String(err?.message || err)}</p>`;
    }
  }

  function mostrarSucesso(clinica, senha) {
    const box = document.getElementById("trialSucesso");
    if (!box) return;

    const link = `${window.location.origin}/Html/login.html`;
    document.getElementById("trialSucessoLink").textContent = link;
    document.getElementById("trialSucessoEmail").textContent = clinica.email;
    document.getElementById("trialSucessoSenha").textContent = senha;
    document.getElementById("trialSucessoData").textContent = formatarDataBr(clinica.trial_expires_at);
    box.hidden = false;

    const btnCopiar = document.getElementById("btnCopiarTrial");
    if (btnCopiar) {
      btnCopiar.onclick = function () {
        const msg =
          `Seu acesso de teste ao ProntoGest está pronto! 🎉\n\n` +
          `Link: ${link}\n` +
          `Email: ${clinica.email}\n` +
          `Senha: ${senha}\n\n` +
          `Válido até ${formatarDataBr(clinica.trial_expires_at)}. Qualquer dúvida, me chama por aqui.`;
        navigator.clipboard
          .writeText(msg)
          .then(() => alert("Mensagem copiada! Já pode colar no WhatsApp."))
          .catch(() => alert("Não consegui copiar automaticamente. Copie o texto manualmente."));
      };
    }
  }

  function bindFormTrial() {
    const form = document.getElementById("formTrial");
    if (!form) return;

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();

      const nome = document.getElementById("trialNome")?.value?.trim() || "";
      const clinica_id = document.getElementById("trialId")?.value?.trim() || slugify(nome);
      const responsavel = document.getElementById("trialResponsavel")?.value?.trim() || "";
      const telefone = document.getElementById("trialTelefone")?.value?.trim() || "";
      const email = document.getElementById("trialEmail")?.value?.trim() || "";
      const dias = document.getElementById("trialDias")?.value || "14";
      const senha = document.getElementById("trialSenha")?.value?.trim() || gerarSenha();

      if (!nome || !clinica_id || !email) {
        alert("Preencha ao menos nome, clinica_id e email.");
        return;
      }

      const trial_expires_at = diasParaISO(dias);

      try {
        const resp = await window.apiFetch("/api/clinicas", {
          method: "POST",
          body: JSON.stringify({
            nome,
            clinica_id,
            telefone,
            email,
            responsavel,
            status: "trial",
            trial_expires_at,
          }),
        });

        const clinica = resp?.item || { nome, clinica_id, email, telefone, responsavel, trial_expires_at };

        try {
          await window.apiFetch(`/api/clinicas/${encodeURIComponent(clinica_id)}/admin`, {
            method: "POST",
            body: JSON.stringify({
              nome: responsavel || nome,
              email,
              senha,
              role: "admin",
            }),
          });
        } catch (errAdmin) {
          alert(
            "Clínica trial criada, mas falhou ao criar o login de acesso: " +
              String(errAdmin?.message || errAdmin) +
              ". Crie o admin manualmente em Cadastro de Cliente."
          );
        }

        mostrarSucesso(clinica, senha);
        form.reset();
        idEditadoManualmente = false;
        bindSenhaAuto();
        await carregarTrials();
      } catch (err) {
        alert("Falha ao criar trial: " + String(err?.message || err));
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

    bindAutoId();
    bindSenhaAuto();
    bindFormTrial();
    await carregarTrials();
  });
})();
