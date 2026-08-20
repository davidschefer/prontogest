// ================================
// routes/leads.js — Mini SGH
// - Recebe leads da landing page (rota pública, sem login)
// - Lista/gerencia leads no Super Admin (rota protegida)
// ================================

const express = require("express");

const TIPOS_VALIDOS = [
  "reabilitacao",
  "casa-repouso",
  "saude-mental",
  "ambulatorio",
  "consultorio",
  "laboratorio",
  "hospital",
  "outro",
];

const INTERESSES_VALIDOS = ["trial", "proposta", "duvida"];
const STATUS_VALIDOS = ["novo", "em_contato", "convertido", "descartado"];

function normalizeStr(v, max) {
  const s = String(v || "").trim();
  return max ? s.slice(0, max) : s;
}

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

module.exports = function createLeadsRouter(deps) {
  const router = express.Router();

  const authRequired = deps.authRequired;
  const requireRole = deps.requireRole;
  const makeId = deps.makeId;
  const auditAdd = deps.auditAdd;
  const db = deps.db;
  const dbEnabled = Boolean(deps.dbEnabled && db && typeof db.query === "function");

  // Fallback em memória (mesmo padrão usado no resto do server.js)
  const leads = [];
  let leadsTableReady = false;

  // ---- proteção simples contra spam no endpoint público ----
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const RATE_LIMIT_MAX = 5; // no máx. 5 envios por IP a cada 1 min
  const rateLimitMap = new Map();

  function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.set(ip, { count: 1, firstAt: now });
      return false;
    }
    entry.count += 1;
    return entry.count > RATE_LIMIT_MAX;
  }

  async function ensureLeadsTable() {
    if (!dbEnabled || leadsTableReady) return;
    await db.query(
      `CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(64) PRIMARY KEY,
        nome VARCHAR(120),
        instituicao VARCHAR(160),
        tipo VARCHAR(60),
        whatsapp VARCHAR(30),
        interesse VARCHAR(30),
        origem VARCHAR(60),
        status VARCHAR(30) NOT NULL DEFAULT 'novo',
        observacao TEXT,
        createdAt VARCHAR(30),
        updatedAt VARCHAR(30),
        INDEX idx_leads_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    leadsTableReady = true;
  }

  async function persistLead(item) {
    if (!dbEnabled) return;
    await ensureLeadsTable();
    await db.query(
      `INSERT INTO leads (id, nome, instituicao, tipo, whatsapp, interesse, origem, status, observacao, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         observacao = VALUES(observacao),
         updatedAt = VALUES(updatedAt)`,
      [
        item.id,
        item.nome,
        item.instituicao,
        item.tipo,
        item.whatsapp,
        item.interesse,
        item.origem,
        item.status,
        item.observacao || "",
        item.createdAt,
        item.updatedAt,
      ]
    );
  }

  async function loadLeadsFromDb() {
    if (!dbEnabled) return null;
    await ensureLeadsTable();
    const rows = await db.query("SELECT * FROM leads ORDER BY createdAt DESC");
    return Array.isArray(rows) ? rows : [];
  }

  // ================================
  // POST /leads — PÚBLICA (chamada pela landing page)
  // ================================
  router.post("/leads", async (req, res) => {
    const ip = req.socket?.remoteAddress || req.ip || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({
        ok: false,
        error: "Muitos envios em pouco tempo. Tente novamente em instantes.",
      });
    }

    const body = req.body || {};

    // honeypot: campo invisível no form; se vier preenchido, é bot
    if (normalizeStr(body.website)) {
      // responde 201 "falso" pra não avisar o bot, mas não salva nada
      return res.status(201).json({ ok: true });
    }

    const nome = normalizeStr(body.nome, 120);
    const instituicao = normalizeStr(body.instituicao, 160);
    const tipo = normalizeStr(body.tipo, 60).toLowerCase();
    const whatsapp = onlyDigits(body.whatsapp);
    const interesse = normalizeStr(body.interesse, 30).toLowerCase();
    const origem = normalizeStr(body.origem || "landing-page", 60);

    if (!nome || nome.length < 2) {
      return res.status(400).json({ ok: false, error: "Nome inválido." });
    }
    if (!instituicao) {
      return res.status(400).json({ ok: false, error: "Nome da instituição é obrigatório." });
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ ok: false, error: "Tipo de instituição inválido." });
    }
    if (whatsapp.length < 10 || whatsapp.length > 13) {
      return res.status(400).json({ ok: false, error: "WhatsApp inválido." });
    }
    if (!INTERESSES_VALIDOS.includes(interesse)) {
      return res.status(400).json({ ok: false, error: "Selecione o que você quer fazer." });
    }

    const nowISO = new Date().toISOString();
    const novo = {
      id: makeId(),
      nome,
      instituicao,
      tipo,
      whatsapp,
      interesse,
      origem,
      status: "novo",
      observacao: "",
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    leads.unshift(novo);

    if (dbEnabled) {
      try {
        await persistLead(novo);
      } catch (e) {
        console.warn("DB: falha ao salvar lead:", e?.message || e);
      }
    }

    // auditoria é opcional aqui (rota pública, sem req.user) — só registra se a função existir
    if (typeof auditAdd === "function") {
      try {
        auditAdd(req, {
          acao: "create",
          entidade: "leads",
          entidadeId: novo.id,
          detalhe: "Novo lead recebido pela landing page",
          usuario: "landing-page",
          role: "publico",
          meta: { tipo, interesse, origem },
        });
      } catch {}
    }

    return res.status(201).json({ ok: true, id: novo.id });
  });

  // ================================
  // GET /leads — protegida (superadmin)
  // ================================
  router.get("/leads", authRequired, requireRole("superadmin"), async (req, res) => {
    const statusFiltro = normalizeStr(req.query.status || "todos").toLowerCase();
    const query = normalizeStr(req.query.q || "").toLowerCase();

    let lista;
    if (dbEnabled) {
      try {
        lista = await loadLeadsFromDb();
      } catch (e) {
        console.warn("DB: falha ao ler leads, usando memória:", e?.message || e);
        lista = leads;
      }
    } else {
      lista = leads;
    }

    if (statusFiltro !== "todos") {
      lista = lista.filter((item) => String(item.status || "").toLowerCase() === statusFiltro);
    }
    if (query) {
      lista = lista.filter((item) => {
        const nome = String(item.nome || "").toLowerCase();
        const instituicao = String(item.instituicao || "").toLowerCase();
        return nome.includes(query) || instituicao.includes(query);
      });
    }

    const totalNovo = lista.filter((i) => i.status === "novo").length;
    const totalEmContato = lista.filter((i) => i.status === "em_contato").length;
    const totalConvertido = lista.filter((i) => i.status === "convertido").length;

    return res.json({
      ok: true,
      items: lista,
      resumo: {
        total: lista.length,
        totalNovo,
        totalEmContato,
        totalConvertido,
      },
    });
  });

  // ================================
  // PUT /leads/:id/status — protegida (superadmin)
  // ================================
  router.put("/leads/:id/status", authRequired, requireRole("superadmin"), async (req, res) => {
    const { id } = req.params;
    const status = normalizeStr(req.body?.status).toLowerCase();
    const observacao = req.body?.observacao !== undefined ? normalizeStr(req.body.observacao, 500) : undefined;

    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ ok: false, error: "Status inválido." });
    }

    let item = leads.find((l) => l.id === id);

    if (!item && dbEnabled) {
      try {
        const rows = await db.query("SELECT * FROM leads WHERE id = ? LIMIT 1", [id]);
        item = Array.isArray(rows) && rows.length ? rows[0] : null;
      } catch {}
    }

    if (!item) {
      return res.status(404).json({ ok: false, error: "Lead não encontrado." });
    }

    item.status = status;
    if (observacao !== undefined) item.observacao = observacao;
    item.updatedAt = new Date().toISOString();

    const idxMem = leads.findIndex((l) => l.id === id);
    if (idxMem !== -1) leads[idxMem] = item;

    if (dbEnabled) {
      try {
        await persistLead(item);
      } catch (e) {
        console.warn("DB: falha ao atualizar status do lead:", e?.message || e);
      }
    }

    if (typeof auditAdd === "function") {
      try {
        auditAdd(req, {
          acao: "update",
          entidade: "leads",
          entidadeId: id,
          detalhe: "Status do lead atualizado",
          meta: { status },
        });
      } catch {}
    }

    return res.json({ ok: true, item });
  });

  return router;
};
