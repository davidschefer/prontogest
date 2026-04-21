/* ===========================
   0.1-Dashboard.js - Mini SGH
   - API-FIRST com fallback localStorage
   - Atualiza cards com dados reais quando possível
   - Mantém gráfico (demo) sem quebrar caso Chart.js falte
   - ? Corrige erro Chart.js: destrói instância antes de recriar
   - ? Remove duplicação acidental (evita init rodar 2x)
   =========================== */

(function () {
  // ---------------------------
  // Fallback localStorage
  // ---------------------------
  function lsArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function lsSetSafe(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // não quebra dashboard por quota
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  }

  function isSameDayLocal(d1, d2) {
    if (!(d1 instanceof Date) || !(d2 instanceof Date)) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function parsePossivelData(item) {
    if (!item || typeof item !== "object") return null;

    const candidatos = [
      item.data,          // consultas
      item.dataHora,      // faturas / evoluções
      item.dataHoraISO,   // prescrições / triagens (se usar)
      item.createdAt,     // várias entidades
      item.criadoEm,      // funcionários
      item.updatedAt,
      item.createdAtISO,  // se existir em alguma entidade
    ].filter(Boolean);

    for (const c of candidatos) {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  }

  function normalizarTexto(txt) {
    return String(txt || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function parseNumeroFlex(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function parsePA(pa) {
    const s = String(pa || "").trim();
    if (!s) return { sistolica: null, diastolica: null };
    const m = s.match(/(\d{2,3})\s*[\/(x\-)]\s*(\d{2,3})/i);
    if (!m) return { sistolica: null, diastolica: null };
    return { sistolica: Number(m[1]), diastolica: Number(m[2]) };
  }

  function contarHoje(arr) {
    const hoje = new Date();
    let encontrouAlgumaData = false;
    let count = 0;

    for (const item of arr) {
      const d = parsePossivelData(item);
      if (!d) continue;
      encontrouAlgumaData = true;
      if (isSameDayLocal(d, hoje)) count++;
    }

    // Se não conseguiu extrair data de ninguém, retorna null para manter fallback (usar total)
    return encontrouAlgumaData ? count : null;
  }

  // ---------------------------
  // API-FIRST loader (flexível)
  // ---------------------------
  function extrairArrayPadrao(data) {
    // cobre padrões do seu backend:
    // { pacientes: [] } / { triagens: [] } / { items: [] } / { leitos: [] } / { consultas: [] }
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];

    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.pacientes)) return data.pacientes;
    if (Array.isArray(data.triagens)) return data.triagens;
    if (Array.isArray(data.consultas)) return data.consultas;
    if (Array.isArray(data.leitos)) return data.leitos;
    if (Array.isArray(data.prescricoes)) return data.prescricoes;

    return [];
  }

  async function apiGetArray(endpoint, fallbackKeys = []) {
    const apiFetchFn = window.apiFetch;

    // escolhe a primeira key como principal para salvar cache
    const primaryKey = fallbackKeys[0] || null;

    // fallback se apiFetch não existe
    if (typeof apiFetchFn !== "function") {
      for (const k of fallbackKeys) {
        const arr = lsArray(k);
        if (arr.length) return arr;
      }
      return [];
    }

    try {
      const data = await apiFetchFn(endpoint, { method: "GET" });
      const arr = extrairArrayPadrao(data);

      // atualiza cache local (útil para fallback)
      if (primaryKey) lsSetSafe(primaryKey, arr);

      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      console.warn(
        `[Dashboard] Falha ao carregar ${endpoint}. Usando fallback:`,
        err?.message || err
      );

      for (const k of fallbackKeys) {
        const arr = lsArray(k);
        if (arr.length) return arr;
      }
      return [];
    }
  }

  function lsEvolucoesAll() {
    const out = [];
    try {
      const keys = Object.keys(localStorage || {});
      keys
        .filter((k) => k.startsWith("evolucoes_"))
        .forEach((k) => {
          try {
            const arr = JSON.parse(localStorage.getItem(k) || "[]");
            if (Array.isArray(arr)) out.push(...arr);
          } catch {}
        });
    } catch {}
    return out;
  }

  function getPacienteNome(pacienteId, pacientes = []) {
    const pid = String(pacienteId || "").trim();
    if (!pid) return "Paciente";
    const p = pacientes.find((x) => String(x?.id) === pid);
    return p?.nome || "Paciente";
  }

  function formatarHora(consulta) {
    if (consulta?.hora) return String(consulta.hora).slice(0, 5);
    const data = consulta?.data ? String(consulta.data) : "";
    const iso = consulta?.dataHoraISO || consulta?.dataHora || "";
    const d = data ? new Date(`${data}T${consulta?.hora || "00:00"}`) : new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return "--:--";
  }

  function statusConsulta(consulta) {
    const raw = String(consulta?.status || "").trim().toLowerCase();
    if (!raw) return { label: "Agendada", cls: "status-info", badge: "badge-info" };
    if (raw.includes("confirm")) return { label: "Confirmada", cls: "status-ok", badge: "badge-success" };
    if (raw.includes("aguard")) return { label: "Aguardando", cls: "status-warn", badge: "badge-warning" };
    if (raw.includes("cancel")) return { label: "Cancelada", cls: "status-danger", badge: "badge-danger" };
    if (raw.includes("atend")) return { label: "Em atendimento", cls: "status-info", badge: "badge-info" };
    return { label: "Agendada", cls: "status-info", badge: "badge-info" };
  }

  function makeClickable(el, onActivate) {
    if (!el || typeof onActivate !== "function") return;
    el.classList.add("is-clickable");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    if (!el.hasAttribute("role")) el.setAttribute("role", "button");

    const handler = (ev) => {
      if (ev.type === "keydown") {
        if (ev.key !== "Enter" && ev.key !== " ") return;
      }
      ev.preventDefault();
      onActivate();
    };

    el.addEventListener("click", handler);
    el.addEventListener("keydown", handler);
  }

  function navegarParaProntuario(pacienteId) {
    if (pacienteId) {
      localStorage.setItem("pep_paciente_id", String(pacienteId));
    }
    window.location.href = "./prontuario.html";
  }

  function renderAgenda({ consultas = [], pacientes = [] }) {
    const listEl = document.getElementById("agendaList");
    const emptyEl = document.getElementById("agendaEmpty");
    if (!listEl || !emptyEl) return;

    const hoje = new Date();
    const comData = consultas.filter((c) => parsePossivelData(c));
    const deHoje = comData.filter((c) => isSameDayLocal(parsePossivelData(c), hoje));

    const base = deHoje.length ? deHoje : consultas;
    const sorted = [...base].sort((a, b) => {
      const da = parsePossivelData(a)?.getTime() || 0;
      const db = parsePossivelData(b)?.getTime() || 0;
      return da - db;
    });

    const top = sorted.slice(0, 4);

    if (!top.length) {
      listEl.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";
    listEl.innerHTML = "";

    top.forEach((c) => {
      const st = statusConsulta(c);
      const item = document.createElement("div");
      item.className = `agenda-item ${st.cls}`;

      const time = document.createElement("div");
      time.className = "agenda-time";
      time.textContent = formatarHora(c);

      const main = document.createElement("div");
      main.className = "agenda-main";
      const strong = document.createElement("strong");
      strong.textContent = c?.pacienteNome || getPacienteNome(c?.pacienteId, pacientes);
      const span = document.createElement("span");
      span.textContent = c?.profissionalNome || c?.medico || c?.responsavel || "Atendimento";
      main.appendChild(strong);
      main.appendChild(span);

      const badge = document.createElement("span");
      badge.className = `badge ${st.badge}`;
      badge.textContent = st.label;

      item.appendChild(time);
      item.appendChild(main);
      item.appendChild(badge);
      listEl.appendChild(item);

      makeClickable(item, () => {
        if (c?.pacienteId) {
          navegarParaProntuario(c.pacienteId);
        } else {
          window.location.href = "./consultas.html";
        }
      });
    });
  }

  function renderAlertas({ triagensHoje = 0, consultasHoje = 0, leitosOcupados = 0 }) {
    setText("triagensHoje", triagensHoje);
    setText("alertaConsultas", consultasHoje);
    setText("alertaLeitos", leitosOcupados);

    document.querySelectorAll(".alerta-item.is-clickable").forEach((el) => {
      const href = el.getAttribute("data-href");
      if (!href) return;
      makeClickable(el, () => {
        window.location.href = href;
      });
    });
  }

  function montarPontosAtencao({ triagens = [], evolucoes = [], pacientes = [] }) {
    const listEl = document.getElementById("pontosAtencaoList");
    if (!listEl) return;

    const PRIORIDADE_PESO = { critico: 3, atencao: 2, observacao: 1 };
    const alertas = [];
    const alertaSet = new Set();

    function pushAlerta(a) {
      const key = `${a.prioridade}|${a.origem}|${a.paciente}|${a.motivo}`;
      if (alertaSet.has(key)) return;
      alertaSet.add(key);
      alertas.push(a);
    }

    // ---------- Triagens ----------
    triagens.forEach((t) => {
      const nome = t?.pacienteNome || getPacienteNome(t?.pacienteId, pacientes);
      const data = parsePossivelData(t);
      const ts = data ? data.getTime() : 0;

      const temp = parseNumeroFlex(t?.temp);
      if (temp !== null) {
        if (temp >= 38.5) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Hipertermia importante",
            origem: "Triagem",
            ts,
          });
        } else if (temp >= 37.8) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Hipertermia",
            origem: "Triagem",
            ts,
          });
        } else if (temp <= 35) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Hipotermia importante",
            origem: "Triagem",
            ts,
          });
        } else if (temp <= 35.9) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Hipotermia",
            origem: "Triagem",
            ts,
          });
        }
      }

      const sat = parseNumeroFlex(t?.saturacao);
      if (sat !== null && sat < 92) {
        pushAlerta({
          prioridade: "critico",
          paciente: nome,
          motivo: "Saturação baixa",
          origem: "Triagem",
          ts,
        });
      }

      const hgt = parseNumeroFlex(t?.hgt);
      if (hgt !== null) {
        if (hgt <= 70) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Glicemia baixa",
            origem: "Triagem",
            ts,
          });
        } else if (hgt >= 250) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Glicemia elevada",
            origem: "Triagem",
            ts,
          });
        }
      }

      const pa = parsePA(t?.pa);
      if (
        (Number.isFinite(pa.sistolica) && pa.sistolica >= 160) ||
        (Number.isFinite(pa.diastolica) && pa.diastolica >= 100)
      ) {
        pushAlerta({
          prioridade: "atencao",
          paciente: nome,
          motivo: "Pressão arterial elevada",
          origem: "Triagem",
          ts,
        });
      }
      if (
        (Number.isFinite(pa.sistolica) && pa.sistolica <= 80) ||
        (Number.isFinite(pa.diastolica) && pa.diastolica <= 50)
      ) {
        pushAlerta({
          prioridade: "critico",
          paciente: nome,
          motivo: "Pressão arterial baixa",
          origem: "Triagem",
          ts,
        });
      } else if (
        (Number.isFinite(pa.sistolica) && pa.sistolica <= 90) ||
        (Number.isFinite(pa.diastolica) && pa.diastolica <= 60)
      ) {
        pushAlerta({
          prioridade: "atencao",
          paciente: nome,
          motivo: "Pressão arterial baixa",
          origem: "Triagem",
          ts,
        });
      }

      const fc = parseNumeroFlex(t?.fc);
      if (fc !== null) {
        if (fc >= 130) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Frequência cardíaca alta",
            origem: "Triagem",
            ts,
          });
        } else if (fc >= 110) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Frequência cardíaca alta",
            origem: "Triagem",
            ts,
          });
        } else if (fc <= 40) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Frequência cardíaca baixa",
            origem: "Triagem",
            ts,
          });
        } else if (fc <= 49) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Frequência cardíaca baixa",
            origem: "Triagem",
            ts,
          });
        }
      }

      const fr = parseNumeroFlex(t?.fr);
      if (fr !== null) {
        if (fr >= 30) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Frequência respiratória alta",
            origem: "Triagem",
            ts,
          });
        } else if (fr >= 25) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Frequência respiratória alta",
            origem: "Triagem",
            ts,
          });
        } else if (fr <= 8) {
          pushAlerta({
            prioridade: "critico",
            paciente: nome,
            motivo: "Frequência respiratória baixa",
            origem: "Triagem",
            ts,
          });
        } else if (fr <= 11) {
          pushAlerta({
            prioridade: "atencao",
            paciente: nome,
            motivo: "Frequência respiratória baixa",
            origem: "Triagem",
            ts,
          });
        }
      }
    });

    // ---------- Evolues ----------
    const regras = [
      { termo: "pcr", motivo: "Parada cardiorrespiratória", prioridade: "critico" },
      { termo: "parada cardiaca", motivo: "Parada cardíaca", prioridade: "critico" },
      { termo: "parada respiratoria", motivo: "Parada respiratória", prioridade: "critico" },
      { termo: "inconsciente", motivo: "Inconsciência", prioridade: "critico" },
      { termo: "sincope", motivo: "Síncope", prioridade: "critico" },
      { termo: "desmaio", motivo: "Desmaio", prioridade: "critico" },
      { termo: "tracionamento de sne", motivo: "Tração de SNE", prioridade: "critico" },
      { termo: "tracionamento de sonda", motivo: "Tração de sonda", prioridade: "critico" },
      { termo: "tracionamento", motivo: "Tração de sonda", prioridade: "critico" },
      { termo: "tracuionamento", motivo: "Tração de sonda", prioridade: "critico" },
      { termo: "retirou sne", motivo: "Retirada de SNE", prioridade: "critico" },
      { termo: "retirada de sne", motivo: "Retirada de SNE", prioridade: "critico" },
      { termo: "retirada de sonda", motivo: "Retirada de sonda", prioridade: "critico" },
      { termo: "arrancou sne", motivo: "Arrancou SNE", prioridade: "critico" },
      { termo: "arrancou sonda", motivo: "Arrancou sonda", prioridade: "critico" },
      { termo: "sonda saiu", motivo: "Sonda saiu", prioridade: "critico" },
      { termo: "convuls", motivo: "Convulsão", prioridade: "critico" },
      { termo: "dispneia", motivo: "Dispneia", prioridade: "critico" },
      { termo: "falta de ar", motivo: "Falta de ar", prioridade: "critico" },
      { termo: "desconforto respiratorio", motivo: "Desconforto respiratrio", prioridade: "critico" },
      { termo: "broncoaspir", motivo: "Broncoaspiração", prioridade: "critico" },
      { termo: "aspiracao", motivo: "Aspiração", prioridade: "critico" },
      { termo: "engasg", motivo: "Engasgo", prioridade: "critico" },
      { termo: "rebaixamento", motivo: "Rebaixamento do nível de conscincia", prioridade: "critico" },
      { termo: "hipotens", motivo: "Hipotensão", prioridade: "critico" },
      { termo: "dor toracica", motivo: "Dor torácica", prioridade: "critico" },
      { termo: "dor no peito", motivo: "Dor no peito", prioridade: "critico" },
      { termo: "cianose", motivo: "Cianose", prioridade: "critico" },
      { termo: "sangramento", motivo: "Sangramento", prioridade: "critico" },
      { termo: "hemorrag", motivo: "Hemorragia", prioridade: "critico" },
      { termo: "hematemese", motivo: "Hematemese", prioridade: "critico" },
      { termo: "melena", motivo: "Melena", prioridade: "critico" },
      { termo: "febre alta", motivo: "Febre alta", prioridade: "critico" },
      { termo: "choque", motivo: "Sinais de choque", prioridade: "critico" },
      { termo: "sepse", motivo: "Suspeita de sepse", prioridade: "critico" },
      { termo: "septic", motivo: "Suspeita de sepse", prioridade: "critico" },
      { termo: "hipertens", motivo: "Hipertensão", prioridade: "atencao" },
      { termo: "pressao alta", motivo: "Pressão alta", prioridade: "atencao" },
      { termo: "pressao elevada", motivo: "Pressão elevada", prioridade: "atencao" },
      { termo: "pa alta", motivo: "PA alta", prioridade: "atencao" },
      { termo: "pa elevada", motivo: "PA elevada", prioridade: "atencao" },
      { termo: "queda", motivo: "Queda", prioridade: "atencao" },
      { termo: "trauma", motivo: "Trauma", prioridade: "atencao" },
      { termo: "fratura", motivo: "Suspeita de fratura", prioridade: "atencao" },
      { termo: "vomit", motivo: "Vômitos", prioridade: "atencao" },
      { termo: "diarreia", motivo: "Diarreia", prioridade: "atencao" },
      { termo: "dor abdominal", motivo: "Dor abdominal", prioridade: "atencao" },
      { termo: "cefaleia", motivo: "Cefaleia", prioridade: "atencao" },
      { termo: "tontura", motivo: "Tontura", prioridade: "atencao" },
      { termo: "hipoglic", motivo: "Hipoglicemia", prioridade: "critico" },
      { termo: "hiperglic", motivo: "Hiperglicemia", prioridade: "atencao" },
      { termo: "agressivo", motivo: "Comportamento agressivo", prioridade: "atencao" },
      { termo: "agitado", motivo: "Agitação", prioridade: "atencao" },
      { termo: "agressividade", motivo: "Agressividade", prioridade: "atencao" },
      { termo: "autoagress", motivo: "Autoagressão", prioridade: "atencao" },
      { termo: "fuga", motivo: "Tentativa de fuga", prioridade: "atencao" },
      { termo: "confus", motivo: "Confusão mental", prioridade: "atencao" },
      { termo: "delir", motivo: "Delírio", prioridade: "atencao" },
      { termo: "dor intensa", motivo: "Dor intensa", prioridade: "atencao" },
    ];

    evolucoes.forEach((e) => {
      const texto = normalizarTexto(e?.descricao || e?.evolucao || e?.texto || "");
      if (!texto) return;

      const nome = e?.pacienteNome || getPacienteNome(e?.pacienteId, pacientes);
      const data = parsePossivelData(e);
      const ts = data ? data.getTime() : 0;

      regras.forEach((r) => {
        if (texto.includes(r.termo)) {
          pushAlerta({
            prioridade: r.prioridade,
            paciente: nome,
            motivo: r.motivo,
            origem: "Evolução",
            ts,
          });
        }
      });

      // sinais vitais presentes na evoluo (quando houver)
      const temp = parseNumeroFlex(e?.temp);
      if (temp !== null) {
        if (temp >= 38.5) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Hipertermia importante", origem: "Evolução", ts });
        } else if (temp >= 37.8) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Hipertermia", origem: "Evolução", ts });
        } else if (temp <= 35) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Hipotermia importante", origem: "Evolução", ts });
        } else if (temp <= 35.9) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Hipotermia", origem: "Evolução", ts });
        }
      }

      const sat = parseNumeroFlex(e?.sat || e?.saturacao);
      if (sat !== null && sat < 92) {
        pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Saturação baixa", origem: "Evolução", ts });
      }

      const hgt = parseNumeroFlex(e?.hgt);
      if (hgt !== null) {
        if (hgt <= 70) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Glicemia baixa", origem: "Evolução", ts });
        } else if (hgt >= 250) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Glicemia elevada", origem: "Evolução", ts });
        }
      }

      const pa = parsePA(e?.pa);
      if (
        (Number.isFinite(pa.sistolica) && pa.sistolica >= 160) ||
        (Number.isFinite(pa.diastolica) && pa.diastolica >= 100)
      ) {
        pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Pressão arterial elevada", origem: "Evolução", ts });
      }
      if (
        (Number.isFinite(pa.sistolica) && pa.sistolica <= 80) ||
        (Number.isFinite(pa.diastolica) && pa.diastolica <= 50)
      ) {
        pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Pressão arterial baixa", origem: "Evolução", ts });
      } else if (
        (Number.isFinite(pa.sistolica) && pa.sistolica <= 90) ||
        (Number.isFinite(pa.diastolica) && pa.diastolica <= 60)
      ) {
        pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Pressão arterial baixa", origem: "Evolução", ts });
      }

      const fc = parseNumeroFlex(e?.fc);
      if (fc !== null) {
        if (fc >= 130) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Frequência cardíaca alta", origem: "Evolução", ts });
        } else if (fc >= 110) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Frequência cardíaca alta", origem: "Evolução", ts });
        } else if (fc <= 40) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Frequência cardíaca baixa", origem: "Evolução", ts });
        } else if (fc <= 49) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Frequência cardíaca baixa", origem: "Evolução", ts });
        }
      }

      const fr = parseNumeroFlex(e?.fr);
      if (fr !== null) {
        if (fr >= 30) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Frequência respiratória alta", origem: "Evolução", ts });
        } else if (fr >= 25) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Frequência respiratória alta", origem: "Evolução", ts });
        } else if (fr <= 8) {
          pushAlerta({ prioridade: "critico", paciente: nome, motivo: "Frequência respiratória baixa", origem: "Evolução", ts });
        } else if (fr <= 11) {
          pushAlerta({ prioridade: "atencao", paciente: nome, motivo: "Frequência respiratória baixa", origem: "Evolução", ts });
        }
      }
    });

    if (!alertas.length) {
      listEl.innerHTML = `<div class="empty-state">Nenhum ponto de atenção no momento.</div>`;
      return;
    }

    alertas.sort((a, b) => {
      const p = (PRIORIDADE_PESO[b.prioridade] || 0) - (PRIORIDADE_PESO[a.prioridade] || 0);
      if (p !== 0) return p;
      return (b.ts || 0) - (a.ts || 0);
    });

    const top = alertas.slice(0, 5);
    listEl.innerHTML = "";

    top.forEach((a) => {
      const item = document.createElement("div");
      item.className = "ponto-item";

      const badge = document.createElement("span");
      badge.className = `ponto-badge ${a.prioridade}`;
      badge.textContent = a.prioridade === "critico"
        ? "Crítico"
        : a.prioridade === "atencao"
          ? "Atenção"
          : "Observação";

      const info = document.createElement("div");
      info.className = "ponto-info";
      const strong = document.createElement("strong");
      strong.textContent = a.paciente || "Paciente";
      const span = document.createElement("span");
      span.textContent = a.motivo || "-";
      info.appendChild(strong);
      info.appendChild(span);

      const origem = document.createElement("div");
      origem.className = "ponto-origem";
      origem.textContent = a.origem || "";

      item.appendChild(badge);
      item.appendChild(info);
      item.appendChild(origem);
      listEl.appendChild(item);

      makeClickable(item, () => {
        if (a?.pacienteId) {
          navegarParaProntuario(a.pacienteId);
        } else {
          window.location.href = "./prontuario.html";
        }
      });
    });
  }

  function aplicarTravasUI() {
    const role = String(localStorage.getItem("auth_role") || "").trim().toLowerCase();
    const isAdmin = role === "admin";

    document.querySelectorAll(".admin-only").forEach((el) => {
      if (!isAdmin) {
        el.classList.add("is-disabled");
        el.setAttribute("aria-disabled", "true");
        if (!el.dataset.guardApplied) {
          el.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
          });
          el.dataset.guardApplied = "1";
        }
      } else {
        el.classList.remove("is-disabled");
        el.removeAttribute("aria-disabled");
      }
    });
  }

  // ---------------------------
  // Cards
  // ---------------------------
  async function atualizarCards() {
    // fallbackKeys:
    // - pacientes: compat com chaves antigas caso existam
    // - triagens: você já usa API, mas existiam caches locais
    // - consultas: "consultas_v1" é seu padrão
    // - leitos: "leitos_v1" é seu padrão
    const role = String(localStorage.getItem("auth_role") || "").trim().toLowerCase();
    const isAdmin = role === "admin";

    const [pacientes, triagens, consultas, leitos, funcionarios] = await Promise.all([
  apiGetArray("/api/pacientes", ["pacientes_cache_v1", "pacientes_lista_v1"]),
  apiGetArray("/api/triagens", ["triagens_lista_v1"]),
  apiGetArray("/api/consultas", ["consultas_v1"]),
  apiGetArray("/api/leitos", ["leitos_v1"]),
  isAdmin ? apiGetArray("/api/funcionarios", ["funcionarios"]) : Promise.resolve(lsArray("funcionarios")),
]);

const evolucoes = lsArray("evolucoes_cache_v1");

    const evolucoesAll = Array.isArray(evolucoes) && evolucoes.length
      ? evolucoes
      : lsEvolucoesAll();

    const leitosOcupados = (Array.isArray(leitos) ? leitos : []).filter(
      (l) =>
        l &&
        (l.ocupado === true ||
          String(l.status || "").toLowerCase() === "ocupado")
    ).length;

    const triagensHoje = contarHoje(triagens);
    const consultasHoje = contarHoje(consultas);

    setText("pacientesTotal", Array.isArray(pacientes) ? pacientes.length : 0);
    setText(
      "triagensHoje",
      triagensHoje === null
        ? (Array.isArray(triagens) ? triagens.length : 0)
        : triagensHoje
    );
    setText(
      "consultasHoje",
      consultasHoje === null
        ? (Array.isArray(consultas) ? consultas.length : 0)
        : consultasHoje
    );
    setText("leitosOcupadosCard", leitosOcupados);

    renderAgenda({
      consultas: Array.isArray(consultas) ? consultas : [],
      pacientes: Array.isArray(pacientes) ? pacientes : [],
    });

    renderAlertas({
      triagensHoje: triagensHoje === null ? (Array.isArray(triagens) ? triagens.length : 0) : triagensHoje,
      consultasHoje: consultasHoje === null ? (Array.isArray(consultas) ? consultas.length : 0) : consultasHoje,
      leitosOcupados,
    });

    montarPontosAtencao({
      triagens: Array.isArray(triagens) ? triagens : [],
      evolucoes: Array.isArray(evolucoesAll) ? evolucoesAll : [],
      pacientes: Array.isArray(pacientes) ? pacientes : [],
    });

    setText("resumoPacientes", Array.isArray(pacientes) ? pacientes.length : 0);
    setText(
      "resumoConsultas",
      consultasHoje === null
        ? (Array.isArray(consultas) ? consultas.length : 0)
        : consultasHoje
    );
    setText(
      "resumoTriagens",
      triagensHoje === null
        ? (Array.isArray(triagens) ? triagens.length : 0)
        : triagensHoje
    );
    setText("resumoAtendimento", leitosOcupados);

    setText("funcionariosAtivos", Array.isArray(funcionarios) ? funcionarios.length : 0);
  }

  // ---------------------------
  // Gráfico demo (Chart.js)
  // ---------------------------
  let graficoLeitosChart = null;

  function montarGraficoDemo() {
    const canvas = document.getElementById("graficoLeitos");
    if (!canvas) return;

    if (typeof Chart === "undefined") {
      console.warn("[Dashboard] Chart.js não encontrado. Gráfico não será renderizado.");
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ? se já existe gráfico, destrói antes de recriar
    if (graficoLeitosChart) {
      try {
        graficoLeitosChart.destroy();
      } catch {}
      graficoLeitosChart = null;
    }

    graficoLeitosChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
        datasets: [
          {
            label: "Leitos Ocupados",
            data: [20, 22, 21, 23, 19, 20, 23],
            borderColor: "#0A66C2",
            backgroundColor: "rgba(10,102,194,0.2)",
            tension: 0.3,
            fill: true,
            pointRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 30 } },
      },
    });
  }

  // ---------------------------
  // Init
  // ---------------------------
  let jaInicializou = false;

  async function init() {
    // ? evita init duplicado (Live Server, scripts duplicados, etc.)
    if (jaInicializou) return;
    jaInicializou = true;

    aplicarTravasUI();
    await atualizarCards();
    montarGraficoDemo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
