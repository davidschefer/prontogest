/*
  Multi-clinic isolation test script (manual/automated)
  - Requires API server running.
  - Uses real login for Clinic A and a signed JWT for Clinic B (dev/test only).
*/

const jwt = require("jsonwebtoken");

if (typeof fetch !== "function") {
  console.error("[FAIL] Node.js fetch API not available. Use Node 18+ or add a fetch polyfill.");
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@oaa.com";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "123456";

const CLINICA_B_ID = process.env.CLINICA_B_ID || "clinica_b";
const CLINICA_B_EMAIL = process.env.CLINICA_B_EMAIL || "admin_b@oaa.com";

const log = {
  ok(msg) {
    console.log(`[OK] ${msg}`);
  },
  fail(msg) {
    console.log(`[FAIL] ${msg}`);
  },
};

async function http(method, path, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function makeTestId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function loginClinicaA() {
  const res = await http("POST", "/api/login", null, {
    email: ADMIN_EMAIL,
    senha: ADMIN_SENHA,
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`Login Clinica A falhou: ${res.status} ${res.text}`);
  }
  return res.json;
}

function makeTokenClinicaB() {
  return jwt.sign(
    {
      email: CLINICA_B_EMAIL,
      role: "admin",
      clinica_id: CLINICA_B_ID,
      id: "admin_b",
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

async function createPaciente(token, suffix) {
  const body = {
    nome: `Paciente ${suffix}`,
    cpf: `${Math.floor(Math.random() * 1e11)}`.padStart(11, "0"),
    nascimento: "1990-01-01",
    telefone: "11999999999",
  };
  const res = await http("POST", "/api/pacientes", token, body);
  if (res.status !== 201) throw new Error(`Criar paciente falhou: ${res.status} ${res.text}`);
  return res.json?.paciente || res.json?.item;
}

async function createTriagem(token, pacienteId) {
  const body = {
    pacienteId,
    diagnostico: "Teste",
    evolucao: "Estável",
    risco: "baixo",
  };
  const res = await http("POST", "/api/triagens", token, body);
  if (res.status !== 201) throw new Error(`Criar triagem falhou: ${res.status} ${res.text}`);
  return res.json?.triagem || res.json?.item;
}

async function createPEP(token, pacienteId) {
  const body = {
    pacienteId,
    descricao: "Registro de vitais (teste)",
  };
  const res = await http("POST", "/api/vitais", token, body);
  if (res.status !== 201) throw new Error(`Criar PEP falhou: ${res.status} ${res.text}`);
  return res.json?.item;
}

async function createConsulta(token, pacienteId) {
  const body = {
    pacienteId,
    pacienteNome: "Paciente",
    data: "2026-01-01",
    hora: "10:00",
    tipo: "Consulta",
  };
  const res = await http("POST", "/api/consultas", token, body);
  if (res.status !== 201) throw new Error(`Criar consulta falhou: ${res.status} ${res.text}`);
  return res.json?.item;
}

async function createFuncionario(token, suffix) {
  const body = {
    nome: `Funcionario ${suffix}`,
    email: `func_${suffix}@teste.com`,
    senha: "123456",
    role: "funcionario",
  };
  const res = await http("POST", "/api/funcionarios", token, body);
  if (res.status !== 201) throw new Error(`Criar funcionario falhou: ${res.status} ${res.text}`);
  return res.json?.item;
}

async function listIds(token, path) {
  const res = await http("GET", path, token);
  if (res.status !== 200) throw new Error(`Listar ${path} falhou: ${res.status} ${res.text}`);
  const payload =
    res.json?.items ||
    res.json?.pacientes ||
    res.json?.triagens ||
    res.json?.funcionarios ||
    res.json?.estoque ||
    [];
  if (Array.isArray(payload)) return payload.map((x) => String(x.id));
  if (payload && typeof payload === "object") return Object.keys(payload);
  return [];
}

async function run() {
  const testId = makeTestId();

  const loginA = await loginClinicaA();
  const tokenA = loginA.token;
  const clinicaA = loginA.clinica_id || "default";

  const tokenB = makeTokenClinicaB();

  // Cria dados Clinica A
  const pacienteA = await createPaciente(tokenA, `A-${testId}`);
  const triagemA = await createTriagem(tokenA, pacienteA.id);
  const pepA = await createPEP(tokenA, pacienteA.id);
  const consultaA = await createConsulta(tokenA, pacienteA.id);
  const funcA = await createFuncionario(tokenA, `A-${testId}`);

  // Cria dados Clinica B
  const pacienteB = await createPaciente(tokenB, `B-${testId}`);
  const triagemB = await createTriagem(tokenB, pacienteB.id);
  const pepB = await createPEP(tokenB, pacienteB.id);
  const consultaB = await createConsulta(tokenB, pacienteB.id);
  const funcB = await createFuncionario(tokenB, `B-${testId}`);

  // Isolamento
  const pacientesA = await listIds(tokenA, "/api/pacientes");
  const pacientesB = await listIds(tokenB, "/api/pacientes");
  if (!pacientesA.includes(pacienteA.id) || pacientesA.includes(pacienteB.id)) {
    log.fail("Pacientes isolados por clínica");
  } else {
    log.ok("Pacientes isolados por clínica");
  }
  if (!pacientesB.includes(pacienteB.id) || pacientesB.includes(pacienteA.id)) {
    log.fail("Pacientes isolados (clinica B)");
  } else {
    log.ok("Pacientes isolados (clinica B)");
  }

  const triagensA = await listIds(tokenA, "/api/triagens");
  const triagensB = await listIds(tokenB, "/api/triagens");
  if (!triagensA.includes(triagemA.id) || triagensA.includes(triagemB.id)) {
    log.fail("Triagens isoladas");
  } else {
    log.ok("Triagens isoladas");
  }
  if (!triagensB.includes(triagemB.id) || triagensB.includes(triagemA.id)) {
    log.fail("Triagens isoladas (clinica B)");
  } else {
    log.ok("Triagens isoladas (clinica B)");
  }

  const pepAIds = await listIds(tokenA, "/api/vitais?pacienteId=" + pacienteA.id);
  const pepBIds = await listIds(tokenB, "/api/vitais?pacienteId=" + pacienteB.id);
  if (!pepAIds.includes(pepA.id) || pepAIds.includes(pepB.id)) {
    log.fail("PEP isolado");
  } else {
    log.ok("PEP isolado");
  }

  const consultasA = await listIds(tokenA, "/api/consultas");
  const consultasB = await listIds(tokenB, "/api/consultas");
  if (!consultasA.includes(consultaA.id) || consultasA.includes(consultaB.id)) {
    log.fail("Consultas isoladas");
  } else {
    log.ok("Consultas isoladas");
  }
  if (!consultasB.includes(consultaB.id) || consultasB.includes(consultaA.id)) {
    log.fail("Consultas isoladas (clinica B)");
  } else {
    log.ok("Consultas isoladas (clinica B)");
  }

  const funcsA = await listIds(tokenA, "/api/funcionarios");
  const funcsB = await listIds(tokenB, "/api/funcionarios");
  if (!funcsA.includes(funcA.id) || funcsA.includes(funcB.id)) {
    log.fail("Funcionários isolados");
  } else {
    log.ok("Funcionários isolados");
  }
  if (!funcsB.includes(funcB.id) || funcsB.includes(funcA.id)) {
    log.fail("Funcionários isolados (clinica B)");
  } else {
    log.ok("Funcionários isolados (clinica B)");
  }

  // Bloqueio de update cruzado
  const updateRes = await http("PUT", `/api/pacientes/${pacienteA.id}`, tokenB, {
    nome: "Tentativa Cross",
  });
  if (updateRes.status === 404 || updateRes.status === 403) {
    log.ok("Bloqueio de edição cruzada funcionando");
  } else {
    log.fail(`Bloqueio de edição cruzada falhou (status ${updateRes.status})`);
  }

  // Herança de clinica_id
  if (funcA.clinica_id === clinicaA) {
    log.ok("Herança de clinica_id em funcionário (Clinica A)");
  } else {
    log.fail("Herança de clinica_id em funcionário (Clinica A)");
  }
  if (funcB.clinica_id === CLINICA_B_ID) {
    log.ok("Herança de clinica_id em funcionário (Clinica B)");
  } else {
    log.fail("Herança de clinica_id em funcionário (Clinica B)");
  }

  console.log("\nTeste concluído.");
}

run().catch((e) => {
  console.error("[FAIL] Erro no roteiro de testes:", e.message || e);
  process.exit(1);
});
