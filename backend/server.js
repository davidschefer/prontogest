// ================================
// server.js — Mini SGH
// ================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
if (!JWT_SECRET) {
  console.error("JWT_SECRET não definido");
  process.exit(1);
}
const MODO_DEMO = String(process.env.MODO_DEMO || "false").trim().toLowerCase() === "true";

// ================================
// Middlewares globais
// ================================

app.use(express.json());

// Servir arquivos estáticos (HTML, CSS, JS, IMG)
app.use("/Html", express.static(path.join(__dirname, "..", "Html")));
app.use("/Css", express.static(path.join(__dirname, "..", "Css")));
app.use("/Js", express.static(path.join(__dirname, "..", "Js")));
app.use("/img", express.static(path.join(__dirname, "..", "img"))); // 🔥 NOVO

// CORS (Live Server / portas diferentes)
app.use(
  cors({
    origin: [
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
  })
);

// ================================
// "Banco de dados" temporário (memória)
// (depois será substituído por MySQL)
// ================================

// ✅ Entidade já existente (em uso)
const pacientes = [];

// ✅ Entidades agora em uso via API (memória)
const triagens = [];
const prescricoes = []; // /api/prescricoes
const leitos = []; // /api/leitos (10 default)
const agendamentos = []; // /api/consultas (agenda)
const faturamentos = []; // /api/faturas
const funcionarios = []; // /api/funcionarios (admin)
const estoqueMovimentacoes = []; // /api/farmacia/movimentos
const estoque = {}; // /api/farmacia/estoque  (obj { "Dipirona": 10 })
const estoqueByClinica = {}; // estoque separado por clinica_id (mantÃ©m default em "estoque")
const medicamentosPadrao = []; // /api/medicamentos-padrao (lista)

// (mantidos como placeholders)
const prontuarios = [];
const medicamentos = [];
const DB_ENABLED = db.enabled;
const DEFAULT_CLINICA_ID = "default";

const dbClinicaCols = {
  pacientes: false,
  triagens: false,
  prescricoes: false,
  usuarios: false,
  leitos: false,
  consultas: false,
  faturas: false,
  farmacia_estoque: false,
  farmacia_movimentos: false,
  medicamentos_padrao: false,
  pep_patologias: false,
  pep_vitais: false,
  pep_medicamentos: false,
  pep_documentos: false,
  pep_evolucoes: false,
  auditoria: false,
};

function normalizeClinicaId(v) {
  const id = String(v || "").trim();
  return id || "";
}

function getClinicaIdFromReq(req) {
  const id = normalizeClinicaId(req?.user?.clinica_id);
  return id || DEFAULT_CLINICA_ID;
}

function isClinicaMatch(item, clinicaId) {
  const itemId = normalizeClinicaId(item?.clinica_id) || DEFAULT_CLINICA_ID;
  return itemId === clinicaId;
}

function attachClinicaId(item, clinicaId) {
  const cid = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
  if (!item.clinica_id) item.clinica_id = cid;
  return item;
}

function findIndexByClinica(list, id, clinicaId) {
  const pid = String(id || "").trim();
  return list.findIndex(
    (x) => String(x?.id || "") === pid && isClinicaMatch(x, clinicaId)
  );
}

function getPacientes(req) {
  const clinica_id = getClinicaIdFromReq(req);
  return pacientes.filter((p) => isClinicaMatch(p, clinica_id));
}

function addPaciente(req, item) {
  const clinica_id = getClinicaIdFromReq(req);
  const novo = attachClinicaId({ ...item }, clinica_id);
  pacientes.push(novo);
  return novo;
}

function updatePaciente(req, id, updater) {
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(pacientes, id, clinica_id);
  if (idx === -1) return null;
  const updated = updater({ ...pacientes[idx] });
  attachClinicaId(updated, clinica_id);
  pacientes[idx] = updated;
  return updated;
}

function getTriagens(req) {
  const clinica_id = getClinicaIdFromReq(req);
  return triagens.filter((t) => isClinicaMatch(t, clinica_id));
}

function addTriagem(req, item) {
  const clinica_id = getClinicaIdFromReq(req);
  const novo = attachClinicaId({ ...item }, clinica_id);
  triagens.push(novo);
  return novo;
}

function getPrescricoes(req) {
  const clinica_id = getClinicaIdFromReq(req);
  return prescricoes.filter((p) => isClinicaMatch(p, clinica_id));
}

function addPrescricao(req, item) {
  const clinica_id = getClinicaIdFromReq(req);
  const novo = attachClinicaId({ ...item }, clinica_id);
  prescricoes.unshift(novo);
  return novo;
}

function getFuncionarios(req) {
  const clinica_id = getClinicaIdFromReq(req);
  return funcionarios.filter((f) => isClinicaMatch(f, clinica_id));
}

function addFuncionario(req, item) {
  const clinica_id = getClinicaIdFromReq(req);
  const novo = attachClinicaId({ ...item }, clinica_id);
  funcionarios.unshift(novo);
  return novo;
}

function getEstoqueForClinicaId(clinicaId) {
  const cid = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
  if (cid === DEFAULT_CLINICA_ID) return estoque;
  if (!estoqueByClinica[cid]) estoqueByClinica[cid] = {};
  return estoqueByClinica[cid];
}

function getEstoqueFromReq(req) {
  const clinica_id = getClinicaIdFromReq(req);
  return getEstoqueForClinicaId(clinica_id);
}

function clearEstoqueObject(obj) {
  Object.keys(obj || {}).forEach((k) => delete obj[k]);
}

async function detectClinicaColumns() {
  if (!DB_ENABLED) return;
  const dbName = String(process.env.MYSQL_DATABASE || "").trim();
  if (!dbName) return;

  const tables = [
    "pacientes",
    "triagens",
    "prescricoes",
    "usuarios",
    "leitos",
    "consultas",
    "faturas",
    "farmacia_estoque",
    "farmacia_movimentos",
    "medicamentos_padrao",
    "pep_patologias",
    "pep_vitais",
    "pep_medicamentos",
    "pep_documentos",
    "pep_evolucoes",
    "auditoria",
  ];
  for (const t of tables) {
    try {
      const rows = await db.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'clinica_id'",
        [dbName, t]
      );
      dbClinicaCols[t] = Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      console.warn("DB: falha ao detectar clinica_id em", t, e?.message || e);
    }
  }
}

function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function safeJsonStringify(v) {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "";
  }
}

function sanitizeFuncionarioOutput(item) {
  if (!item || typeof item !== "object") return item;
  const { senha, ...safeItem } = item;
  return safeItem;
}

async function dbUpsert(table, obj, fields) {
  if (!DB_ENABLED) return;
  const cols = fields.join(",");
  const placeholders = fields.map(() => "?").join(",");
  const updates = fields
    .filter((f) => f !== "id")
    .map((f) => `${f}=VALUES(${f})`)
    .join(",");
  const values = fields.map((f) => (obj[f] !== undefined ? obj[f] : null));
  const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  await db.query(sql, values);
}

async function dbDelete(table, id) {
  if (!DB_ENABLED) return;
  await db.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

async function dbDeleteScoped(table, id, clinicaId) {
  if (!DB_ENABLED) return;
  if (dbClinicaCols[table]) {
    const cid = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
    await db.query(`DELETE FROM ${table} WHERE id = ? AND clinica_id = ?`, [
      id,
      cid,
    ]);
    return;
  }
  await dbDelete(table, id);
}

// ================================
// ✅ AUDITORIA (MVP) — em memória
// (depois vira tabela MySQL)
// ================================

const auditoria = [];
const AUDITORIA_MAX = 3000;

function auditNowISO() {
  return new Date().toISOString();
}

function auditGetClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "unknown";
}

function auditMakeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function auditAdd(req, evento) {
  try {
    const usuarioDoToken =
      req?.user?.email || req?.user?.userEmail || req?.user?.sub || "não identificado";
    const roleDoToken = req?.user?.role || req?.user?.perfil || "desconhecido";
    const clinica_id = getClinicaIdFromReq(req);

    const item = {
      id: auditMakeId(),
      clinica_id,
      atISO: auditNowISO(),
      ip: auditGetClientIp(req),
      ua: String(req.headers["user-agent"] || ""),

      // Quem (pode vir do token, ou forçado pelo evento)
      usuario: evento?.usuario ? String(evento.usuario) : String(usuarioDoToken),
      role: evento?.role ? String(evento.role) : String(roleDoToken),

      // O quê
      acao: String(evento?.acao || "acao_desconhecida"),
      entidade: String(evento?.entidade || "sistema"),
      entidadeId: evento?.entidadeId != null ? String(evento.entidadeId) : "",

      // Contexto
      metodo: String(req.method || ""),
      rota: String(req.originalUrl || req.url || ""),
      ok: Boolean(evento?.ok !== false),
      detalhe: String(evento?.detalhe || ""),

      // Meta (não colocar dados sensíveis)
      meta: evento?.meta && typeof evento.meta === "object" ? evento.meta : {},
    };

    auditoria.unshift(item);
    if (auditoria.length > AUDITORIA_MAX) auditoria.length = AUDITORIA_MAX;

    if (DB_ENABLED) {
      const itemDb = { ...item, meta: safeJsonStringify(item.meta) };
      const fields = [
        "id",
        "clinica_id",
        "atISO",
        "ip",
        "ua",
        "usuario",
        "role",
        "acao",
        "entidade",
        "entidadeId",
        "metodo",
        "rota",
        "ok",
        "detalhe",
        "meta",
      ];
      if (!dbClinicaCols.auditoria) {
        const idx = fields.indexOf("clinica_id");
        if (idx !== -1) fields.splice(idx, 1);
        delete itemDb.clinica_id;
      }
      dbUpsert("auditoria", itemDb, fields).catch((e) => {
        console.warn("DB: falha ao registrar auditoria:", e?.message || e);
      });
    }
  } catch (e) {
    console.warn("Falha ao registrar auditoria:", e?.message || e);
  }
}

// Gerador simples de ID
function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}


// ================================
// Helpers de autenticação
// ================================

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    // ✅ AUDITORIA: token ausente (tentativa de acesso)
    auditAdd(req, {
      acao: "auth_fail",
      entidade: "auth",
      detalhe: "Token ausente",
      ok: false,
      meta: { motivo: "token_ausente" },
    });

    return res.status(401).json({ ok: false, message: "Token ausente." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload || {};
    if (!req.user.clinica_id) {
      req.user.clinica_id = DEFAULT_CLINICA_ID;
    }
    return next();
  } catch (err) {
    // ✅ AUDITORIA: token inválido/expirado
    auditAdd(req, {
      acao: "auth_fail",
      entidade: "auth",
      detalhe: "Token inválido/expirado",
      ok: false,
      meta: { motivo: "token_invalido_ou_expirado" },
    });

    return res
      .status(401)
      .json({ ok: false, message: "Token inválido/expirado." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      // ✅ AUDITORIA: acesso negado por role
      auditAdd(req, {
        acao: "forbidden",
        entidade: "auth",
        detalhe: "Acesso negado por role",
        ok: false,
        meta: { roleAtual: String(role || ""), rolesPermitidos: roles },
      });

      return res.status(403).json({ ok: false, message: "Acesso negado." });
    }
    return next();
  };
}

// ================================
// Helpers gerais
// ================================

function parseNumeroFlex(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pacienteExistePorId(pacienteId, clinicaId) {
  const pid = String(pacienteId || "").trim();
  if (!pid) return false;
  if (clinicaId) {
    return pacientes.some(
      (p) => p.id === pid && isClinicaMatch(p, String(clinicaId))
    );
  }
  return pacientes.some((p) => p.id === pid);
}

function ordenarDescPorISO(fieldISO, fallbackField) {
  return (a, b) => {
    const da = new Date(a?.[fieldISO] || a?.[fallbackField] || 0).getTime();
    const db = new Date(b?.[fieldISO] || b?.[fallbackField] || 0).getTime();
    return db - da;
  };
}

// ================================
// Helpers Login (NOVO) — funcionários em memória
// ================================

function normalizarEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function findFuncionarioByCredenciais(email, senha) {
  const em = normalizarEmail(email);
  const pw = String(senha || "");
  return funcionarios.find(
    (f) => normalizarEmail(f?.email) === em && String(f?.senha || "") === pw
  );
}

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_TENTATIVAS = 5;
const loginRateLimit = new Map();

function loginRateLimitKey(req, email) {
  const ip = auditGetClientIp(req);
  const em = normalizarEmail(email);
  return `${ip}::${em}`;
}

function loginRateLimitGet(req, email) {
  const key = loginRateLimitKey(req, email);
  const now = Date.now();
  const atual = loginRateLimit.get(key);
  if (!atual) return { key, blocked: false, tentativas: 0 };
  if (now - atual.firstAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginRateLimit.delete(key);
    return { key, blocked: false, tentativas: 0 };
  }
  return {
    key,
    blocked: atual.tentativas >= LOGIN_RATE_LIMIT_MAX_TENTATIVAS,
    tentativas: atual.tentativas,
  };
}

function loginRateLimitFail(req, email) {
  const key = loginRateLimitKey(req, email);
  const now = Date.now();
  const atual = loginRateLimit.get(key);
  if (!atual || now - atual.firstAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginRateLimit.set(key, { tentativas: 1, firstAt: now });
    return;
  }
  atual.tentativas += 1;
  loginRateLimit.set(key, atual);
}

function loginRateLimitClear(req, email) {
  const key = loginRateLimitKey(req, email);
  loginRateLimit.delete(key);
}

// ================================
// ✅ Helpers Profissional Snapshot (NOVO)
// - usado para "carimbar" triagem na criação (POST)
// ================================

function findFuncionarioByEmail(email) {
  const em = String(email || "").trim().toLowerCase();
  return (
    funcionarios.find((f) => String(f?.email || "").trim().toLowerCase() === em) ||
    null
  );
}

function attachProfSnapshotFromReqUser(req, target) {
  const emailLogado = String(req.user?.email || "").trim().toLowerCase();
  const func = findFuncionarioByEmail(emailLogado);

  target.profissionalEmail = emailLogado;

  if (func) {
    target.profissionalNome = String(func.nome || "");
    target.profissionalOrgao = String(func.orgao || "");
    target.profissionalRegistro = String(func.registro || "");
    target.profissionalCarimbo = func.assinaturaDataUrl
      ? String(func.assinaturaDataUrl)
      : "";
  } else {
    // para admin fixo / func fixo (caso não exista no array funcionarios)
    target.profissionalNome = "";
    target.profissionalOrgao = "";
    target.profissionalRegistro = "";
    target.profissionalCarimbo = "";
  }
}

// ================================
// Rotas públicas
// ================================

app.get("/", (req, res) => {
  res.send("🚀 Servidor Mini SGH rodando com sucesso!");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ================================
// Autenticação (login)
// ================================

app.post("/api/login", (req, res) => {
  const { email, senha } = req.body || {};

  if (!email || !senha) {
    return res
      .status(400)
      .json({ ok: false, message: "Informe email e senha." });
  }

  const emailNorm = normalizarEmail(email);
  const senhaStr = String(senha);
  const rateLimitStatus = loginRateLimitGet(req, emailNorm);

  if (rateLimitStatus.blocked) {
    auditAdd(req, {
      acao: "login_block",
      entidade: "auth",
      detalhe: "Tentativas excedidas no login",
      usuario: String(emailNorm || ""),
      role: "desconhecido",
      ok: false,
      meta: { email: String(emailNorm || "") },
    });

    return res.status(429).json({
      ok: false,
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
    });
  }

  // 1) Admin fixo (MVP)
  if (MODO_DEMO && emailNorm === "admin@oaa.com" && senhaStr === "123456") {
    const role = "admin";
    const clinica_id = DEFAULT_CLINICA_ID;
    const id = "admin";

    const token = jwt.sign({ email: emailNorm, role, clinica_id, id }, JWT_SECRET, {
      expiresIn: "8h",
    });
    loginRateLimitClear(req, emailNorm);

    // ✅ AUDITORIA: login OK
    auditAdd(req, {
      acao: "login",
      entidade: "auth",
      detalhe: "Login efetuado com sucesso (admin fixo)",
      usuario: String(emailNorm),
      role: String(role),
      meta: { email: String(emailNorm), role: String(role) },
    });

    return res.json({
      ok: true,
      role,
      email: emailNorm,
      token,
      clinica_id,
      id,

      // dados para UI (opcional)
      nome: "Administrador",
      orgao: "",
      registro: "",
      carimbo: null,
    });
  }

  // 2) Funcionário fixo (MVP antigo) — mantém compatibilidade
  if (MODO_DEMO && emailNorm === "func@oaa.com" && senhaStr === "123456") {
    const role = "funcionario";
    const clinica_id = DEFAULT_CLINICA_ID;
    const id = "funcionario_fix";

    const token = jwt.sign({ email: emailNorm, role, clinica_id, id }, JWT_SECRET, {
      expiresIn: "8h",
    });
    loginRateLimitClear(req, emailNorm);

    auditAdd(req, {
      acao: "login",
      entidade: "auth",
      detalhe: "Login efetuado com sucesso (funcionário fixo)",
      usuario: String(emailNorm),
      role: String(role),
      meta: { email: String(emailNorm), role: String(role) },
    });

    return res.json({
      ok: true,
      role,
      email: emailNorm,
      token,

      // dados para UI (opcional)
      nome: "Funcionário",
      orgao: "",
      registro: "",
      carimbo: null,
    });
  }

  // 3) Funcionários cadastrados via /api/funcionarios (memória)
  const func = findFuncionarioByCredenciais(emailNorm, senhaStr);

  if (func) {
    if (String(func.status || "").toLowerCase() === "inativo") {
      loginRateLimitFail(req, emailNorm);
      return res
        .status(403)
        .json({ ok: false, message: "UsuÃ¡rio inativo." });
    }

    const role = String(func.role || "funcionario").trim() || "funcionario";
    const clinica_id = normalizeClinicaId(func.clinica_id) || DEFAULT_CLINICA_ID;
    const id = String(func.id || "");

    const token = jwt.sign({ email: emailNorm, role, clinica_id, id }, JWT_SECRET, {
      expiresIn: "8h",
    });
    loginRateLimitClear(req, emailNorm);

    // ✅ AUDITORIA: login OK
    auditAdd(req, {
      acao: "login",
      entidade: "auth",
      detalhe: "Login efetuado com sucesso (funcionário cadastrado)",
      usuario: String(emailNorm),
      role: String(role),
      meta: {
        email: String(emailNorm),
        role: String(role),
        funcionarioId: String(func.id || ""),
      },
    });

    return res.json({
      ok: true,
      role,
      email: emailNorm,
      token,
      clinica_id,
      id,

      // ✅ dados profissionais para UI/PEP
      nome: String(func.nome || ""),
      orgao: String(func.orgao || ""),
      registro: String(func.registro || ""),
      carimbo: func.assinaturaDataUrl ? String(func.assinaturaDataUrl) : null,
    });
  }

  // ✅ AUDITORIA: login falhou (não grava senha)
  auditAdd(req, {
    acao: "login_fail",
    entidade: "auth",
    detalhe: "Tentativa de login com credenciais inválidas",
    usuario: String(emailNorm || ""),
    role: "desconhecido",
    ok: false,
    meta: { email: String(emailNorm || "") },
  });
  loginRateLimitFail(req, emailNorm);

  return res
    .status(401)
    .json({ ok: false, message: "Credenciais inválidas." });
});

// ================================
// Rotas protegidas (exemplos)
// ================================

app.get("/api/me", authRequired, (req, res) => {
  auditAdd(req, {
    acao: "read",
    entidade: "auth",
    detalhe: "Consulta de sessão (/api/me)",
    meta: { usuario: req.user?.email || "" },
  });

  res.json({ ok: true, user: req.user });
});

app.get("/api/admin/area", authRequired, requireRole("admin"), (req, res) => {
  auditAdd(req, {
    acao: "read",
    entidade: "admin_area",
    detalhe: "Acesso à área admin",
  });

  res.json({ ok: true, message: "Área admin liberada." });
});

// ================================
// ✅ AUDITORIA — rota admin
// ================================

app.get("/api/auditoria", authRequired, requireRole("admin"), (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const limit = Math.min(Number(req.query.limit || 200), 1000);
  const acao = String(req.query.acao || "").trim().toLowerCase();
  const entidade = String(req.query.entidade || "").trim().toLowerCase();
  const usuario = String(req.query.usuario || "").trim().toLowerCase();

  let items = auditoria.filter((x) => isClinicaMatch(x, clinica_id));

  if (acao) items = items.filter((x) => String(x.acao).toLowerCase() === acao);
  if (entidade)
    items = items.filter((x) => String(x.entidade).toLowerCase() === entidade);
  if (usuario)
    items = items.filter((x) => String(x.usuario).toLowerCase().includes(usuario));

  auditAdd(req, {
    acao: "read",
    entidade: "auditoria",
    detalhe: "Consulta de auditoria",
    meta: { limit, acao, entidade, usuario },
  });

  return res.json({ ok: true, items: items.slice(0, limit) });
});

// ================================
// ROTAS DE PACIENTES
// ================================

app.post("/api/pacientes", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const {
    nome,
    cpf,
    nascimento,
    telefone,

    telefoneFamiliar,
    familiarResponsavel,

    convenio,
    planoSaude,
    endereco,
  } = req.body || {};

  if (!nome || String(nome).trim().length < 3) {
    return res.status(400).json({ ok: false, error: "Nome inválido" });
  }

  if (cpf) {
    const cpfTrim = String(cpf).trim();
    const existe = pacientes.some((p) => p.cpf === cpfTrim);
    if (existe) {
      return res.status(409).json({ ok: false, error: "CPF já cadastrado" });
    }
  }

  const end = endereco && typeof endereco === "object" ? endereco : {};

  const novo = {
    id: makeId(),
    clinica_id,
    nome: String(nome).trim(),
    cpf: cpf ? String(cpf).trim() : "",
    nascimento: nascimento ? String(nascimento).trim() : "",
    telefone: telefone ? String(telefone).trim() : "",

    telefoneFamiliar: telefoneFamiliar ? String(telefoneFamiliar).trim() : "",
    familiarResponsavel: familiarResponsavel
      ? String(familiarResponsavel).trim()
      : "",

    convenio: convenio ? String(convenio).trim() : "",
    planoSaude: planoSaude ? String(planoSaude).trim() : "",

    endereco: {
      rua: end.rua ? String(end.rua).trim() : "",
      numero: end.numero ? String(end.numero).trim() : "",
      complemento: end.complemento ? String(end.complemento).trim() : "",
      cidade: end.cidade ? String(end.cidade).trim() : "",
      estado: end.estado ? String(end.estado).trim() : "",
      cep: end.cep ? String(end.cep).trim() : "",
    },

    createdAt: new Date().toISOString(),
  };

  const created = addPaciente(req, novo);
  if (DB_ENABLED) {
    try {
      await persistPaciente(created);
    } catch (e) {
      console.warn("DB: falha ao salvar paciente:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "pacientes",
    entidadeId: created.id,
    detalhe: "Paciente criado",
    meta: { nome: created.nome, cpf: created.cpf ? "informado" : "" },
  });

  return res.status(201).json({ ok: true, paciente: created });
});

app.get("/api/pacientes", authRequired, (req, res) => {
  const lista = getPacientes(req);
  auditAdd(req, {
    acao: "read",
    entidade: "pacientes",
    detalhe: "Lista de pacientes",
    meta: { total: lista.length },
  });

  return res.json({ ok: true, pacientes: lista });
});

app.get("/api/pacientes/:id", authRequired, (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const paciente = pacientes.find(
    (p) => p.id === req.params.id && isClinicaMatch(p, clinica_id)
  );

  if (!paciente) {
    return res
      .status(404)
      .json({ ok: false, error: "Paciente não encontrado" });
  }

  auditAdd(req, {
    acao: "read",
    entidade: "pacientes",
    entidadeId: req.params.id,
    detalhe: "Paciente consultado por ID",
    meta: { nome: paciente?.nome || "" },
  });

  return res.json({ ok: true, paciente });
});

app.put("/api/pacientes/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(pacientes, id, clinica_id);

  if (idx === -1) {
    return res
      .status(404)
      .json({ ok: false, error: "Paciente não encontrado" });
  }

  const body = req.body || {};
  const end =
    body.endereco && typeof body.endereco === "object" ? body.endereco : {};

  pacientes[idx] = {
    ...pacientes[idx],
    clinica_id: pacientes[idx].clinica_id || clinica_id,

    nome: body.nome ? String(body.nome).trim() : pacientes[idx].nome,
    cpf: body.cpf !== undefined ? String(body.cpf).trim() : pacientes[idx].cpf,
    nascimento:
      body.nascimento !== undefined
        ? String(body.nascimento).trim()
        : pacientes[idx].nascimento,
    telefone:
      body.telefone !== undefined
        ? String(body.telefone).trim()
        : pacientes[idx].telefone,

    telefoneFamiliar:
      body.telefoneFamiliar !== undefined
        ? String(body.telefoneFamiliar).trim()
        : pacientes[idx].telefoneFamiliar,
    familiarResponsavel:
      body.familiarResponsavel !== undefined
        ? String(body.familiarResponsavel).trim()
        : pacientes[idx].familiarResponsavel,

    convenio:
      body.convenio !== undefined
        ? String(body.convenio).trim()
        : pacientes[idx].convenio,
    planoSaude:
      body.planoSaude !== undefined
        ? String(body.planoSaude).trim()
        : pacientes[idx].planoSaude,

    endereco: {
      ...pacientes[idx].endereco,
      rua:
        end.rua !== undefined
          ? String(end.rua).trim()
          : pacientes[idx].endereco?.rua,
      numero:
        end.numero !== undefined
          ? String(end.numero).trim()
          : pacientes[idx].endereco?.numero,
      complemento:
        end.complemento !== undefined
          ? String(end.complemento).trim()
          : pacientes[idx].endereco?.complemento,
      cidade:
        end.cidade !== undefined
          ? String(end.cidade).trim()
          : pacientes[idx].endereco?.cidade,
      estado:
        end.estado !== undefined
          ? String(end.estado).trim()
          : pacientes[idx].endereco?.estado,
      cep:
        end.cep !== undefined
          ? String(end.cep).trim()
          : pacientes[idx].endereco?.cep,
    },

    updatedAt: new Date().toISOString(),
  };

  const updated = updatePaciente(req, id, () => pacientes[idx]) || pacientes[idx];

  auditAdd(req, {
    acao: "update",
    entidade: "pacientes",
    entidadeId: id,
    detalhe: "Paciente atualizado",
    meta: { nome: updated.nome },
  });

  if (DB_ENABLED) {
    try {
      await persistPaciente(updated);
    } catch (e) {
      console.warn("DB: falha ao atualizar paciente:", e?.message || e);
    }
  }

  return res.json({ ok: true, paciente: updated });
});

app.delete("/api/pacientes/:id", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(pacientes, req.params.id, clinica_id);

  if (idx === -1) {
    return res
      .status(404)
      .json({ ok: false, error: "Paciente não encontrado" });
  }

  const removido = pacientes[idx];

  pacientes.splice(idx, 1);
  if (DB_ENABLED) {
    try {
      await dbDeleteScoped("pacientes", String(req.params.id), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao remover paciente:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "delete",
    entidade: "pacientes",
    entidadeId: String(req.params.id),
    detalhe: "Paciente removido",
    meta: { nome: removido?.nome || "" },
  });

  return res.status(204).end();
});

// ================================
// ROTAS DE TRIAGENS ✅ (MELHORADAS)
// ================================

const ordenarTriagensDesc = ordenarDescPorISO("dataHoraISO", "createdAt");

app.post("/api/triagens", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const {
    pacienteId,
    diagnostico,
    evolucao,
    hgt,
    pa,
    fc,
    fr,
    temp,
    saturacao,
    risco,
    usuario,
    dataHoraBR,
    dataHoraISO,
  } = req.body || {};

  if (!pacienteId || String(pacienteId).trim() === "") {
    return res.status(400).json({ ok: false, error: "pacienteId obrigatório" });
  }

  const pid = String(pacienteId).trim();
  if (!pacienteExistePorId(pid, clinica_id)) {
    return res
      .status(404)
      .json({ ok: false, error: "Paciente não encontrado" });
  }

  if (evolucao !== undefined && String(evolucao).length > 3000) {
    return res.status(400).json({
      ok: false,
      error: "Evolução deve ter no máximo 3000 caracteres",
    });
  }

  const hgtNum = parseNumeroFlex(hgt);
  if (
    hgt !== undefined &&
    hgt !== null &&
    String(hgt).trim() !== "" &&
    hgtNum === null
  ) {
    return res.status(400).json({ ok: false, error: "HGT deve ser numérico" });
  }

  const satNum = parseNumeroFlex(saturacao);
  if (satNum !== null && (satNum < 0 || satNum > 100)) {
    return res
      .status(400)
      .json({ ok: false, error: "Saturação deve ser 0–100" });
  }

  const nova = {
    id: makeId(),
    clinica_id,
    pacienteId: pid,

    diagnostico: diagnostico ? String(diagnostico).trim() : "",
    evolucao: evolucao ? String(evolucao).trim() : "",
    hgt: hgt !== undefined && hgt !== null ? String(hgt).trim() : "",

    pa: pa ? String(pa).trim() : "",
    fc: fc ? String(fc).trim() : "",
    fr: fr ? String(fr).trim() : "",
    temp: temp ? String(temp).trim().replace(",", ".") : "",
    saturacao: saturacao ? String(saturacao).trim() : "",
    risco: risco ? String(risco).trim() : "",

    usuario: usuario ? String(usuario).trim() : "",
    dataHoraBR: dataHoraBR ? String(dataHoraBR).trim() : "",
    dataHoraISO: dataHoraISO
      ? String(dataHoraISO).trim()
      : new Date().toISOString(),

    createdAt: new Date().toISOString(),
  };

  // ✅ NOVO: "carimbo" do profissional (snapshot) SOMENTE no CREATE
  attachProfSnapshotFromReqUser(req, nova);

  addTriagem(req, nova);
  if (DB_ENABLED) {
    try {
      await persistTriagem(nova);
    } catch (e) {
      console.warn("DB: falha ao salvar triagem:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "triagens",
    entidadeId: nova.id,
    detalhe: "Triagem criada",
    meta: { pacienteId: nova.pacienteId },
  });

  return res.status(201).json({ ok: true, triagem: nova });
});

app.get("/api/triagens", authRequired, (req, res) => {
  const { pacienteId } = req.query || {};

  let lista = getTriagens(req);

  if (pacienteId) {
    const pid = String(pacienteId).trim();
    lista = lista.filter((t) => t.pacienteId === pid);
  }

  auditAdd(req, {
    acao: "read",
    entidade: "triagens",
    detalhe: "Lista de triagens",
    meta: { pacienteId: pacienteId ? String(pacienteId) : "", total: lista.length },
  });

  return res.json({ ok: true, triagens: [...lista].sort(ordenarTriagensDesc) });
});

app.get("/api/triagens/:id", authRequired, (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const t = triagens.find(
    (x) => x.id === req.params.id && isClinicaMatch(x, clinica_id)
  );
  if (!t)
    return res.status(404).json({ ok: false, error: "Triagem não encontrada" });

  auditAdd(req, {
    acao: "read",
    entidade: "triagens",
    entidadeId: req.params.id,
    detalhe: "Triagem consultada por ID",
    meta: { pacienteId: t?.pacienteId || "" },
  });

  return res.json({ ok: true, triagem: t });
});

app.put("/api/triagens/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(triagens, id, clinica_id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Triagem não encontrada" });
  }

  const body = req.body || {};

  if (body.pacienteId !== undefined) {
    const pid = String(body.pacienteId).trim();
    if (!pacienteExistePorId(pid, clinica_id)) {
      return res
        .status(404)
        .json({ ok: false, error: "Paciente não encontrado" });
    }
    triagens[idx].pacienteId = pid;
  }

  if (body.evolucao !== undefined && String(body.evolucao).length > 3000) {
    return res.status(400).json({
      ok: false,
      error: "Evolução deve ter no máximo 3000 caracteres",
    });
  }

  if (body.hgt !== undefined) {
    const hgtNum = parseNumeroFlex(body.hgt);
    if (body.hgt !== null && String(body.hgt).trim() !== "" && hgtNum === null) {
      return res.status(400).json({ ok: false, error: "HGT deve ser numérico" });
    }
  }

  if (body.saturacao !== undefined) {
    const satNum = parseNumeroFlex(body.saturacao);
    if (satNum !== null && (satNum < 0 || satNum > 100)) {
      return res
        .status(400)
        .json({ ok: false, error: "Saturação deve ser 0–100" });
    }
  }

  triagens[idx] = {
    ...triagens[idx],
    clinica_id: triagens[idx].clinica_id || clinica_id,

    diagnostico:
      body.diagnostico !== undefined
        ? String(body.diagnostico).trim()
        : triagens[idx].diagnostico,

    evolucao:
      body.evolucao !== undefined
        ? String(body.evolucao).trim()
        : triagens[idx].evolucao,

    hgt:
      body.hgt !== undefined ? String(body.hgt ?? "").trim() : triagens[idx].hgt,

    pa: body.pa !== undefined ? String(body.pa).trim() : triagens[idx].pa,
    fc: body.fc !== undefined ? String(body.fc).trim() : triagens[idx].fc,
    fr: body.fr !== undefined ? String(body.fr).trim() : triagens[idx].fr,
    temp:
      body.temp !== undefined
        ? String(body.temp).trim().replace(",", ".")
        : triagens[idx].temp,
    saturacao:
      body.saturacao !== undefined
        ? String(body.saturacao).trim()
        : triagens[idx].saturacao,
    risco: body.risco !== undefined ? String(body.risco).trim() : triagens[idx].risco,

    usuario:
      body.usuario !== undefined
        ? String(body.usuario).trim()
        : triagens[idx].usuario,
    dataHoraBR:
      body.dataHoraBR !== undefined
        ? String(body.dataHoraBR).trim()
        : triagens[idx].dataHoraBR,
    dataHoraISO:
      body.dataHoraISO !== undefined
        ? String(body.dataHoraISO).trim()
        : triagens[idx].dataHoraISO,

    updatedAt: new Date().toISOString(),
  };

  // ⚠️ IMPORTANTE: NÃO altera profissional* aqui (mantém quem criou)
  auditAdd(req, {
    acao: "update",
    entidade: "triagens",
    entidadeId: id,
    detalhe: "Triagem atualizada",
    meta: { pacienteId: triagens[idx].pacienteId },
  });

  if (DB_ENABLED) {
    try {
      await persistTriagem(triagens[idx]);
    } catch (e) {
      console.warn("DB: falha ao atualizar triagem:", e?.message || e);
    }
  }

  return res.json({ ok: true, triagem: triagens[idx] });
});

app.delete("/api/triagens/:id", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(triagens, req.params.id, clinica_id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Triagem não encontrada" });
  }

  const removida = triagens[idx];

  triagens.splice(idx, 1);
  if (DB_ENABLED) {
    try {
      await dbDeleteScoped("triagens", String(req.params.id), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao remover triagem:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "delete",
    entidade: "triagens",
    entidadeId: String(req.params.id),
    detalhe: "Triagem removida",
    meta: { pacienteId: removida?.pacienteId || "" },
  });

  return res.status(204).end();
});

// ================================
// ROTAS PEP (Prontuário) — API-FIRST (memória)
// ================================

const pep = {
  patologias: [],
  vitais: [],
  medicamentos: [],
  documentos: [],
  evolucoes: [],
};

async function loadAllFromDb() {
  if (!DB_ENABLED) return;
  await db.init();
  await detectClinicaColumns();

  const pacientesRows = await db.query("SELECT * FROM pacientes");
  pacientes.length = 0;
  pacientesRows.forEach((r) => {
    pacientes.push({
      ...r,
      endereco: safeJsonParse(r.endereco, {}),
    });
  });

  const triagensRows = await db.query("SELECT * FROM triagens");
  triagens.length = 0;
  triagensRows.forEach((r) => triagens.push({ ...r }));

  const prescricoesRows = await db.query("SELECT * FROM prescricoes");
  prescricoes.length = 0;
  prescricoesRows.forEach((r) => prescricoes.push({ ...r }));

  const leitosRows = await db.query("SELECT * FROM leitos");
  leitos.length = 0;
  leitosRows.forEach((r) => leitos.push({ ...r, ocupado: !!r.ocupado }));

  const consultasRows = await db.query("SELECT * FROM consultas");
  agendamentos.length = 0;
  consultasRows.forEach((r) => agendamentos.push({ ...r }));

  const faturasRows = await db.query("SELECT * FROM faturas");
  faturamentos.length = 0;
  faturasRows.forEach((r) => faturamentos.push({ ...r }));

  const funcionariosRows = await db.query("SELECT * FROM usuarios");
  funcionarios.length = 0;
  funcionariosRows.forEach((r) => funcionarios.push({ ...r }));

  const medsPadraoRows = await db.query("SELECT * FROM medicamentos_padrao");
  medicamentosPadrao.length = 0;
  medsPadraoRows.forEach((r) => medicamentosPadrao.push({ ...r }));

  const movRows = await db.query("SELECT * FROM farmacia_movimentos");
  estoqueMovimentacoes.length = 0;
  movRows.forEach((r) => estoqueMovimentacoes.push({ ...r }));

  const estRows = dbClinicaCols.farmacia_estoque
    ? await db.query(
        "SELECT e.id, e.medicamentoId, e.quantidade, e.updatedAt, e.clinica_id, m.nome AS medicamentoNome FROM farmacia_estoque e LEFT JOIN medicamentos_padrao m ON m.id = e.medicamentoId"
      )
    : await db.query(
        "SELECT e.id, e.medicamentoId, e.quantidade, e.updatedAt, m.nome AS medicamentoNome FROM farmacia_estoque e LEFT JOIN medicamentos_padrao m ON m.id = e.medicamentoId"
      );
  clearEstoqueObject(estoque);
  Object.keys(estoqueByClinica).forEach((k) => delete estoqueByClinica[k]);
  estRows.forEach((r) => {
    const nome = String(r.medicamentoNome || r.medicamentoId || "").trim();
    if (!nome) return;
    const cid = normalizeClinicaId(r.clinica_id) || DEFAULT_CLINICA_ID;
    const estoqueObj = getEstoqueForClinicaId(cid);
    estoqueObj[nome] = Number(r.quantidade || 0);
  });

  const pepPat = await db.query("SELECT * FROM pep_patologias");
  pep.patologias.length = 0;
  pepPat.forEach((r) => {
    const payload = safeJsonParse(r.payload, {});
    pep.patologias.push({
      ...payload,
      id: r.id,
      pacienteId: r.pacienteId,
      clinica_id: r.clinica_id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  });

  const pepVit = await db.query("SELECT * FROM pep_vitais");
  pep.vitais.length = 0;
  pepVit.forEach((r) => {
    const payload = safeJsonParse(r.payload, {});
    pep.vitais.push({
      ...payload,
      id: r.id,
      pacienteId: r.pacienteId,
      clinica_id: r.clinica_id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  });

  const pepMed = await db.query("SELECT * FROM pep_medicamentos");
  pep.medicamentos.length = 0;
  pepMed.forEach((r) => {
    const payload = safeJsonParse(r.payload, {});
    pep.medicamentos.push({
      ...payload,
      id: r.id,
      pacienteId: r.pacienteId,
      clinica_id: r.clinica_id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  });

  const pepDoc = await db.query("SELECT * FROM pep_documentos");
  pep.documentos.length = 0;
  pepDoc.forEach((r) => {
    const payload = safeJsonParse(r.payload, {});
    pep.documentos.push({
      ...payload,
      id: r.id,
      pacienteId: r.pacienteId,
      clinica_id: r.clinica_id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  });

  const pepEvo = await db.query("SELECT * FROM pep_evolucoes");
  pep.evolucoes.length = 0;
  pepEvo.forEach((r) => {
    const payload = safeJsonParse(r.payload, {});
    pep.evolucoes.push({
      ...payload,
      id: r.id,
      pacienteId: r.pacienteId,
      clinica_id: r.clinica_id,
      usuarioId: r.usuarioId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  });

  const auditRows = await db.query(
    "SELECT * FROM auditoria ORDER BY atISO DESC LIMIT ?",
    [AUDITORIA_MAX]
  );
  auditoria.length = 0;
  auditRows.forEach((r) => {
    auditoria.push({
      ...r,
      meta: safeJsonParse(r.meta, {}),
    });
  });
}

function findMedicamentoPadraoByNome(nome, clinicaId) {
  const n = String(nome || "").trim().toLowerCase();
  if (!n) return null;
  return (
    medicamentosPadrao.find(
      (m) =>
        isClinicaMatch(m, clinicaId) &&
        String(m?.nome || "").trim().toLowerCase() === n
    ) || null
  );
}

async function getOrCreateMedicamentoPadraoId(nome, clinicaId) {
  const n = String(nome || "").trim();
  if (!n) return "";
  const existente = findMedicamentoPadraoByNome(n, clinicaId);
  if (existente) return String(existente.id || "");

  const item = {
    id: makeId(),
    clinica_id: normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID,
    nome: n,
    classe: "Outros",
    obs: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  medicamentosPadrao.unshift(item);
  try {
    const fields = ["id", "nome", "classe", "obs", "createdAt", "updatedAt"];
    if (dbClinicaCols.medicamentos_padrao) fields.push("clinica_id");
    await dbUpsert("medicamentos_padrao", item, fields);
  } catch (e) {
    console.warn("DB: falha ao inserir medicamento padrao:", e?.message || e);
  }
  return item.id;
}

function getUsuarioIdByEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return "";
  const f = funcionarios.find((x) => String(x?.email || "").trim().toLowerCase() === e);
  return f?.id ? String(f.id) : "";
}

async function persistPaciente(p) {
  if (!DB_ENABLED) return;
  const payload = { ...p, endereco: safeJsonStringify(p.endereco || {}) };
  const fields = [
    "id",
    "nome",
    "cpf",
    "nascimento",
    "telefone",
    "telefoneFamiliar",
    "familiarResponsavel",
    "convenio",
    "planoSaude",
    "endereco",
    "createdAt",
    "updatedAt",
  ];
  if (dbClinicaCols.pacientes) fields.push("clinica_id");
  await dbUpsert("pacientes", payload, fields);
}

async function persistTriagem(t) {
  if (!DB_ENABLED) return;
  const fields = [
    "id",
    "pacienteId",
    "diagnostico",
    "evolucao",
    "pa",
    "fc",
    "fr",
    "temp",
    "hgt",
    "saturacao",
    "risco",
    "usuario",
    "dataHoraBR",
    "dataHoraISO",
    "profissionalEmail",
    "profissionalNome",
    "profissionalOrgao",
    "profissionalRegistro",
    "profissionalCarimbo",
    "createdAt",
    "updatedAt",
  ];
  if (dbClinicaCols.triagens) fields.push("clinica_id");
  await dbUpsert("triagens", t, fields);
}

async function persistPep(entity, item) {
  if (!DB_ENABLED) return;
  const table = `pep_${entity}`;
  const payload = safeJsonStringify(item);
  const base = {
    id: item.id,
    clinica_id: normalizeClinicaId(item.clinica_id) || DEFAULT_CLINICA_ID,
    pacienteId: item.pacienteId,
    usuarioId: item.usuarioId || "",
    payload,
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
  };
  const fields =
    entity === "evolucoes"
      ? ["id", "pacienteId", "usuarioId", "payload", "createdAt", "updatedAt"]
      : ["id", "pacienteId", "payload", "createdAt", "updatedAt"];
  if (dbClinicaCols[table]) fields.push("clinica_id");
  await dbUpsert(table, base, fields);
}

async function persistPrescricao(p) {
  if (!DB_ENABLED) return;
  const fields = [
    "id",
    "pacienteId",
    "usuarioId",
    "pacienteNome",
    "medicamento",
    "dose",
    "frequencia",
    "via",
    "observacoes",
    "dataHoraBR",
    "dataHoraISO",
    "createdAt",
  ];
  if (dbClinicaCols.prescricoes) fields.push("clinica_id");
  await dbUpsert("prescricoes", p, fields);
}

async function persistLeito(l) {
  if (!DB_ENABLED) return;
  const fields = [
    "id",
    "numero",
    "ocupado",
    "pacienteId",
    "pacienteNome",
    "updatedAt",
  ];
  if (dbClinicaCols.leitos) fields.push("clinica_id");
  await dbUpsert("leitos", { ...l, ocupado: l.ocupado ? 1 : 0 }, fields);
}

async function persistConsulta(c) {
  if (!DB_ENABLED) return;
  const fields = [
    "id",
    "pacienteId",
    "pacienteNome",
    "data",
    "hora",
    "tipo",
    "dataBR",
    "createdAtISO",
    "createdAt",
  ];
  if (dbClinicaCols.consultas) fields.push("clinica_id");
  await dbUpsert("consultas", c, fields);
}

async function persistFatura(f) {
  if (!DB_ENABLED) return;
  const fields = [
    "id",
    "pacienteId",
    "pacienteNome",
    "descricao",
    "valor",
    "status",
    "convenio",
    "usuario",
    "dataHora",
    "dataHoraISO",
    "createdAt",
  ];
  if (dbClinicaCols.faturas) fields.push("clinica_id");
  await dbUpsert("faturas", f, fields);
}

async function persistFuncionario(f) {
  if (!DB_ENABLED) return;
  const fields = [
    "id",
    "nome",
    "email",
    "senha",
    "role",
    "orgao",
    "registro",
    "assinaturaDataUrl",
    "status",
    "createdAt",
    "updatedAt",
  ];
  if (dbClinicaCols.usuarios) fields.push("clinica_id");
  await dbUpsert("usuarios", f, fields);
}

async function persistMedicamentosPadraoList(lista, clinicaId) {
  if (!DB_ENABLED) return;
  if (dbClinicaCols.medicamentos_padrao) {
    const cid = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
    await db.query("DELETE FROM medicamentos_padrao WHERE clinica_id = ?", [cid]);
  } else {
    await db.query("DELETE FROM medicamentos_padrao");
  }
  for (const m of lista) {
    const fields = ["id", "nome", "classe", "obs", "createdAt", "updatedAt"];
    if (dbClinicaCols.medicamentos_padrao) fields.push("clinica_id");
    const row =
      dbClinicaCols.medicamentos_padrao && clinicaId
        ? attachClinicaId({ ...m }, clinicaId)
        : m;
    await dbUpsert("medicamentos_padrao", row, fields);
  }
}

async function persistEstoqueFromObject(obj, clinicaId) {
  if (!DB_ENABLED) return;
  if (dbClinicaCols.farmacia_estoque) {
    const cid = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
    await db.query("DELETE FROM farmacia_estoque WHERE clinica_id = ?", [cid]);
  } else {
    await db.query("DELETE FROM farmacia_estoque");
  }
  for (const [nome, qtd] of Object.entries(obj || {})) {
    const medId = await getOrCreateMedicamentoPadraoId(nome, clinicaId);
    const row = {
      id: `med_${medId || makeId()}`,
      clinica_id: normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID,
      medicamentoId: medId,
      quantidade: Number(qtd || 0),
      updatedAt: new Date().toISOString(),
    };
    const fields = ["id", "medicamentoId", "quantidade", "updatedAt"];
    if (dbClinicaCols.farmacia_estoque) fields.push("clinica_id");
    await dbUpsert("farmacia_estoque", row, fields);
  }
}

async function persistMovimento(m) {
  if (!DB_ENABLED) return;
  const medId = await getOrCreateMedicamentoPadraoId(m.medicamento, m.clinica_id);
  const row = {
    ...m,
    medicamentoId: medId,
    medicamentoNome: m.medicamento || "",
  };
  const fields = [
    "id",
    "medicamentoId",
    "medicamentoNome",
    "quantidade",
    "tipo",
    "lote",
    "saldo",
    "usuario",
    "dataHoraBR",
    "dataHoraISO",
  ];
  if (dbClinicaCols.farmacia_movimentos) fields.push("clinica_id");
  await dbUpsert("farmacia_movimentos", row, fields);
}

function pepRequirePacienteId(v) {
  const pid = String(v ?? "").trim();
  return pid ? pid : null;
}

function pepIndexById(arr, id, clinicaId) {
  return arr.findIndex(
    (x) => String(x.id) === String(id) && isClinicaMatch(x, clinicaId)
  );
}

function pepListByPaciente(arr, pacienteId, clinicaId) {
  const pid = String(pacienteId).trim();
  return arr.filter(
    (x) => String(x.pacienteId) === pid && isClinicaMatch(x, clinicaId)
  );
}

function pepSortDescByCreatedAt(a, b) {
  const da = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const db = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return db - da;
}

function pepRegisterCrud(entity) {
  const base = `/api/${entity}`;

  app.get(base, authRequired, (req, res) => {
    const clinica_id = getClinicaIdFromReq(req);
    const pid = pepRequirePacienteId(req.query?.pacienteId);
    if (!pid) {
      return res
        .status(400)
        .json({ ok: false, error: "pacienteId é obrigatório" });
    }

    const items = pepListByPaciente(pep[entity], pid, clinica_id).sort(
      pepSortDescByCreatedAt
    );

    auditAdd(req, {
      acao: "read",
      entidade: `pep_${entity}`,
      detalhe: `PEP (${entity}) listado`,
      meta: { pacienteId: pid, total: items.length },
    });

    return res.json({ ok: true, items });
  });

  app.post(base, authRequired, async (req, res) => {
    const clinica_id = getClinicaIdFromReq(req);
    const pid = pepRequirePacienteId(req.body?.pacienteId);
    if (!pid) {
      return res
        .status(400)
        .json({ ok: false, error: "pacienteId é obrigatório" });
    }

    if (!pacienteExistePorId(pid, clinica_id)) {
      return res.status(404).json({ ok: false, error: "Paciente não encontrado" });
    }

    const now = new Date().toISOString();
    const body = req.body || {};

    const usuarioId =
      entity === "evolucoes" ? getUsuarioIdByEmail(req.user?.email || "") : "";

    const item = {
      ...body,
      id: body.id ? String(body.id) : makeId(),
      clinica_id,
      pacienteId: pid,
      usuarioId,
      createdAt: body.createdAt ? String(body.createdAt) : now,
      updatedAt: now,
    };

    pep[entity].unshift(item);
    if (DB_ENABLED) {
      try {
        await persistPep(entity, item);
      } catch (e) {
        console.warn("DB: falha ao salvar PEP:", e?.message || e);
      }
    }

    auditAdd(req, {
      acao: "create",
      entidade: `pep_${entity}`,
      entidadeId: item.id,
      detalhe: `PEP (${entity}) criado`,
      meta: { pacienteId: item.pacienteId },
    });

    return res.status(201).json({ ok: true, item });
  });

  app.put(`${base}/:id`, authRequired, async (req, res) => {
    const { id } = req.params;
    const clinica_id = getClinicaIdFromReq(req);
    const idx = pepIndexById(pep[entity], id, clinica_id);

    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Item não encontrado" });
    }

    const now = new Date().toISOString();
    const body = req.body || {};

    pep[entity][idx] = {
      ...pep[entity][idx],
      ...body,
      id: pep[entity][idx].id,
      pacienteId: pep[entity][idx].pacienteId,
      clinica_id: pep[entity][idx].clinica_id || clinica_id,
      updatedAt: now,
    };

    auditAdd(req, {
      acao: "update",
      entidade: `pep_${entity}`,
      entidadeId: id,
      detalhe: `PEP (${entity}) atualizado`,
      meta: { pacienteId: pep[entity][idx].pacienteId },
    });

    if (DB_ENABLED) {
      try {
        await persistPep(entity, pep[entity][idx]);
      } catch (e) {
        console.warn("DB: falha ao atualizar PEP:", e?.message || e);
      }
    }

    return res.json({ ok: true, item: pep[entity][idx] });
  });

  app.delete(`${base}/:id`, authRequired, async (req, res) => {
    const { id } = req.params;
    const clinica_id = getClinicaIdFromReq(req);
    const idx = pepIndexById(pep[entity], id, clinica_id);

    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Item não encontrado" });
    }

    const removido = pep[entity][idx];

    pep[entity].splice(idx, 1);
    if (DB_ENABLED) {
      try {
        await dbDeleteScoped(`pep_${entity}`, id, clinica_id);
      } catch (e) {
        console.warn("DB: falha ao remover PEP:", e?.message || e);
      }
    }

    auditAdd(req, {
      acao: "delete",
      entidade: `pep_${entity}`,
      entidadeId: id,
      detalhe: `PEP (${entity}) removido`,
      meta: { pacienteId: removido?.pacienteId || "" },
    });

    return res.status(204).end();
  });
}

pepRegisterCrud("patologias");
pepRegisterCrud("vitais");
pepRegisterCrud("medicamentos");
pepRegisterCrud("documentos");
pepRegisterCrud("evolucoes");

function getMedicamentosPadrao(req) {
  const clinica_id = getClinicaIdFromReq(req);
  return medicamentosPadrao.filter((m) => isClinicaMatch(m, clinica_id));
}

function replaceMedicamentosPadraoForClinica(req, lista) {
  const clinica_id = getClinicaIdFromReq(req);
  for (let i = medicamentosPadrao.length - 1; i >= 0; i--) {
    if (isClinicaMatch(medicamentosPadrao[i], clinica_id)) {
      medicamentosPadrao.splice(i, 1);
    }
  }
  lista.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const nome = String(item.nome || item.medicamento || "").trim();
    if (!nome) return;
    const novo = {
      id: item.id ? String(item.id) : makeId(),
      nome,
      classe: item.classe ? String(item.classe) : "Outros",
      obs: item.obs ? String(item.obs) : "",
      createdAt: item.createdAt ? String(item.createdAt) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    medicamentosPadrao.push(attachClinicaId(novo, clinica_id));
  });
}

// ================================
// ROTAS DE MEDICAMENTOS PADRÃO — API-FIRST (memória)
// ================================

app.get("/api/medicamentos-padrao", authRequired, (req, res) => {
  const items = getMedicamentosPadrao(req);
  auditAdd(req, {
    acao: "read",
    entidade: "medicamentos_padrao",
    detalhe: "Lista de medicamentos padrão",
    meta: { total: items.length },
  });

  return res.json({ ok: true, items });
});

app.put("/api/medicamentos-padrao", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const body = req.body || {};
  const lista = Array.isArray(body.lista) ? body.lista : Array.isArray(body.items) ? body.items : [];

  if (!Array.isArray(lista)) {
    return res.status(400).json({ ok: false, error: "lista inválida" });
  }

  replaceMedicamentosPadraoForClinica(req, lista);

  if (DB_ENABLED) {
    try {
      await persistMedicamentosPadraoList(getMedicamentosPadrao(req), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao salvar medicamentos padrão:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "update",
    entidade: "medicamentos_padrao",
    detalhe: "Lista de medicamentos padrão atualizada",
    meta: { total: getMedicamentosPadrao(req).length },
  });

  return res.json({ ok: true, items: getMedicamentosPadrao(req) });
});

// ================================
// ROTAS DE PRESCRIÇÕES — API-FIRST (memória)
// ================================

const ordenarPrescricoesDesc = ordenarDescPorISO("dataHoraISO", "createdAt");

app.get("/api/prescricoes", authRequired, (req, res) => {
  const pid = req.query?.pacienteId ? String(req.query.pacienteId).trim() : "";

  let lista = getPrescricoes(req);
  if (pid) {
    lista = lista.filter((x) => String(x.pacienteId) === pid);
  }

  auditAdd(req, {
    acao: "read",
    entidade: "prescricoes",
    detalhe: "Lista de prescrições",
    meta: { pacienteId: pid, total: lista.length },
  });

  return res.json({ ok: true, items: [...lista].sort(ordenarPrescricoesDesc) });
});

app.post("/api/prescricoes", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const body = req.body || {};
  const pid = body.pacienteId ? String(body.pacienteId).trim() : "";

  if (!pid) {
    return res.status(400).json({ ok: false, error: "pacienteId é obrigatório" });
  }

  if (!pacienteExistePorId(pid, clinica_id)) {
    return res.status(404).json({ ok: false, error: "Paciente não encontrado" });
  }

  const usuarioId = getUsuarioIdByEmail(req.user?.email || "");

  const item = {
    ...body,
    id: body.id ? String(body.id) : makeId(),
    clinica_id,
    pacienteId: pid,
    pacienteNome: body.pacienteNome ? String(body.pacienteNome) : "",
    usuarioId,

    medicamento: body.medicamento ? String(body.medicamento).trim() : "",
    dose: body.dose ? String(body.dose).trim() : "",
    frequencia: body.frequencia ? String(body.frequencia).trim() : "",
    via: body.via ? String(body.via).trim() : "",
    observacoes: body.observacoes ? String(body.observacoes).trim() : "",

    dataHoraISO: body.dataHoraISO
      ? String(body.dataHoraISO).trim()
      : new Date().toISOString(),
    dataHoraBR: body.dataHoraBR ? String(body.dataHoraBR).trim() : "",

    createdAt: new Date().toISOString(),
  };

  const created = addPrescricao(req, item);
  if (DB_ENABLED) {
    try {
      await persistPrescricao(created);
    } catch (e) {
      console.warn("DB: falha ao salvar prescrição:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "prescricoes",
    entidadeId: created.id,
    detalhe: "Prescrição criada",
    meta: { pacienteId: created.pacienteId },
  });

  return res.status(201).json({ ok: true, item: created });
});

app.delete("/api/prescricoes/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(prescricoes, id, clinica_id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Prescrição não encontrada" });
  }

  const removida = prescricoes[idx];

  prescricoes.splice(idx, 1);
  if (DB_ENABLED) {
    try {
      await dbDeleteScoped("prescricoes", String(id), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao remover prescrição:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "delete",
    entidade: "prescricoes",
    entidadeId: id,
    detalhe: "Prescrição removida",
    meta: { pacienteId: removida?.pacienteId || "" },
  });

  return res.status(204).end();
});

// ================================
// ROTAS DE LEITOS — API-FIRST (memória)
// ================================

function initLeitosSeVazio(clinicaId) {
  const clinica_id = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
  if (leitos.some((l) => isClinicaMatch(l, clinica_id))) return;
  for (let i = 1; i <= 10; i++) {
    leitos.push({
      id: `Leito ${i}`,
      numero: "Leito " + i,
      clinica_id,
      ocupado: false,
      pacienteId: "",
      pacienteNome: "",
      updatedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  if (DB_ENABLED) {
    leitos.forEach((l) => {
      persistLeito(l).catch((e) =>
        console.warn("DB: falha ao criar leito padrão:", e?.message || e)
      );
    });
  }
}

function leitoFindIndexByNumero(numero, clinicaId) {
  const n = String(numero || "").trim();
  return leitos.findIndex(
    (l) => String(l.numero) === n && isClinicaMatch(l, clinicaId)
  );
}

app.get("/api/leitos", authRequired, (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  initLeitosSeVazio(clinica_id);
  const lista = leitos.filter((l) => isClinicaMatch(l, clinica_id));

  auditAdd(req, {
    acao: "read",
    entidade: "leitos",
    detalhe: "Lista de leitos",
    meta: { total: lista.length },
  });

  return res.json({ ok: true, items: lista });
});

app.put("/api/leitos/:numero", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  initLeitosSeVazio(clinica_id);

  const numero = String(req.params.numero || "").trim();
  const idx = leitoFindIndexByNumero(numero, clinica_id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Leito não encontrado" });
  }

  const body = req.body || {};
  const ocupado = body.ocupado === true;

  if (ocupado) {
    const pid = body.pacienteId ? String(body.pacienteId).trim() : "";
    if (!pid) {
      return res
        .status(400)
        .json({ ok: false, error: "pacienteId é obrigatório para ocupar" });
    }
    if (!pacienteExistePorId(pid, clinica_id)) {
      return res.status(404).json({ ok: false, error: "Paciente não encontrado" });
    }
    if (leitos[idx].ocupado) {
      return res.status(409).json({ ok: false, error: "Leito já ocupado" });
    }

    const paciente = pacientes.find(
      (p) => p.id === pid && isClinicaMatch(p, clinica_id)
    );

    leitos[idx] = {
      ...leitos[idx],
      clinica_id: leitos[idx].clinica_id || clinica_id,
      ocupado: true,
      pacienteId: pid,
      pacienteNome: (paciente?.nome || body.pacienteNome || "Paciente").trim(),
      updatedAt: new Date().toISOString(),
    };

    if (DB_ENABLED) {
      try {
        const leitoDb = {
          ...leitos[idx],
          id: leitos[idx].numero,
          clinica_id: leitos[idx].clinica_id || clinica_id,
        };
        await persistLeito(leitoDb);
      } catch (e) {
        console.warn("DB: falha ao atualizar leito:", e?.message || e);
      }
    }

    auditAdd(req, {
      acao: "update",
      entidade: "leitos",
      entidadeId: numero,
      detalhe: "Leito ocupado",
      meta: { pacienteId: pid, pacienteNome: leitos[idx].pacienteNome },
    });

    return res.json({ ok: true, item: leitos[idx] });
  }

  const antes = leitos[idx];

  leitos[idx] = {
    ...leitos[idx],
    clinica_id: leitos[idx].clinica_id || clinica_id,
    ocupado: false,
    pacienteId: "",
    pacienteNome: "",
    updatedAt: new Date().toISOString(),
  };

  if (DB_ENABLED) {
    try {
      const leitoDb = {
        ...leitos[idx],
        id: leitos[idx].numero,
        clinica_id: leitos[idx].clinica_id || clinica_id,
      };
      await persistLeito(leitoDb);
    } catch (e) {
      console.warn("DB: falha ao atualizar leito:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "update",
    entidade: "leitos",
    entidadeId: numero,
    detalhe: "Leito liberado",
    meta: { pacienteId: antes?.pacienteId || "", pacienteNome: antes?.pacienteNome || "" },
  });

  return res.json({ ok: true, item: leitos[idx] });
});

// ================================
// ROTAS DE CONSULTAS (AGENDA) — API-FIRST (memória)
// ================================

const ordenarConsultasDesc = ordenarDescPorISO("createdAtISO", "createdAt");

app.get("/api/consultas", authRequired, (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const pid = req.query?.pacienteId ? String(req.query.pacienteId).trim() : "";

  let lista = agendamentos.filter((x) => isClinicaMatch(x, clinica_id));
  if (pid) lista = lista.filter((x) => String(x.pacienteId) === pid);

  auditAdd(req, {
    acao: "read",
    entidade: "consultas",
    detalhe: "Lista de consultas",
    meta: { pacienteId: pid, total: lista.length },
  });

  return res.json({ ok: true, items: [...lista].sort(ordenarConsultasDesc) });
});

app.post("/api/consultas", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const body = req.body || {};
  const pid = body.pacienteId ? String(body.pacienteId).trim() : "";

  if (!pid) {
    return res.status(400).json({ ok: false, error: "pacienteId é obrigatório" });
  }
  if (!pacienteExistePorId(pid, clinica_id)) {
    return res.status(404).json({ ok: false, error: "Paciente não encontrado" });
  }

  const item = {
    ...body,
    id: body.id ? String(body.id) : makeId(),
    clinica_id,
    pacienteId: pid,
    pacienteNome: body.pacienteNome ? String(body.pacienteNome) : "",

    data: body.data ? String(body.data).trim() : "",
    hora: body.hora ? String(body.hora).trim() : "",
    tipo: body.tipo
      ? String(body.tipo).trim()
      : body.tipoConsulta
      ? String(body.tipoConsulta).trim()
      : "",

    dataBR: body.dataBR ? String(body.dataBR).trim() : "",

    createdAtISO: body.createdAtISO
      ? String(body.createdAtISO).trim()
      : new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const created = attachClinicaId({ ...item }, clinica_id);
  agendamentos.unshift(created);
  if (DB_ENABLED) {
    try {
      await persistConsulta(created);
    } catch (e) {
      console.warn("DB: falha ao salvar consulta:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "consultas",
    entidadeId: created.id,
    detalhe: "Consulta criada",
    meta: { pacienteId: created.pacienteId, data: created.data, hora: created.hora },
  });

  return res.status(201).json({ ok: true, item: created });
});

app.delete("/api/consultas/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(agendamentos, id, clinica_id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Consulta não encontrada" });
  }

  const removida = agendamentos[idx];

  agendamentos.splice(idx, 1);
  if (DB_ENABLED) {
    try {
      await dbDeleteScoped("consultas", String(id), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao remover consulta:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "delete",
    entidade: "consultas",
    entidadeId: id,
    detalhe: "Consulta removida",
    meta: {
      pacienteId: removida?.pacienteId || "",
      data: removida?.data || "",
      hora: removida?.hora || "",
    },
  });

  return res.status(204).end();
});

// ================================
// ROTAS FARMÁCIA / ESTOQUE — API-FIRST (memória)
// ================================

const ordenarMovimentosDesc = ordenarDescPorISO("dataHoraISO", "createdAt");

app.get("/api/farmacia/estoque", authRequired, (req, res) => {
  const estoqueAtual = getEstoqueFromReq(req);
  auditAdd(req, {
    acao: "read",
    entidade: "farmacia_estoque",
    detalhe: "Consulta de estoque",
    meta: { itens: Object.keys(estoqueAtual).length },
  });

  return res.json({ ok: true, estoque: estoqueAtual });
});

app.put("/api/farmacia/estoque", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const estoqueAtual = getEstoqueForClinicaId(clinica_id);
  const body = req.body || {};
  const novo = body.estoque;

  if (!novo || typeof novo !== "object" || Array.isArray(novo)) {
    return res.status(400).json({
      ok: false,
      error: "Envie { estoque: { 'Dipirona': 10 } }",
    });
  }

  clearEstoqueObject(estoqueAtual);

  for (const [med, qtd] of Object.entries(novo)) {
    const nome = String(med || "").trim();
    const n = Number(qtd);
    if (!nome) continue;
    if (!Number.isFinite(n) || n < 0) continue;
    estoqueAtual[nome] = Math.floor(n);
  }

  if (DB_ENABLED) {
    try {
      await persistEstoqueFromObject(estoqueAtual, clinica_id);
    } catch (e) {
      console.warn("DB: falha ao salvar estoque:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "update",
    entidade: "farmacia_estoque",
    entidadeId: "estoque",
    detalhe: "Estoque substituído via PUT",
    meta: { itens: Object.keys(estoqueAtual).length },
  });

  return res.json({ ok: true, estoque: estoqueAtual });
});

app.get("/api/farmacia/movimentos", authRequired, (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const items = estoqueMovimentacoes.filter((x) => isClinicaMatch(x, clinica_id));
  auditAdd(req, {
    acao: "read",
    entidade: "farmacia_movimentos",
    detalhe: "Lista de movimentos de estoque",
    meta: { total: items.length },
  });

  return res.json({ ok: true, items: [...items].sort(ordenarMovimentosDesc) });
});

app.post("/api/farmacia/movimentos", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const estoqueAtual = getEstoqueForClinicaId(clinica_id);
  const body = req.body || {};

  const medicamento = (body.medicamento || "").toString().trim();
  const tipo = (body.tipo || "").toString().trim(); // "entrada" | "saida"
  const lote = (body.lote || "").toString().trim();

  const quantidade = Number.parseInt(String(body.quantidade ?? "").trim(), 10);

  if (!medicamento || !tipo) {
    return res
      .status(400)
      .json({ ok: false, error: "medicamento e tipo são obrigatórios" });
  }
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return res.status(400).json({ ok: false, error: "quantidade inválida" });
  }
  if (tipo !== "entrada" && tipo !== "saida") {
    return res
      .status(400)
      .json({ ok: false, error: 'tipo deve ser "entrada" ou "saida"' });
  }

  const saldoAtual = Number(estoqueAtual[medicamento] || 0);

  if (tipo === "saida" && saldoAtual < quantidade) {
    return res.status(400).json({ ok: false, error: "Estoque insuficiente" });
  }

  const novoSaldo =
    tipo === "entrada" ? saldoAtual + quantidade : saldoAtual - quantidade;
  estoqueAtual[medicamento] = novoSaldo;

  const item = {
    id: body.id ? String(body.id) : makeId(),
    clinica_id,
    medicamento,
    quantidade,
    tipo,
    lote,
    saldo: novoSaldo,
    dataHoraBR: body.dataHoraBR ? String(body.dataHoraBR) : "",
    dataHoraISO: body.dataHoraISO
      ? String(body.dataHoraISO)
      : new Date().toISOString(),
    usuario: req.user?.email || "",
    createdAt: new Date().toISOString(),
  };

  estoqueMovimentacoes.unshift(item);
  if (DB_ENABLED) {
    try {
      await persistMovimento(item);
    } catch (e) {
      console.warn("DB: falha ao salvar movimento:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "farmacia_movimentos",
    entidadeId: item.id,
    detalhe: "Movimento de estoque registrado",
    meta: {
      medicamento: item.medicamento,
      tipo: item.tipo,
      quantidade: item.quantidade,
      saldo: item.saldo,
    },
  });

  return res.status(201).json({ ok: true, item, estoque: estoqueAtual });
});

// ================================
// ROTAS FATURAMENTO — API-FIRST (memória)
// ================================

const ordenarFaturasDesc = ordenarDescPorISO("dataHoraISO", "createdAt");

app.get("/api/faturas", authRequired, (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const pid = req.query?.pacienteId ? String(req.query.pacienteId).trim() : "";
  let lista = faturamentos.filter((x) => isClinicaMatch(x, clinica_id));
  if (pid) lista = lista.filter((x) => String(x.pacienteId) === pid);

  auditAdd(req, {
    acao: "read",
    entidade: "faturas",
    detalhe: "Lista de faturas",
    meta: { pacienteId: pid, total: lista.length },
  });

  return res.json({ ok: true, items: [...lista].sort(ordenarFaturasDesc) });
});

app.post("/api/faturas", authRequired, async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const body = req.body || {};

  const pacienteId = body.pacienteId ? String(body.pacienteId).trim() : "";
  const pacienteNome = body.pacienteNome ? String(body.pacienteNome).trim() : "";

  if (pacienteId && !pacienteExistePorId(pacienteId, clinica_id)) {
    return res.status(404).json({ ok: false, error: "Paciente não encontrado" });
  }

  const convenio = body.convenio ? String(body.convenio).trim() : "";
  const valorNum = Number(body.valor);
  const descricao = body.descricao ? String(body.descricao).trim() : "";

  if (!convenio || !Number.isFinite(valorNum) || valorNum <= 0 || !descricao) {
    return res
      .status(400)
      .json({ ok: false, error: "Dados de faturamento inválidos" });
  }

  const item = {
    ...body,
    id: body.id ? String(body.id) : makeId(),
    clinica_id,

    pacienteId,
    pacienteNome,

    convenio,
    valor: valorNum,
    descricao,

    usuario: body.usuario ? String(body.usuario) : req.user?.email || "",
    dataHora: body.dataHora ? String(body.dataHora) : "",
    dataHoraISO: body.dataHoraISO
      ? String(body.dataHoraISO)
      : new Date().toISOString(),

    createdAt: new Date().toISOString(),
  };

  faturamentos.unshift(item);
  if (DB_ENABLED) {
    try {
      await persistFatura(item);
    } catch (e) {
      console.warn("DB: falha ao salvar fatura:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "faturas",
    entidadeId: item.id,
    detalhe: "Fatura criada",
    meta: {
      pacienteId: item.pacienteId || "",
      pacienteNome: item.pacienteNome || "",
      valor: item.valor,
      convenio: item.convenio,
    },
  });

  return res.status(201).json({ ok: true, item });
});

app.delete("/api/faturas/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(faturamentos, id, clinica_id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "Fatura não encontrada" });
  }

  const removida = faturamentos[idx];

  faturamentos.splice(idx, 1);
  if (DB_ENABLED) {
    try {
      await dbDeleteScoped("faturas", String(id), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao remover fatura:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "delete",
    entidade: "faturas",
    entidadeId: id,
    detalhe: "Fatura removida",
    meta: {
      pacienteId: removida?.pacienteId || "",
      pacienteNome: removida?.pacienteNome || "",
      valor: removida?.valor,
    },
  });

  return res.status(204).end();
});

// ================================
// ROTAS FUNCIONÁRIOS — API-FIRST (memória) (admin)
// ================================

const ordenarFuncionariosDesc = ordenarDescPorISO("createdAt", "createdAt");

app.get("/api/funcionarios", authRequired, requireRole("admin"), (req, res) => {
  const lista = getFuncionarios(req);
  auditAdd(req, {
    acao: "read",
    entidade: "funcionarios",
    detalhe: "Lista de funcionários",
    meta: { total: lista.length },
  });

  return res.json({
    ok: true,
    items: [...lista].sort(ordenarFuncionariosDesc).map(sanitizeFuncionarioOutput),
  });
});

app.post("/api/funcionarios", authRequired, requireRole("admin"), async (req, res) => {
  const clinica_id = getClinicaIdFromReq(req);
  const body = req.body || {};

  const nome = (body.nome || "").toString().trim();
  const email = (body.email || "").toString().trim().toLowerCase();
  const senha = (body.senha || "").toString();
  const role = (body.role || "funcionario").toString().trim();

  if (!nome || !email || !senha) {
    return res.status(400).json({
      ok: false,
      error: "nome, email e senha são obrigatórios",
    });
  }

  const jaExiste = funcionarios.some(
    (f) => String(f.email || "").toLowerCase() === email
  );
  if (jaExiste) {
    return res
      .status(409)
      .json({ ok: false, error: "Já existe funcionário com esse email" });
  }

  const item = {
    ...body,
    id: body.id ? String(body.id) : makeId(),
    clinica_id,
    nome,
    email,
    senha, // MVP (depois hash)
    role,
    orgao: body.orgao ? String(body.orgao) : "",
    registro: body.registro ? String(body.registro) : "",
    assinaturaDataUrl: body.assinaturaDataUrl ? String(body.assinaturaDataUrl) : "",
    status: body.status ? String(body.status) : "ativo",
    criadoEm: body.criadoEm ? String(body.criadoEm) : new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const created = addFuncionario(req, item);
  if (DB_ENABLED) {
    try {
      await persistFuncionario(created);
    } catch (e) {
      console.warn("DB: falha ao salvar funcionario:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "create",
    entidade: "funcionarios",
    entidadeId: item.id,
    detalhe: "Funcionário criado",
    meta: { email: created.email, role: created.role, nome: created.nome },
  });

  return res.status(201).json({ ok: true, item: sanitizeFuncionarioOutput(item) });
});

app.put("/api/funcionarios/:id", authRequired, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(funcionarios, id, clinica_id);
  if (idx === -1) {
    return res
      .status(404)
      .json({ ok: false, error: "Funcionário não encontrado" });
  }

  const body = req.body || {};
  if (body.email !== undefined) {
    const email = String(body.email || "").trim().toLowerCase();
    const jaExiste = funcionarios.some(
      (f, i) => i !== idx && String(f.email || "").toLowerCase() === email
    );
    if (email && jaExiste) {
      return res.status(409).json({ ok: false, error: "Email já em uso" });
    }
  }

  funcionarios[idx] = {
    ...funcionarios[idx],
    ...body,
    senha:
      body.senha !== undefined && String(body.senha || "").trim() !== ""
        ? String(body.senha)
        : funcionarios[idx].senha,
    id: funcionarios[idx].id,
    clinica_id: funcionarios[idx].clinica_id || clinica_id,
    updatedAt: new Date().toISOString(),
  };

  auditAdd(req, {
    acao: "update",
    entidade: "funcionarios",
    entidadeId: id,
    detalhe: "Funcionário atualizado",
    meta: { email: funcionarios[idx]?.email || "", role: funcionarios[idx]?.role || "" },
  });

  if (DB_ENABLED) {
    try {
      await persistFuncionario(funcionarios[idx]);
    } catch (e) {
      console.warn("DB: falha ao atualizar funcionario:", e?.message || e);
    }
  }

  return res.json({ ok: true, item: sanitizeFuncionarioOutput(funcionarios[idx]) });
});

app.delete("/api/funcionarios/:id", authRequired, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const clinica_id = getClinicaIdFromReq(req);
  const idx = findIndexByClinica(funcionarios, id, clinica_id);
  if (idx === -1) {
    return res
      .status(404)
      .json({ ok: false, error: "Funcionário não encontrado" });
  }

  const removido = funcionarios[idx];

  funcionarios.splice(idx, 1);
  if (DB_ENABLED) {
    try {
      await dbDeleteScoped("usuarios", String(id), clinica_id);
    } catch (e) {
      console.warn("DB: falha ao remover funcionario:", e?.message || e);
    }
  }

  auditAdd(req, {
    acao: "delete",
    entidade: "funcionarios",
    entidadeId: id,
    detalhe: "Funcionário removido",
    meta: { email: removido?.email || "", role: removido?.role || "" },
  });

  return res.status(204).end();
});

// ================================
// Inicialização do servidor
// ================================

async function startServer() {
  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET é obrigatório para iniciar o servidor.");
    process.exit(1);
  }

  try {
    if (DB_ENABLED) {
      await loadAllFromDb();
      console.log("✅ MySQL ativo: dados carregados em memória.");
    } else {
      console.log("ℹ️ MySQL não configurado: usando memória + localStorage.");
    }
  } catch (e) {
    console.warn("⚠️ Falha ao inicializar MySQL, seguindo com memória:", e?.message || e);
  }

  app.listen(PORT, () => {
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
