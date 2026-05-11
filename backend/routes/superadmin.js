const express = require("express");

function normalizeClinicaId(v) {
  return String(v || "").trim();
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function createDefaultModules() {
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

module.exports = function createSuperAdminRouter(deps) {
  const router = express.Router();

  const authRequired = deps.authRequired;
  const requireRole = deps.requireRole;
  const makeId = deps.makeId;
  const bcrypt = deps.bcrypt;
  const auditAdd = deps.auditAdd;
  const funcionarios = deps.funcionarios;
  const DEFAULT_CLINICA_ID = deps.DEFAULT_CLINICA_ID || "default";
  const persistFuncionario = deps.persistFuncionario;
  const runtime = deps.runtime && typeof deps.runtime === "object" ? deps.runtime : null;

  const clinicas = [];

  function getClinicaById(clinicaId) {
    const cid = normalizeClinicaId(clinicaId);
    return clinicas.find((c) => normalizeClinicaId(c.clinica_id) === cid) || null;
  }

  function sanitizeAdminOutput(item) {
    if (!item || typeof item !== "object") return item;
    const { senha, ...safeItem } = item;
    return safeItem;
  }

  function getAdminsByClinicaId(clinicaId) {
    const cid = normalizeClinicaId(clinicaId) || DEFAULT_CLINICA_ID;
    return funcionarios.filter(
      (f) =>
        normalizeClinicaId(f?.clinica_id) === cid &&
        String(f?.role || "").trim().toLowerCase() === "admin"
    );
  }

  function getClinicaModulosById(clinicaId) {
    const clinica = getClinicaById(clinicaId);
    if (!clinica) return null;
    return {
      ...createDefaultModules(),
      ...(clinica.modulos && typeof clinica.modulos === "object" ? clinica.modulos : {}),
    };
  }

  if (runtime) {
    runtime.getClinicaById = getClinicaById;
    runtime.getClinicaModulosById = getClinicaModulosById;
  }

  router.get("/superadmin", authRequired, requireRole("superadmin"), (req, res) => {
    auditAdd(req, {
      acao: "read",
      entidade: "superadmin",
      detalhe: "Acesso ao painel superadmin",
    });

    return res.json({ ok: true, role: "superadmin", user: req.user || {} });
  });

  router.get("/clinicas", authRequired, requireRole("superadmin"), (req, res) => {
    return res.json({ ok: true, items: clinicas });
  });

  router.post("/clinicas", authRequired, requireRole("superadmin"), (req, res) => {
    const body = req.body || {};

    const clinica_id = normalizeClinicaId(body.clinica_id);
    const nome = String(body.nome || "").trim();

    if (!clinica_id || !nome) {
      return res.status(400).json({ ok: false, error: "nome e clinica_id são obrigatórios" });
    }

    if (getClinicaById(clinica_id)) {
      return res.status(409).json({ ok: false, error: "clinica_id já cadastrado" });
    }

    const item = {
      id: body.id ? String(body.id) : makeId(),
      nome,
      clinica_id,
      cnpj: String(body.cnpj || "").trim(),
      endereco: String(body.endereco || "").trim(),
      telefone: String(body.telefone || "").trim(),
      email: String(body.email || "").trim(),
      logo: String(body.logo || "").trim(),
      responsavel: String(body.responsavel || "").trim(),
      status: String(body.status || "ativo").trim() || "ativo",
      modulos: {
        ...createDefaultModules(),
        ...(body.modulos && typeof body.modulos === "object" ? body.modulos : {}),
      },
      personalizacao: {
        nomeClinica: String(body?.personalizacao?.nomeClinica || nome).trim(),
        cnpj: String(body?.personalizacao?.cnpj || body.cnpj || "").trim(),
        endereco: String(body?.personalizacao?.endereco || body.endereco || "").trim(),
        telefone: String(body?.personalizacao?.telefone || body.telefone || "").trim(),
        logo: String(body?.personalizacao?.logo || body.logo || "").trim(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    clinicas.unshift(item);

    auditAdd(req, {
      acao: "create",
      entidade: "clinicas",
      entidadeId: clinica_id,
      detalhe: "Clínica cadastrada",
      meta: { clinica_id, nome },
    });

    return res.status(201).json({ ok: true, item });
  });

  router.put("/clinicas/:clinica_id/modulos", authRequired, requireRole("superadmin"), (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const body = req.body || {};
    const mods = body.modulos;

    if (!mods || typeof mods !== "object" || Array.isArray(mods)) {
      return res.status(400).json({ ok: false, error: "Envie { modulos: {...} }" });
    }

    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    clinica.modulos = {
      ...createDefaultModules(),
      ...clinica.modulos,
      ...mods,
    };
    clinica.updatedAt = new Date().toISOString();

    auditAdd(req, {
      acao: "update",
      entidade: "clinicas_modulos",
      entidadeId: clinica_id,
      detalhe: "Módulos da clínica atualizados",
    });

    return res.json({ ok: true, item: clinica });
  });

  router.put("/clinicas/:clinica_id/personalizacao", authRequired, requireRole("superadmin"), (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const body = req.body || {};

    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    clinica.personalizacao = {
      ...clinica.personalizacao,
      nomeClinica: String(body.nomeClinica || clinica.personalizacao?.nomeClinica || clinica.nome || "").trim(),
      cnpj: String(body.cnpj || clinica.personalizacao?.cnpj || clinica.cnpj || "").trim(),
      endereco: String(body.endereco || clinica.personalizacao?.endereco || clinica.endereco || "").trim(),
      telefone: String(body.telefone || clinica.personalizacao?.telefone || clinica.telefone || "").trim(),
      logo: String(body.logo || clinica.personalizacao?.logo || clinica.logo || "").trim(),
    };
    clinica.updatedAt = new Date().toISOString();

    auditAdd(req, {
      acao: "update",
      entidade: "clinicas_personalizacao",
      entidadeId: clinica_id,
      detalhe: "Personalização da clínica atualizada",
    });

    return res.json({ ok: true, item: clinica });
  });

  router.put("/clinicas/:clinica_id", authRequired, requireRole("superadmin"), (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const body = req.body || {};

    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    clinica.nome = String(body.nome !== undefined ? body.nome : clinica.nome || "").trim();
    clinica.cnpj = String(body.cnpj !== undefined ? body.cnpj : clinica.cnpj || "").trim();
    clinica.endereco = String(body.endereco !== undefined ? body.endereco : clinica.endereco || "").trim();
    clinica.telefone = String(body.telefone !== undefined ? body.telefone : clinica.telefone || "").trim();
    clinica.email = String(body.email !== undefined ? body.email : clinica.email || "").trim();
    clinica.responsavel = String(body.responsavel !== undefined ? body.responsavel : clinica.responsavel || "").trim();
    clinica.status = String(body.status !== undefined ? body.status : clinica.status || "ativo").trim() || "ativo";
    clinica.logo = String(body.logo !== undefined ? body.logo : clinica.logo || "").trim();

    clinica.personalizacao = {
      ...clinica.personalizacao,
      nomeClinica: clinica.nome,
      cnpj: clinica.cnpj,
      endereco: clinica.endereco,
      telefone: clinica.telefone,
      logo: clinica.logo,
    };
    clinica.updatedAt = new Date().toISOString();

    auditAdd(req, {
      acao: "update",
      entidade: "clinicas",
      entidadeId: clinica_id,
      detalhe: "Clínica atualizada",
    });

    return res.json({ ok: true, item: clinica });
  });

  router.delete("/clinicas/:clinica_id", authRequired, requireRole("superadmin"), (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const idx = clinicas.findIndex((c) => normalizeClinicaId(c?.clinica_id) === clinica_id);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    const removida = clinicas[idx];
    clinicas.splice(idx, 1);

    auditAdd(req, {
      acao: "delete",
      entidade: "clinicas",
      entidadeId: clinica_id,
      detalhe: "Clínica removida da lista",
      meta: { nome: String(removida?.nome || "") },
    });

    return res.json({
      ok: true,
      message: "Clínica removida com sucesso.",
      item: removida,
    });
  });

  router.post("/clinicas/:clinica_id/admin", authRequired, requireRole("superadmin"), async (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const body = req.body || {};

    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    const nome = String(body.nome || "").trim();
    const email = normalizeEmail(body.email);
    const senha = String(body.senha || "");
    const role = "admin";

    if (!nome || !email || !senha) {
      return res.status(400).json({ ok: false, error: "nome, email e senha são obrigatórios" });
    }

    const existe = funcionarios.some((f) => normalizeEmail(f?.email) === email);
    if (existe) {
      return res.status(409).json({ ok: false, error: "Já existe usuário com esse email" });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const item = {
      id: body.id ? String(body.id) : makeId(),
      nome,
      email,
      senha: senhaHash,
      role,
      clinica_id: clinica_id || DEFAULT_CLINICA_ID,
      status: String(body.status || "ativo"),
      criadoEm: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      orgao: String(body.orgao || ""),
      registro: String(body.registro || ""),
      assinaturaDataUrl: String(body.assinaturaDataUrl || ""),
    };

    funcionarios.unshift(item);

    if (typeof persistFuncionario === "function") {
      try {
        await persistFuncionario(item);
      } catch (e) {
        console.warn("DB: falha ao salvar admin de clínica:", e?.message || e);
      }
    }

    auditAdd(req, {
      acao: "create",
      entidade: "clinica_admin",
      entidadeId: item.id,
      detalhe: "Administrador da clínica criado",
      meta: { clinica_id: item.clinica_id, email: item.email },
    });

    return res.status(201).json({ ok: true, item: sanitizeAdminOutput(item) });
  });

  router.get("/clinicas/:clinica_id/admins", authRequired, requireRole("superadmin"), (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    const items = getAdminsByClinicaId(clinica_id).map(sanitizeAdminOutput);
    return res.json({ ok: true, items });
  });

  router.put("/clinicas/:clinica_id/admins/:admin_id", authRequired, requireRole("superadmin"), async (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const admin_id = String(req.params.admin_id || "").trim();
    const body = req.body || {};

    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    const idx = funcionarios.findIndex(
      (f) =>
        String(f?.id || "") === admin_id &&
        normalizeClinicaId(f?.clinica_id) === clinica_id &&
        String(f?.role || "").trim().toLowerCase() === "admin"
    );
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Administrador não encontrado" });
    }

    const nome = body.nome !== undefined ? String(body.nome || "").trim() : String(funcionarios[idx].nome || "");
    const email = body.email !== undefined ? normalizeEmail(body.email) : normalizeEmail(funcionarios[idx].email);
    const senha = body.senha !== undefined ? String(body.senha || "") : "";
    const status = body.status !== undefined ? String(body.status || "").trim() : String(funcionarios[idx].status || "ativo");

    if (!nome || !email) {
      return res.status(400).json({ ok: false, error: "nome e email são obrigatórios" });
    }

    const emailEmUso = funcionarios.some(
      (f, i) => i !== idx && normalizeEmail(f?.email) === email
    );
    if (emailEmUso) {
      return res.status(409).json({ ok: false, error: "Já existe usuário com esse email" });
    }

    let senhaFinal = funcionarios[idx].senha;
    if (senha) {
      senhaFinal = await bcrypt.hash(senha, 10);
    }

    funcionarios[idx] = {
      ...funcionarios[idx],
      nome,
      email,
      senha: senhaFinal,
      status: status || "ativo",
      role: "admin",
      clinica_id,
      updatedAt: new Date().toISOString(),
    };

    if (typeof persistFuncionario === "function") {
      try {
        await persistFuncionario(funcionarios[idx]);
      } catch (e) {
        console.warn("DB: falha ao atualizar admin de clínica:", e?.message || e);
      }
    }

    return res.json({ ok: true, item: sanitizeAdminOutput(funcionarios[idx]) });
  });

  router.delete("/clinicas/:clinica_id/admins/:admin_id", authRequired, requireRole("superadmin"), (req, res) => {
    const clinica_id = normalizeClinicaId(req.params.clinica_id);
    const admin_id = String(req.params.admin_id || "").trim();

    const clinica = getClinicaById(clinica_id);
    if (!clinica) {
      return res.status(404).json({ ok: false, error: "Clínica não encontrada" });
    }

    const idx = funcionarios.findIndex(
      (f) =>
        String(f?.id || "") === admin_id &&
        normalizeClinicaId(f?.clinica_id) === clinica_id &&
        String(f?.role || "").trim().toLowerCase() === "admin"
    );
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: "Administrador não encontrado" });
    }

    const removido = funcionarios[idx];
    funcionarios.splice(idx, 1);

    return res.json({ ok: true, item: sanitizeAdminOutput(removido) });
  });

  return router;
};
