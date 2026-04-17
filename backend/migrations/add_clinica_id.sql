-- ProntoGest - migration for multi-clinic
-- Adds clinica_id to backend tables.
-- Adjust length/type as needed.

ALTER TABLE usuarios ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE pacientes ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE triagens ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE prescricoes ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE leitos ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE consultas ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE faturas ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE farmacia_movimentos ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE farmacia_estoque ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE medicamentos_padrao ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE pep_patologias ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE pep_vitais ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE pep_medicamentos ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE pep_documentos ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE pep_evolucoes ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE auditoria ADD COLUMN clinica_id VARCHAR(64) NOT NULL DEFAULT 'default';
