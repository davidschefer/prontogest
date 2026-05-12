-- ProntoGest - tabela de clínicas para Super Admin
-- Migration não destrutiva

CREATE TABLE IF NOT EXISTS clinicas (
  id VARCHAR(64) PRIMARY KEY,
  clinica_id VARCHAR(64) NOT NULL UNIQUE,
  nome VARCHAR(140) NOT NULL,
  cnpj VARCHAR(30) NULL,
  endereco TEXT NULL,
  telefone VARCHAR(40) NULL,
  email VARCHAR(140) NULL,
  responsavel VARCHAR(140) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  logo LONGTEXT NULL,
  modulos LONGTEXT NULL,
  personalizacao LONGTEXT NULL,
  createdAt VARCHAR(30) NULL,
  updatedAt VARCHAR(30) NULL,
  INDEX idx_clinicas_clinica_id (clinica_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

