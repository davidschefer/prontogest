-- Mini SGH — MySQL schema (MVP)

CREATE TABLE IF NOT EXISTS usuarios (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(120),
  email VARCHAR(120) UNIQUE,
  senha VARCHAR(120),
  role VARCHAR(30),
  orgao VARCHAR(50),
  registro VARCHAR(50),
  assinaturaDataUrl LONGTEXT,
  status VARCHAR(20) DEFAULT 'ativo',
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS pacientes (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(120),
  cpf VARCHAR(20),
  nascimento VARCHAR(20),
  telefone VARCHAR(20),
  telefoneFamiliar VARCHAR(20),
  familiarResponsavel VARCHAR(120),
  convenio VARCHAR(60),
  planoSaude VARCHAR(80),
  endereco TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS triagens (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  diagnostico TEXT,
  evolucao TEXT,
  pa VARCHAR(20),
  fc VARCHAR(20),
  fr VARCHAR(20),
  temp VARCHAR(20),
  hgt VARCHAR(20),
  saturacao VARCHAR(20),
  risco VARCHAR(30),
  usuario VARCHAR(120),
  dataHoraBR VARCHAR(30),
  dataHoraISO VARCHAR(30),
  profissionalEmail VARCHAR(120),
  profissionalNome VARCHAR(120),
  profissionalOrgao VARCHAR(50),
  profissionalRegistro VARCHAR(50),
  profissionalCarimbo LONGTEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS pep_patologias (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  payload TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS pep_vitais (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  payload TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS pep_medicamentos (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  payload TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS pep_documentos (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  payload TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS pep_evolucoes (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  usuarioId VARCHAR(64),
  payload TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS prescricoes (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  usuarioId VARCHAR(64),
  pacienteNome VARCHAR(120),
  medicamento VARCHAR(120),
  dose VARCHAR(50),
  frequencia VARCHAR(50),
  via VARCHAR(30),
  observacoes TEXT,
  dataHoraBR VARCHAR(30),
  dataHoraISO VARCHAR(30),
  createdAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS leitos (
  id VARCHAR(64) PRIMARY KEY,
  numero VARCHAR(10),
  ocupado TINYINT(1),
  pacienteId VARCHAR(64),
  pacienteNome VARCHAR(120),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS consultas (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  pacienteNome VARCHAR(120),
  data VARCHAR(20),
  hora VARCHAR(20),
  tipo VARCHAR(80),
  dataBR VARCHAR(30),
  createdAtISO VARCHAR(30),
  createdAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS faturas (
  id VARCHAR(64) PRIMARY KEY,
  pacienteId VARCHAR(64),
  pacienteNome VARCHAR(120),
  descricao TEXT,
  valor VARCHAR(30),
  status VARCHAR(20),
  convenio VARCHAR(60),
  usuario VARCHAR(120),
  dataHora VARCHAR(30),
  dataHoraISO VARCHAR(30),
  createdAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS medicamentos_padrao (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(120),
  classe VARCHAR(80),
  obs TEXT,
  createdAt VARCHAR(30),
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS farmacia_estoque (
  id VARCHAR(64) PRIMARY KEY,
  medicamentoId VARCHAR(64),
  quantidade INT,
  updatedAt VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS farmacia_movimentos (
  id VARCHAR(64) PRIMARY KEY,
  medicamentoId VARCHAR(64),
  medicamentoNome VARCHAR(120),
  quantidade INT,
  tipo VARCHAR(20),
  lote VARCHAR(80),
  saldo INT,
  usuario VARCHAR(120),
  dataHoraBR VARCHAR(30),
  dataHoraISO VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id VARCHAR(64) PRIMARY KEY,
  atISO VARCHAR(30),
  ip VARCHAR(80),
  ua TEXT,
  usuario VARCHAR(120),
  role VARCHAR(30),
  acao VARCHAR(60),
  entidade VARCHAR(80),
  entidadeId VARCHAR(64),
  metodo VARCHAR(10),
  rota VARCHAR(180),
  ok TINYINT(1),
  detalhe TEXT,
  meta TEXT
);
