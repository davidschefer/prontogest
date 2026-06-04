-- Migration: add new financial fields to faturas
-- Adds columns: tipo, categoria, vencimentoISO, formaPagamento, observacoes

ALTER TABLE faturas
  ADD COLUMN tipo VARCHAR(20),
  ADD COLUMN categoria VARCHAR(100),
  ADD COLUMN vencimentoISO VARCHAR(30),
  ADD COLUMN formaPagamento VARCHAR(60),
  ADD COLUMN observacoes TEXT;
