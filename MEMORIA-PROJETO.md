# Memoria Do Projeto - Mini SGH

## Contexto Geral
- Projeto principal: `Meu-Site-CERTO`
- Objetivo recente: padronizar visual, manter PEP estável, e criar um laboratorio SPA em 1 HTML + 1 CSS + 1 JS.
- Idioma preferido do usuario: pt-BR.

## Ajustes Ja Feitos No Projeto Principal

### PEP (Prontuario)
- Botao `Imprimir` da evolucao foi separado por classe dedicada e ficou verde.
- Classe final usada:
  - CSS: `.btn-imprimir`
  - JS (render do botao): `class="btn btn-sm btn-imprimir"`
- Arquivos alterados:
  - `Css/3-Prontuario-Eletronico-Do-Paciente.css`
  - `Js/3-Prontuario-Eletronico-Do-Paciente.js`

### Base Global
- Foi adicionado override global no `base.css` para padronizacao.
- Depois foi isolado para nao afetar o PEP:
  - Regras globais aplicadas com `body:not(.his-layout)` para blindar o prontuario.
- Arquivo alterado:
  - `Css/base.css`

### Botao Recolher Menu
- Script global de usuario/menu atualizado para toggle de sidebar em paginas sem toggle proprio.
- Estado de menu salvo em `localStorage`:
  - chave: `ui_sidebar_collapsed_v1`
- Arquivo alterado:
  - `Js/page-user-box.js`

### Dashboard Principal (0.1)
- Ajustes de cards inline e estilos foram feitos no arquivo do dashboard.
- IDs de KPI alinhados ao JS:
  - `kpiPacientes`, `kpiLeitos`, `kpiTriagens`, `kpiConsultas` (variacoes conforme ajuste aplicado no momento).
- Arquivos alterados:
  - `Html/0.1-Dashboard.html`
  - `Css/0.1-Dashboard.css`

### Prescricoes
- Lista de prescricoes padronizada com a mesma largura do cadastro.
- Impressao reformatada em layout de prescricao (cabecalho, dados do paciente, tabela de itens, observacoes, assinatura e carimbo fixos no rodape).
- Autocomplete de medicamentos no campo "Medicamento" com datalist.
- Arquivos alterados:
  - `Css/4-Prescricoes.css`
  - `Html/4-Prescricoes.html`
  - `Js/4-Prescricoes.js`

### Farmacia / Estoque
- Autocomplete de medicamentos no campo "Medicamento" com datalist.
- Lista base de medicamentos ampliada (hipertensao, cardiacos, DM, diureticos, antitermicos/analgesicos, anti-inflamatorios e antibioticos).
- Sugestoes incluem tambem estoque e medicamentos padrao (LS + API).
- Arquivos alterados:
  - `Html/6-Farmacia-Estoque.html`
  - `Js/6-Farmacia-Estoque.js`

### Medicamentos Padrao
- Nova tela de cadastro/edicao de medicamentos padrao.
- Persistencia local (LS: `medicamentos_padrao_v1`) e sincronizacao API.
- Botoes Editar (verde) e Remover (vermelho).
- Menu lateral atualizado para incluir a nova tela.
- Link usa entidade HTML para acento: `Medicamentos Padr&atilde;o`.
- Arquivos criados:
  - `Html/12-Medicamentos-Padrao.html`
  - `Css/12-Medicamentos-Padrao.css`
  - `Js/12-Medicamentos-Padrao.js`

### API - Medicamentos Padrao
- Backend com endpoints:
  - `GET /api/medicamentos-padrao`
  - `PUT /api/medicamentos-padrao`
- Memoria em runtime no `backend/server.js` (array `medicamentosPadrao`).
- Arquivo alterado:
  - `backend/server.js`

## Laboratorio SPA (1 Pagina So)

### Objetivo
Criar versao de teste moderna inspirada em dashboards medicos (estilo Medicare), sem mexer nas paginas oficiais.

### Arquivos Do Laboratorio
- `Html/99-laboratorio-ui.html`
- `Css/99-laboratorio-ui.css`
- `Js/99-laboratorio-ui.js`

### O Que Essa SPA Tem
- Sidebar lateral + navegacao interna por secoes (sem trocar de HTML).
- Topbar com busca, botoes de acao e avatar.
- Dashboard com:
  - faixa de boas-vindas,
  - KPIs,
  - grafico de atividade,
  - painel de stats,
  - lista de doctors,
  - tabela de consultas.
- Secoes funcionais:
  - Pacientes
  - Triagem
  - PEP
  - Prescricoes
  - Leitos
  - Farmacia
  - Agenda
  - Faturamento
  - Relatorios
  - Funcionarios
  - Auditoria
- Persistencia em `localStorage`.
- Tema escuro/claro com botao de alternancia.

## Observacoes Importantes
- Existem arquivos duplicados vazios em pastas:
  - `Html/Html/99-laboratorio-ui.html`
  - `Css/Css/99-laboratorio-ui.css`
  - `Js/Js/99-laboratorio-ui.js`
- Os arquivos validos e usados sao os da raiz de cada pasta:
  - `Html/99-laboratorio-ui.html`
  - `Css/99-laboratorio-ui.css`
  - `Js/99-laboratorio-ui.js`

## Como Testar
1. Abrir `Html/99-laboratorio-ui.html` com Live Server.
2. Fazer `Ctrl+F5` para limpar cache.

## Proximos Passos Sugeridos
- Integrar SPA laboratorio com backend real (`backend/server.js`) em vez de somente `localStorage`.
- Fazer ajuste fino visual por print (tipografia, gaps, densidade, contrastes).
- Decidir se o laboratorio vira nova base oficial para substituir paginas separadas.

## Status Atual (Resumo)
- Frontend multi-paginas (HTML/CSS/JS) com layout padronizado e sidebar global.
- Backend Node/Express com API e autenticação JWT.
- Persistencia em memoria no backend + fallback localStorage no frontend.
- Autocomplete de medicamentos integrado (base + estoque + medicamentos padrao).

## Endpoints Ativos (Backend)
- Auth:
  - `POST /api/auth/login`
- Pacientes:
  - `GET /api/pacientes`
  - `POST /api/pacientes`
  - `PUT /api/pacientes/:id`
  - `DELETE /api/pacientes/:id`
- Prescricoes:
  - `GET /api/prescricoes`
  - `POST /api/prescricoes`
  - `DELETE /api/prescricoes/:id`
- Farmacia:
  - `GET /api/farmacia/estoque`
  - `PUT /api/farmacia/estoque`
  - `GET /api/farmacia/movimentos`
  - `POST /api/farmacia/movimentos`
- PEP (CRUD por entidade):
  - `GET/POST/PUT/DELETE /api/pep/patologias`
  - `GET/POST/PUT/DELETE /api/pep/vitais`
  - `GET/POST/PUT/DELETE /api/pep/medicamentos`
  - `GET/POST/PUT/DELETE /api/pep/documentos`
  - `GET/POST/PUT/DELETE /api/pep/evolucoes`
- Medicamentos Padrao:
  - `GET /api/medicamentos-padrao`
  - `PUT /api/medicamentos-padrao`

## Dependencias (Backend)
- `express`
- `cors`
- `dotenv`
- `jsonwebtoken`

## Pendencias Antes de Producao
- Persistencia real em banco (MySQL ou equivalente) para substituir memoria do servidor.
- Migracao dos dados do localStorage para API/banco.
- Configurar variaveis de ambiente (ex.: `JWT_SECRET`) e segredos.
- Configurar HTTPS/SSL e dominio.
- Validar CORS e origens permitidas para producao.

## Deploy HostGator (Checklist)
- Verificar se o plano suporta Node.js no cPanel (Setup Node.js App).
- Fazer build/transferir todos os arquivos para o host.
- Subir o backend (`backend/`) e iniciar com `node server.js` via painel Node.
- Garantir que o backend sirva os arquivos estaticos do frontend.
- Configurar variaveis de ambiente no painel (JWT secret, porta).


========================================
REGRAS DE COMPORTAMENTO DA IA (CRÍTICO)
========================================

A IA que utilizar este contexto deve seguir rigorosamente:

1. Atuar como EXECUTORA, não como arquiteta.
2. NÃO tomar decisões fora da tarefa solicitada.
3. NÃO alterar:
   - textos visíveis ao usuário
   - sidebar
   - nomes de menus
   - nomenclaturas existentes
4. NÃO refatorar código sem solicitação explícita.
5. NÃO alterar múltiplos arquivos sem necessidade direta.
6. NÃO “melhorar” ou “padronizar” nada fora da tarefa.
7. Alterações devem ser:
   - mínimas
   - localizadas
   - seguras
8. Se identificar problemas fora do escopo:
   - apenas relatar
   - NÃO corrigir

========================================
MODO DE EXECUÇÃO
========================================

Antes de executar qualquer tarefa, a IA deve:

1. Explicar em poucas linhas o que entendeu.
2. Listar quais arquivos serão alterados.
3. Confirmar que seguirá todas as regras acima.

Se não fizer isso, a execução é considerada inválida.

========================================
TRAVA DE SEGURANÇA
========================================

Se a tarefa não envolver alteração de interface,
é PROIBIDO modificar qualquer texto visível.

Se a IA alterar textos, sidebar ou nomenclaturas sem autorização explícita,
a resposta deve ser considerada incorreta.