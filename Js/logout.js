/* ===========================
   logout.js -" Mini SGH
   - Remove dados de autenticação e redireciona para o Login
   - Mantém compatibilidade com onclick="logout()"
   =========================== */

function logout() {
  try {
    // Remove dados de autenticação (sessão)
    localStorage.clear();
  } catch (err) {
    console.warn("Falha ao limpar dados de autenticação:", err?.message || err);
  }

  window.location.href = "./login.html";
}

// expõe globalmente (compatibilidade)
window.logout = logout;
