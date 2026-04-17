(() => {
  const CHAVES = {
    pacientes: "spa_pacientes_v1",
    triagens: "spa_triagens_v1",
    evolucoes: "spa_evolucoes_v1",
    prescricoes: "spa_prescricoes_v1",
    leitos: "spa_leitos_v1",
    farmacia: "spa_farmacia_v1",
    agenda: "spa_agenda_v1",
    faturas: "spa_faturas_v1",
    funcionarios: "spa_funcionarios_v1",
    auditoria: "spa_auditoria_v1",
  };

  const MENU = [
    ["dashboard", "Dashboard"],
    ["pacientes", "Cadastro de Pacientes"],
    ["triagem", "Triagem"],
    ["pep", "Prontuario Eletronico"],
    ["prescricoes", "Prescricoes"],
    ["leitos", "Gerenciamento de Leitos"],
    ["farmacia", "Farmacia / Estoque"],
    ["agenda", "Agendamento de Consultas"],
    ["faturamento", "Faturamento"],
    ["relatorios", "Relatorios"],
    ["funcionarios", "Funcionarios"],
    ["auditoria", "Auditoria"],
  ];

  const estado = {
    pacientes: ls(CHAVES.pacientes, []),
    triagens: ls(CHAVES.triagens, []),
    evolucoes: ls(CHAVES.evolucoes, []),
    prescricoes: ls(CHAVES.prescricoes, []),
    leitos: ls(CHAVES.leitos, Array.from({ length: 10 }, (_, i) => ({ numero: i + 1, ocupado: false, pacienteId: null }))),
    farmacia: ls(CHAVES.farmacia, []),
    agenda: ls(CHAVES.agenda, []),
    faturas: ls(CHAVES.faturas, []),
    funcionarios: ls(CHAVES.funcionarios, []),
    auditoria: ls(CHAVES.auditoria, []),
  };

  let chart = null;
  const doctorsBase = [
    { nome: "Dr. Jaylon Stanton", esp: "Dentista" },
    { nome: "Dra. Carla Schleifer", esp: "Clinica" },
    { nome: "Dr. Hanna Geidt", esp: "Cirurgiao" },
    { nome: "Dr. Roger George", esp: "Pediatra" },
    { nome: "Dra. Natalie Doe", esp: "Cardio" },
  ];

  function ls(chave, fallback) {
    try { const v = JSON.parse(localStorage.getItem(chave)); return Array.isArray(v) ? v : fallback; }
    catch { return fallback; }
  }
  function salvarTudo() {
    Object.entries(CHAVES).forEach(([k, chave]) => localStorage.setItem(chave, JSON.stringify(estado[k])));
  }
  function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
  function pacienteNome(id) { return estado.pacientes.find((p) => p.id === id)?.nome || "Nao encontrado"; }
  function hojeISO() { return new Date().toISOString().slice(0, 10); }

  function auditar(acao, entidade, detalhe) {
    estado.auditoria.unshift({ id: uid(), data: new Date().toLocaleString("pt-BR"), acao, entidade, detalhe });
    if (estado.auditoria.length > 300) estado.auditoria.length = 300;
  }

  function montarMenu() {
    const menu = document.getElementById("menu");
    menu.innerHTML = MENU.map(([id, txt]) => `<button data-tela="${id}">${txt}</button>`).join("");
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tela]");
      if (!btn) return;
      abrirTela(btn.dataset.tela);
    });
  }

  function abrirTela(id) {
    document.querySelectorAll(".tela").forEach((x) => x.classList.toggle("ativa", x.id === id));
    document.querySelectorAll("#menu button").forEach((x) => x.classList.toggle("ativo", x.dataset.tela === id));
    const label = MENU.find((x) => x[0] === id)?.[1] || "Dashboard";
    document.getElementById("tituloTela").textContent = label;
    renderAll();
  }

  function preencherPacientesSelects() {
    const html = [`<option value="">Selecione...</option>`, ...estado.pacientes.map((p) => `<option value="${p.id}">${p.nome}</option>`)].join("");
    ["triagemPaciente", "pepPaciente", "prescricaoPaciente", "leitoPaciente", "agendaPaciente", "faturaPaciente"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
    const leitoSel = document.getElementById("leitoNumero");
    if (leitoSel) leitoSel.innerHTML = `<option value="">Selecione...</option>${estado.leitos.filter((l) => !l.ocupado).map((l) => `<option>${l.numero}</option>`).join("")}`;
  }

  function itemHtml(titulo, corpo, acoes = "") { return `<article class="item"><strong>${titulo}</strong><div>${corpo}</div>${acoes}</article>`; }

  function renderListas() {
    document.getElementById("listaPacientes").innerHTML = estado.pacientes.map((p) => itemHtml(p.nome, `Nascimento: ${p.nascimento || "-"} | Tel: ${p.telefone || "-"}`)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaTriagens").innerHTML = estado.triagens.map((t) => itemHtml(`${pacienteNome(t.pacienteId)} - ${t.risco}`, `Diag: ${t.diag} | PA:${t.pa || "-"} FC:${t.fc || "-"} FR:${t.fr || "-"} Temp:${t.temp || "-"}`)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaPep").innerHTML = estado.evolucoes.map((e) => itemHtml(`${pacienteNome(e.pacienteId)} - ${e.tipo}`, e.descricao)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaPrescricoes").innerHTML = estado.prescricoes.map((p) => itemHtml(`${pacienteNome(p.pacienteId)} - ${p.nome}`, `Dose: ${p.dose}`)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaFarmacia").innerHTML = estado.farmacia.map((m) => itemHtml(m.medicamento, `Quantidade: ${m.quantidade}`)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaAgenda").innerHTML = estado.agenda.map((a) => itemHtml(`${pacienteNome(a.pacienteId)} - ${a.data}`, "")).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaFaturas").innerHTML = estado.faturas.map((f) => itemHtml(pacienteNome(f.pacienteId), `R$ ${Number(f.valor).toFixed(2)}`)).join("") || "<p>Sem registros.</p>";
    document.getElementById("totalFaturas").textContent = `Total geral: R$ ${estado.faturas.reduce((s, x) => s + Number(x.valor || 0), 0).toFixed(2)}`;
    document.getElementById("listaFuncionarios").innerHTML = estado.funcionarios.map((f) => itemHtml(f.nome, f.email)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaAuditoria").innerHTML = estado.auditoria.map((a) => itemHtml(`${a.data} - ${a.acao} ${a.entidade}`, a.detalhe)).join("") || "<p>Sem registros.</p>";
    document.getElementById("listaLeitos").innerHTML = estado.leitos.map((l) => `<div class="leito ${l.ocupado ? "ocupado" : "livre"}">Leito ${l.numero}<br>${l.ocupado ? pacienteNome(l.pacienteId) : "Livre"}</div>`).join("");
  }

  function renderDashboardExtras() {
    const statsEl = document.getElementById("listaStats");
    if (statsEl) {
      const stats = [
        ["Anestesia", 82], ["Ginecologia", 75], ["Neurologia", 88], ["Oncologia", 62], ["Ortopedia", 78], ["Fisioterapia", 91],
      ];
      statsEl.innerHTML = stats
        .map(([nome, valor]) => `
          <div class="stats-row">
            <div>${nome}
              <div class="progress"><div style="width:${valor}%"></div></div>
            </div>
            <strong>${Math.round(valor / 10)}</strong>
          </div>`)
        .join("");
    }

    const doctorsEl = document.getElementById("listaDoctors");
    if (doctorsEl) {
      doctorsEl.innerHTML = doctorsBase
        .map((d, i) => `
          <div class="doctor-row">
            <div class="doctor-avatar">${String.fromCharCode(65 + i)}</div>
            <div class="doctor-meta">
              <strong>${d.nome}</strong>
              <small>${d.esp}</small>
            </div>
          </div>`)
        .join("");
    }

    const tb = document.getElementById("tableConsultas");
    if (tb) {
      const consultas = (estado.agenda || []).slice(0, 8);
      tb.innerHTML = consultas.length
        ? consultas.map((c, idx) => `
          <tr>
            <td>${String(idx + 1).padStart(2, "0")}</td>
            <td>${pacienteNome(c.pacienteId)}</td>
            <td>${c.data || "-"}</td>
            <td>${28 + (idx * 3 % 45)}</td>
            <td>${idx % 2 ? "Masculino" : "Feminino"}</td>
            <td>${doctorsBase[idx % doctorsBase.length].nome}</td>
          </tr>`).join("")
        : `<tr><td colspan="6">Sem consultas para exibir.</td></tr>`;
    }
  }

  function renderRelatorios() {
    document.getElementById("resumoRelatorios").innerHTML = `
      <p><strong>Pacientes:</strong> ${estado.pacientes.length}</p>
      <p><strong>Triagens:</strong> ${estado.triagens.length}</p>
      <p><strong>Evolucoes:</strong> ${estado.evolucoes.length}</p>
      <p><strong>Prescricoes:</strong> ${estado.prescricoes.length}</p>
      <p><strong>Consultas:</strong> ${estado.agenda.length}</p>
      <p><strong>Faturas:</strong> ${estado.faturas.length}</p>
    `;
  }

  function renderDashboard() {
    document.getElementById("kpiPacientes").textContent = estado.pacientes.length;
    const triagensQtd = estado.triagens.length;
    document.getElementById("kpiTriagens") && (document.getElementById("kpiTriagens").textContent = triagensQtd);
    document.getElementById("kpiLeitos").textContent = estado.leitos.filter((l) => l.ocupado).length;
    document.getElementById("kpiConsultas").textContent = estado.agenda.filter((a) => a.data === hojeISO()).length;
    const funcsQtd = estado.funcionarios.length;
    const funcsEl = document.getElementById("kpiFuncionarios");
    if (funcsEl) funcsEl.textContent = funcsQtd;
    const tasksEl = document.getElementById("kpiTasks");
    if (tasksEl) tasksEl.textContent = String(25 + triagensQtd);
    const novosEl = document.getElementById("kpiPacientesNovos");
    if (novosEl) novosEl.textContent = String(Math.min(estado.pacientes.length, 12));
    const notifEl = document.getElementById("kpiNotif");
    if (notifEl) notifEl.textContent = String(Math.min(estado.auditoria.length, 40));

    const ctx = document.getElementById("graficoLeitos");
    if (!ctx || typeof Chart === "undefined") return;
    const dados = [20, 22, 21, 23, 19, 20, 23];
    if (chart) chart.destroy();
    const escuro = document.body.classList.contains("tema-escuro");
    const corLinha = escuro ? "#22c2d6" : "#0a66c2";
    const corFundo = escuro ? "rgba(34,194,214,.24)" : "rgba(10,102,194,.2)";
    const corGrid = escuro ? "rgba(142,162,191,.25)" : "rgba(114,131,158,.25)";
    const corTick = escuro ? "#b9c9de" : "#5b6d86";

    chart = new Chart(ctx, {
      type: "line",
      data: { labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"], datasets: [{ data: dados, borderColor: corLinha, backgroundColor: corFundo, fill: true, tension: .35 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: corGrid }, ticks: { color: corTick } },
          x: { grid: { color: corGrid }, ticks: { color: corTick } },
        },
      },
    });

    renderDashboardExtras();
  }

  function renderAll() {
    preencherPacientesSelects();
    renderListas();
    renderRelatorios();
    renderDashboard();
    salvarTudo();
  }

  function bindForms() {
    document.getElementById("formPaciente").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      estado.pacientes.unshift({ id: uid(), nome: fd.get("nome"), nascimento: fd.get("nascimento"), telefone: fd.get("telefone"), cpf: fd.get("cpf") });
      auditar("create", "paciente", String(fd.get("nome")));
      e.target.reset(); renderAll();
    });
    document.getElementById("formTriagem").addEventListener("submit", (e) => {
      e.preventDefault();
      const pacienteId = document.getElementById("triagemPaciente").value;
      const diag = document.getElementById("triagemDiag").value;
      const pa = document.getElementById("triagemPa").value;
      const fc = document.getElementById("triagemFc").value;
      const fr = document.getElementById("triagemFr").value;
      const temp = document.getElementById("triagemTemp").value;
      const risco = document.getElementById("triagemRisco").value;
      estado.triagens.unshift({ id: uid(), pacienteId, diag, pa, fc, fr, temp, risco });
      auditar("create", "triagem", diag);
      e.target.reset(); renderAll();
    });
    document.getElementById("formPep").addEventListener("submit", (e) => {
      e.preventDefault();
      const pacienteId = document.getElementById("pepPaciente").value;
      const tipo = document.getElementById("pepTipo").value;
      const descricao = document.getElementById("pepDescricao").value;
      estado.evolucoes.unshift({ id: uid(), pacienteId, tipo, descricao });
      auditar("create", "evolucao", tipo);
      e.target.reset(); renderAll();
    });
    document.getElementById("formPrescricao").addEventListener("submit", (e) => {
      e.preventDefault();
      const pacienteId = document.getElementById("prescricaoPaciente").value;
      const nome = document.getElementById("prescricaoNome").value;
      const dose = document.getElementById("prescricaoDose").value;
      estado.prescricoes.unshift({ id: uid(), pacienteId, nome, dose });
      auditar("create", "prescricao", nome);
      e.target.reset(); renderAll();
    });
    document.getElementById("formLeito").addEventListener("submit", (e) => {
      e.preventDefault();
      const n = Number(document.getElementById("leitoNumero").value);
      const leito = estado.leitos.find((l) => l.numero === n);
      if (leito && !leito.ocupado) { leito.ocupado = true; leito.pacienteId = document.getElementById("leitoPaciente").value; auditar("update", "leito", `Leito ${n} ocupado`); }
      e.target.reset(); renderAll();
    });
    document.getElementById("formFarmacia").addEventListener("submit", (e) => {
      e.preventDefault();
      const medicamento = document.getElementById("farmMed").value;
      const quantidade = Number(document.getElementById("farmQtd").value);
      estado.farmacia.unshift({ id: uid(), medicamento, quantidade });
      auditar("create", "farmacia", medicamento);
      e.target.reset(); renderAll();
    });
    document.getElementById("formAgenda").addEventListener("submit", (e) => {
      e.preventDefault();
      const pacienteId = document.getElementById("agendaPaciente").value;
      const data = document.getElementById("agendaData").value;
      estado.agenda.unshift({ id: uid(), pacienteId, data });
      auditar("create", "agenda", data);
      e.target.reset(); renderAll();
    });
    document.getElementById("formFatura").addEventListener("submit", (e) => {
      e.preventDefault();
      const pacienteId = document.getElementById("faturaPaciente").value;
      const valor = Number(document.getElementById("faturaValor").value);
      estado.faturas.unshift({ id: uid(), pacienteId, valor });
      auditar("create", "fatura", valor);
      e.target.reset(); renderAll();
    });
    document.getElementById("formFuncionario").addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = document.getElementById("funcNome").value;
      const email = document.getElementById("funcEmail").value;
      estado.funcionarios.unshift({ id: uid(), nome, email });
      auditar("create", "funcionario", nome);
      e.target.reset(); renderAll();
    });
  }

  function bindUI() {
    document.getElementById("btnMenu").addEventListener("click", () => document.body.classList.toggle("menu-fechado"));
    document.getElementById("btnSair").addEventListener("click", () => alert("Teste: logout simulado no laboratorio."));
    document.getElementById("btnTema").addEventListener("click", () => {
      const escuro = document.body.classList.contains("tema-escuro");
      document.body.classList.toggle("tema-escuro", !escuro);
      document.body.classList.toggle("tema-claro", escuro);
      renderDashboard();
    });
  }

  function init() {
    montarMenu();
    bindForms();
    bindUI();
    abrirTela("dashboard");
  }
  init();
})();
