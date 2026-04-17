/* ===========================
   db.js — MySQL (mysql2/promise)
   - Usa vars de ambiente:
     MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
   - Se não houver host/usuario/database, fica desabilitado
=========================== */

const mysql = require("mysql2/promise");

const enabled =
  !!process.env.MYSQL_HOST &&
  !!process.env.MYSQL_USER &&
  !!process.env.MYSQL_DATABASE;

let pool = null;

async function init() {
  if (!enabled) return null;
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await pool.query("SELECT 1");
  return pool;
}

async function query(sql, params = []) {
  if (!pool) throw new Error("DB não inicializado");
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = {
  enabled,
  init,
  query,
};
