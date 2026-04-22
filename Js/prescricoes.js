/* ===========================
   PRESCRIÇÕES - Mini SGH (API-FIRST + fallback)
   - Pacientes: API GET /api/pacientes (fallback: pacientes_lista_v1)
   - Prescrições: API CRUD:
       GET /api/prescricoes (opcional ?pacienteId=)
       POST /api/prescricoes
       PUT /api/prescricoes/:id
       DELETE /api/prescricoes/:id
   - Fallback seguro no localStorage: prescricoes_v1
   =========================== */

(function () {
  const LS_PRESCRICOES = "prescricoes_v1";
  const LS_PACIENTES = "pacientes_lista_v1";
  const LS_ESTOQUE = "farmacia_estoque_v1";
  const LS_MED_PADRAO = "medicamentos_padrao_v1";
  const SUGESTOES_ID = "medicamentos-sugestoes";

  let pacientes = [];
  let prescricoes = [];
  let editingId = null;

  const pacienteSelect = document.getElementById("pacienteSelect");
  const medicamentoEl = document.getElementById("medicamento");
  const doseEl = document.getElementById("dose");
  const frequenciaEl = document.getElementById("frequencia");
  const viaEl = document.getElementById("via");
  const observacoesEl = document.getElementById("observacoes");
  const registrarBtn = document.querySelector(".card button[onclick='adicionarPrescricao()']");

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

  function lsGetArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function lsGetObject(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function carregarPrescricoesLS() {
    return lsGetArray(LS_PRESCRICOES);
  }

  function salvarPrescricoesLS(lista) {
    lsSet(LS_PRESCRICOES, Array.isArray(lista) ? lista : []);
  }

  function getPacienteNomeById(id) {
    const pid = String(id || "");
    const p = pacientes.find((x) => String(x?.id) === pid);
    return p?.nome || "Paciente";
  }

  function formatarDataHoraBR(d = new Date()) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function getMedicamentosBase() {
    return [
      // Hipertensão / cardíacos
      "Losartana",
      "Enalapril",
      "Captopril",
      "Amlodipino",
      "Nifedipino",
      "Valsartana",
      "Lisinopril",
      "Clortalidona",
      "Atenolol",
      "Metoprolol",
      "Carvedilol",
      "Propranolol",
      "Digoxina",
      "Amiodarona",
      "Mononitrato de isossorbida",
      "Nitroglicerina",
      "Ácido acetilsalicílico",
      "Clopidogrel",
      // Diabetes (DM)
      "Metformina",
      "Glibenclamida",
      "Gliclazida",
      "Glimepirida",
      "Sitagliptina",
      "Insulina NPH",
      "Insulina Regular",
      "Insulina Glargina",
      // Diuréticos
      "Furosemida",
      "Hidroclorotiazida",
      "Espironolactona",
      "Indapamida",
      "Clortalidona",
      // Antitérmicos / analgésicos
      "Dipirona",
      "Paracetamol",
      "Ibuprofeno",
      "Tramadol",
      "Cetorolaco",
      "Ácido acetilsalicílico",
      // Anti-inflamatórios
      "Diclofenaco",
      "Naproxeno",
      "Cetoprofeno",
      "Nimesulida",
      "Meloxicam",
      // Antibióticos
      "Amoxicilina",
      "Amoxicilina + clavulanato de potássio",
      "Azitromicina",
      "Cefalexina",
      "Ceftriaxona",
      "Ciprofloxacino",
      "Levofloxacino",
      "Doxiciclina",
      "Clindamicina",
      "Metronidazol",
      "Sulfametoxazol + Trimetoprim",
    ];
  }

  function atualizarSugestoesMedicamentos() {
    const datalist = document.getElementById(SUGESTOES_ID);
    if (!datalist) return;

    const base = getMedicamentosBase();
    const padrao = getMedicamentosPadraoLS();
    const estoque = lsGetObject(LS_ESTOQUE);
    const estoqueKeys = Object.keys(estoque || {});
    const unicos = Array.from(
      new Set(
        [...base, ...padrao, ...estoqueKeys]
          .map((s) => String(s || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    datalist.innerHTML = unicos.map((m) => `<option value="${escapeHtml(m)}"></option>`).join("");
  }

  function getMedicamentosPadraoLS() {
    const lista = lsGetArray(LS_MED_PADRAO);
    return lista
      .map((x) => String(x?.nome || "").trim())
      .filter(Boolean);
  }

  function isErroConexao(msg) {
    const m = String(msg || "");
    return /Failed to fetch|NetworkError|ECONNREFUSED|conectar|network/i.test(m);
  }

  async function apiListPrescricoes(pacienteId) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const url = pacienteId
      ? `/api/prescricoes?pacienteId=${encodeURIComponent(pacienteId)}`
      : `/api/prescricoes`;

    const resp = await apiFetchFn(url, { method: "GET" });
    return Array.isArray(resp?.items) ? resp.items : Array.isArray(resp?.lista) ? resp.lista : [];
  }

  async function apiCreatePrescricao(payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn("/api/prescricoes", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return resp?.item || resp?.prescricao || null;
  }

  async function apiUpdatePrescricao(id, payload) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    const resp = await apiFetchFn(`/api/prescricoes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return resp?.item || resp?.prescricao || payload;
  }

  async function apiDeletePrescricao(id) {
    const apiFetchFn = window.apiFetch;
    if (typeof apiFetchFn !== "function") throw new Error("apiFetch indisponível");

    await apiFetchFn(`/api/prescricoes/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  }

  async function carregarPacientes() {
    const apiFetchFn = window.apiFetch;

    if (typeof apiFetchFn !== "function") {
      pacientes = lsGetArray(LS_PACIENTES);
      popularPacientes();
      return;
    }

    try {
      const resp = await apiFetchFn("/api/pacientes", { method: "GET" });
      pacientes = Array.isArray(resp?.pacientes) ? resp.pacientes : Array.isArray(resp?.items) ? resp.items : [];
      lsSet(LS_PACIENTES, pacientes);
    } catch {
      pacientes = lsGetArray(LS_PACIENTES);
    }

    popularPacientes();
  }

  function popularPacientes() {
    if (!pacienteSelect) return;
    pacienteSelect.innerHTML = `<option value="">Selecione um paciente...</option>`;
    if (!pacientes.length) return;
    pacientes.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome || "Paciente";
      pacienteSelect.appendChild(opt);
    });
  }

  function limparCampos() {
    if (medicamentoEl) medicamentoEl.value = "";
    if (doseEl) doseEl.value = "";
    if (frequenciaEl) frequenciaEl.value = "";
    if (viaEl) viaEl.value = "";
    if (observacoesEl) observacoesEl.value = "";
    if (pacienteSelect) pacienteSelect.value = "";
  }

  function setModoEdicao(ativo) {
    if (registrarBtn) registrarBtn.textContent = ativo ? "Salvar Alterações" : "Registrar Prescrição";
  }

  function montarPayload() {
    const pacienteId = String(pacienteSelect?.value || "").trim();
    const pacienteNome = pacienteId ? getPacienteNomeById(pacienteId) : "";

    return {
      id: editingId || uid(),
      pacienteId,
      pacienteNome,
      medicamento: String(medicamentoEl?.value || "").trim(),
      dose: String(doseEl?.value || "").trim(),
      frequencia: String(frequenciaEl?.value || "").trim(),
      via: String(viaEl?.value || "").trim(),
      observacoes: String(observacoesEl?.value || "").trim(),
      dataHoraBR: formatarDataHoraBR()
    };
  }

  async function adicionarPrescricao() {
    const payload = montarPayload();

    if (!payload.pacienteId || !payload.medicamento || !payload.dose || !payload.frequencia || !payload.via) {
      alert("Preencha Paciente, Medicamento, Dose, Frequência e Via.");
      return;
    }

    if (editingId) {
      const idx = prescricoes.findIndex((p) => String(p?.id) === String(editingId));
      if (idx === -1) {
        editingId = null;
        setModoEdicao(false);
        return;
      }

      try {
        if (typeof window.apiFetch === "function") {
          const salvo = await apiUpdatePrescricao(editingId, payload);
          prescricoes[idx] = { ...prescricoes[idx], ...salvo };
        } else {
          prescricoes[idx] = { ...prescricoes[idx], ...payload };
        }
      } catch (err) {
        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao atualizar prescrição.");
          return;
        }
        prescricoes[idx] = { ...prescricoes[idx], ...payload };
      }

      salvarPrescricoesLS(prescricoes);
      editingId = null;
      setModoEdicao(false);
      atualizarLista();
      limparCampos();
      return;
    }

    try {
      if (typeof window.apiFetch === "function") {
        const salvo = await apiCreatePrescricao(payload);
        prescricoes.unshift(salvo || payload);
      } else {
        prescricoes.unshift(payload);
      }
    } catch (err) {
      if (!isErroConexao(err?.message || err)) {
        alert(err?.message || "Erro ao salvar prescrição.");
        return;
      }
      prescricoes.unshift(payload);
    }

    salvarPrescricoesLS(prescricoes);
    atualizarLista();
    limparCampos();
  }

  async function removerPrescricao(id) {
    prescricoes = carregarPrescricoesLS();
    const idx = prescricoes.findIndex((x) => String(x?.id) === String(id));
    if (idx === -1) return;
    if (!confirm("Remover esta prescrição?")) return;

    if (typeof window.apiFetch === "function") {
      try {
        await apiDeletePrescricao(id);
      } catch (err) {
        if (!isErroConexao(err?.message || err)) {
          alert(err?.message || "Erro ao remover prescrição.");
          return;
        }
      }
    }

    prescricoes.splice(idx, 1);
    salvarPrescricoesLS(prescricoes);
    atualizarLista();
  }

  function editarPrescricao(id) {
    const p = prescricoes.find((x) => String(x?.id) === String(id));
    if (!p) return;
    editingId = String(p.id);
    setModoEdicao(true);

    if (pacienteSelect) pacienteSelect.value = String(p.pacienteId || "");
    if (medicamentoEl) medicamentoEl.value = p.medicamento || "";
    if (doseEl) doseEl.value = p.dose || "";
    if (frequenciaEl) frequenciaEl.value = p.frequencia || "";
    if (viaEl) viaEl.value = p.via || "";
    if (observacoesEl) observacoesEl.value = p.observacoes || "";
  }
function imprimirPrescricao(id) {
  const p = prescricoes.find((x) => String(x?.id) === String(id));
  if (!p) return;

  const nomePaciente = p.pacienteNome || getPacienteNomeById(p.pacienteId) || "-";

  const nomeProfissional =
    localStorage.getItem("auth_nome") ||
    localStorage.getItem("auth_email") ||
    "Profissional Responsável";

  const html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Prescrição Médica - ProntoGest</title>
      <style>
        @page {
          size: A4;
          margin: 14mm;
        }

        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          font-family: Arial, Helvetica, sans-serif;
          color: #1e293b;
        }

        body {
          font-size: 13px;
          line-height: 1.45;
        }

        .page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #fff;
        }

        .watermark {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 0;
          opacity: 0.035;
        }

        .watermark svg {
          width: 460px;
          height: 460px;
        }

        .content {
          position: relative;
          z-index: 1;
        }

        .top-line {
          height: 6px;
          background: linear-gradient(90deg, #0A66C2 0%, #2563eb 45%, #38bdf8 100%);
          border-radius: 999px;
          margin-bottom: 14px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: stretch;
          gap: 18px;
          margin-bottom: 18px;
        }

        .header-left,
        .header-right {
          border: 1px solid #dbe7f3;
          border-radius: 16px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
        }

        .header-left {
          flex: 1;
          padding: 18px;
        }

        .header-right {
          width: 240px;
          padding: 16px;
          text-align: right;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .brand-logo {
          width: 58px;
          height: 58px;
          border-radius: 16px;
          background: linear-gradient(180deg, #0A66C2 0%, #084d91 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
        }

        .brand-logo svg {
          width: 30px;
          height: 30px;
        }

        .brand-text h1 {
          margin: 0;
          font-size: 24px;
          color: #0f172a;
          letter-spacing: 0.2px;
        }

        .brand-text .subtitle {
          margin: 3px 0 10px 0;
          font-size: 12px;
          color: #475569;
        }

        .unit-info {
          margin-top: 2px;
        }

        .unit-info p {
          margin: 4px 0;
          font-size: 12px;
          color: #334155;
        }

        .doc-chip {
          align-self: flex-end;
          display: inline-block;
          padding: 7px 12px;
          border-radius: 999px;
          background: #0A66C2;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .doc-meta p {
          margin: 4px 0;
          font-size: 12px;
          color: #334155;
        }

        .section {
          margin-bottom: 16px;
        }

        .section-title {
          margin: 0 0 8px 0;
          color: #0A66C2;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .card {
          border: 1px solid #dbe7f3;
          border-radius: 16px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
          overflow: hidden;
        }

        .card-body {
          padding: 14px;
        }

        .patient-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr;
          gap: 10px;
        }

        .field {
          border: 1px solid #e5edf6;
          border-radius: 12px;
          background: #f8fbff;
          padding: 11px 12px;
          min-height: 62px;
        }

        .field-label {
          display: block;
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 5px;
        }

        .field-value {
          display: block;
          font-size: 13px;
          color: #0f172a;
          word-break: break-word;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        thead th {
          background: linear-gradient(180deg, #0A66C2 0%, #084d91 100%);
          color: #fff;
          text-align: left;
          font-size: 12px;
          padding: 12px 10px;
          font-weight: 700;
        }

        tbody td {
          border-top: 1px solid #e5edf6;
          padding: 12px 10px;
          vertical-align: top;
          font-size: 13px;
          color: #0f172a;
        }

        tbody tr:nth-child(even) {
          background: #f8fbff;
        }

        .obs-box {
          border: 1px dashed #9fb4c9;
          border-radius: 14px;
          background: #fcfdff;
          padding: 13px 14px;
          min-height: 90px;
        }

        .obs-box strong {
          display: block;
          margin-bottom: 6px;
          color: #334155;
          font-size: 12px;
        }

        .footer {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 24px;
          align-items: end;
        }

        .signature-card,
        .stamp-card {
          border: 1px solid #dbe7f3;
          border-radius: 16px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
          padding: 16px;
          min-height: 138px;
        }

        .professional-name {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 10px;
        }

        .professional-meta {
          font-size: 12px;
          color: #475569;
          margin: 4px 0;
        }

        .signature-line {
          margin-top: 42px;
          border-top: 1.5px solid #0f172a;
          padding-top: 7px;
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }

        .stamp-card {
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-style: dashed;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }

        .bottom-bar {
          margin-top: 18px;
          padding-top: 10px;
          border-top: 1px solid #dbe7f3;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          font-size: 11px;
          color: #64748b;
        }

        .bottom-left,
        .bottom-right {
          flex: 1;
        }

        .bottom-right {
          text-align: right;
        }

        .clinic-note {
          margin-top: 2px;
        }

        @media print {
          .page {
            min-height: auto;
          }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="watermark" aria-hidden="true">
          <svg viewBox="0 0 600 600">
            <path d="M120 170 Q300 60 480 170" fill="none" stroke="#0A66C2" stroke-width="26" stroke-linecap="round"/>
            <path d="M160 200 Q300 120 440 200" fill="none" stroke="#0A66C2" stroke-width="18" stroke-linecap="round"/>
            <path d="M300 140 L300 520" fill="none" stroke="#0A66C2" stroke-width="30" stroke-linecap="round"/>
            <path d="M220 250 Q300 200 380 250" fill="none" stroke="#0A66C2" stroke-width="16"/>
            <path d="M220 250 Q260 300 300 350 Q340 400 380 450" fill="none" stroke="#0A66C2" stroke-width="16"/>
            <path d="M380 250 Q340 300 300 350 Q260 400 220 450" fill="none" stroke="#0A66C2" stroke-width="16"/>
            <circle cx="300" cy="120" r="28" fill="#0A66C2"/>
          </svg>
        </div>

        <div class="content">
          <div class="top-line"></div>

          <div class="header">
            <div class="header-left">
              <div class="brand">
                <div class="brand-logo">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 4V20" stroke="white" stroke-width="2.6" stroke-linecap="round"/>
                    <path d="M4 12H20" stroke="white" stroke-width="2.6" stroke-linecap="round"/>
                  </svg>
                </div>

                <div class="brand-text">
                  <h1>ProntoGest</h1>
                  <div class="subtitle">Sistema de Gestão Hospitalar</div>

                  <div class="unit-info">
                    <p><strong>Documento:</strong> Prescrição Médica</p>
                    <p><strong>Unidade:</strong> __________________________________________</p>
                    <p><strong>Endereço:</strong> ________________________________________</p>
                    <p><strong>Telefone:</strong> _________________________________________</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="header-right">
              <div class="doc-chip">Uso Clínico</div>
              <div class="doc-meta">
                <p><strong>Data/Hora de Emissão</strong></p>
                <p>${escapeHtml(p.dataHoraBR || "-")}</p>
              </div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Dados do Paciente</h2>
            <div class="card">
              <div class="card-body">
                <div class="patient-grid">
                  <div class="field">
                    <span class="field-label">Paciente</span>
                    <span class="field-value">${escapeHtml(nomePaciente)}</span>
                  </div>

                  <div class="field">
                    <span class="field-label">Prontuário</span>
                    <span class="field-value">__________________</span>
                  </div>

                  <div class="field">
                    <span class="field-label">Convênio</span>
                    <span class="field-value">__________________</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Itens da Prescrição</h2>
            <div class="card">
              <table>
                <thead>
                  <tr>
                    <th>Medicamento</th>
                    <th>Dose</th>
                    <th>Frequência</th>
                    <th>Via</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${escapeHtml(p.medicamento || "-")}</td>
                    <td>${escapeHtml(p.dose || "-")}</td>
                    <td>${escapeHtml(p.frequencia || "-")}</td>
                    <td>${escapeHtml(p.via || "-")}</td>
                    <td>${escapeHtml(p.observacoes || "-")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Observações Gerais</h2>
            <div class="obs-box">
              <strong>Anotações complementares</strong>
              _______________________________________________________________________________________<br><br>
              _______________________________________________________________________________________<br><br>
              _______________________________________________________________________________________
            </div>
          </div>

          <div class="footer">
            <div class="signature-card">
              <div class="professional-name">${escapeHtml(nomeProfissional)}</div>
              <div class="professional-meta"><strong>Médico Responsável:</strong> ${escapeHtml(nomeProfissional)}</div>
              <div class="professional-meta"><strong>CRM/UF:</strong> ________________________________</div>
              <div class="signature-line">Assinatura do Profissional</div>
            </div>

            <div class="stamp-card">
              Carimbo Profissional
            </div>
          </div>

          <div class="bottom-bar">
            <div class="bottom-left">
              <div><strong>ProntoGest</strong> — Documento emitido por sistema clínico.</div>
              <div class="clinic-note">Nota: Nota: Conferir alergias, interações medicamentosas e condições clínicas do paciente antes da administração.</div>
            </div>

            <div class="bottom-right">
              <div>Prescrição Médica</div>
              <div>Uso interno / impressão clínica</div>
            </div>
          </div>
        </div>
      </div>

      <script>
        window.print();
      </script>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Seu navegador bloqueou o pop-up de impressão. Permita pop-ups para imprimir.");
    return;
  }

  w.document.write(html);
  w.document.close();
}
  function atualizarLista() {
    const div = document.getElementById("listaPrescricoes");
    if (!div) return;

    div.classList.add("timeline");
    div.innerHTML = "<h2>Prescrições Registradas</h2>";

    const pacienteId = String(pacienteSelect?.value || "").trim();
    let lista = prescricoes;

    if (typeof window.apiFetch !== "function") {
      lista = pacienteId ? prescricoes.filter((p) => String(p?.pacienteId) === pacienteId) : prescricoes;
    } else if (pacienteId) {
      lista = (prescricoes || []).filter((p) => String(p?.pacienteId) === pacienteId);
    }

    if (!lista.length) {
      div.innerHTML += "<p>Nenhuma prescrição registrada.</p>";
      return;
    }

    lista.forEach((p) => {
      const item = document.createElement("div");
      item.className = "item";

      const nome = p.pacienteNome || getPacienteNomeById(p.pacienteId) || "-";

      item.innerHTML = `
        <p><strong>Paciente:</strong> ${escapeHtml(nome)}</p>
        <p><strong>Medicamento:</strong> ${escapeHtml(p.medicamento)}</p>
        <p><strong>Dose:</strong> ${escapeHtml(p.dose)}</p>
        <p><strong>Frequência:</strong> ${escapeHtml(p.frequencia)}</p>
        <p><strong>Via:</strong> ${escapeHtml(p.via)}</p>
        <p><strong>Obs:</strong> ${escapeHtml(p.observacoes || "-")}</p>
        <p style="opacity:.75"><small>${escapeHtml(p.dataHoraBR || "")}</small></p>
        <div class="list-actions">
          <button type="button" class="btn btn-sm btn-imprimir" onclick="imprimirPrescricao('${String(p.id)}')">Imprimir</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="editarPrescricao('${String(p.id)}')">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="removerPrescricao('${String(p.id)}')">Remover</button>
        </div>
      `;

      div.appendChild(item);
    });
  }

  async function syncPrescricoesFromAPI(pacienteId) {
    try {
      const lista = await apiListPrescricoes(pacienteId);
      prescricoes = Array.isArray(lista) ? lista : [];
      salvarPrescricoesLS(prescricoes);
    } catch {
      prescricoes = carregarPrescricoesLS();
    }
  }

  async function onPacienteChange() {
    const pacienteId = String(pacienteSelect?.value || "").trim();
    if (typeof window.apiFetch === "function") {
      await syncPrescricoesFromAPI(pacienteId);
      atualizarLista();
      return;
    }
    prescricoes = carregarPrescricoesLS();
    atualizarLista();
  }

  async function init() {
    prescricoes = carregarPrescricoesLS();
    await carregarPacientes();

    if (pacienteSelect) pacienteSelect.addEventListener("change", onPacienteChange);

    await syncMedicamentosPadraoFromAPI();

    if (typeof window.apiFetch === "function") {
      await syncPrescricoesFromAPI("");
    }

    atualizarLista();
    atualizarSugestoesMedicamentos();
  }

  async function syncMedicamentosPadraoFromAPI() {
    if (typeof window.apiFetch !== "function") return false;
    try {
      const resp = await window.apiFetch("/api/medicamentos-padrao", { method: "GET" });
      const lista = Array.isArray(resp?.items)
        ? resp.items
        : Array.isArray(resp?.lista)
        ? resp.lista
        : Array.isArray(resp?.data)
        ? resp.data
        : Array.isArray(resp?.medicamentos)
        ? resp.medicamentos
        : Array.isArray(resp)
        ? resp
        : [];
      if (lista.length) {
        lsSet(LS_MED_PADRAO, lista);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  window.adicionarPrescricao = adicionarPrescricao;
  window.removerPrescricao = removerPrescricao;
  window.editarPrescricao = editarPrescricao;
  window.imprimirPrescricao = imprimirPrescricao;

  init();
})();
