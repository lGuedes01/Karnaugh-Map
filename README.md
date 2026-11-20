# Mapa de Karnaugh

Ferramenta online e gratuita para estudar e simplificar funções lógicas com mapas de Karnaugh.

**Site:** https://lguedes01.github.io/Karnaugh-Map/

## O que tem

- **Ferramenta**: vários mapas abertos ao mesmo tempo, de 2 a 6 variáveis, com células 0, 1 ou X (irrelevante).
  A expressão mínima aparece em tempo real, em soma de produtos (SOP) e produto de somas (POS), com os grupos desenhados no mapa.
- **Passo a passo**: implicantes primos, quais são essenciais, como o resto foi coberto e quais X foram usados.
- **Circuito lógico**: desenho do circuito em dois níveis (E→OU ou OU→E), com as cores dos grupos.
- **Tabela verdade** editável e preenchimento por lista de mintermos (`1, 3, 7, 11-15`).
- **Link de compartilhamento**: cada mapa vira um link (`?n=4&m=1,3,7&d=0,2`) que abre uma cópia dele.
- **Exercícios**: mapas aleatórios de 2 a 5 variáveis, com ou sem X, correção automática (equivalência, forma pedida e se é mínima), dicas e placar.
- **Teoria**: código Gray, grupos, implicantes, X, SOP e POS, mapas grandes e erros comuns, com exemplos clicáveis.

## Como funciona

É um site estático: HTML, CSS e JavaScript puro, sem dependências nem etapa de build.
A minimização é exata: gera todos os implicantes primos e procura a cobertura com menos termos e, no empate, menos literais.

```
index.html          ferramenta
exercicios.html     exercícios
teoria.html         teoria
js/logic.js         minimização, leitura de expressões, links (sem DOM, testável no Node)
js/render.js        HTML do mapa, passo a passo e SVG do circuito
js/tool.js          página da ferramenta
js/exercises.js     página de exercícios
js/theory.js        exemplos da teoria
css/style.css       estilos e fontes
fonts/              IBM Plex (licença SIL OFL 1.1)
tests/              testes da lógica
```

## Rodar localmente

Os scripts são módulos ES, então abra por um servidor (não direto pelo arquivo):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Testes:

```bash
node tests/logic.test.js
```

## Segurança e privacidade

- Política de Segurança de Conteúdo (CSP) rígida em todas as páginas: só scripts, estilos e fontes do próprio site; nada embutido.
- Os dados vindos de links são validados de forma estrita antes de usar, e todo texto digitado é escapado.
- Fontes hospedadas no próprio repositório: nenhuma requisição a terceiros.
- Sem cookies, sem analytics, sem coleta de dados. Os mapas e o placar ficam só no `localStorage` do navegador.

## Contribuir

Sugestões e correções são bem-vindas por *issues* e *pull requests*. Rode os testes antes de enviar.

## Licença

Código sob a [licença MIT](LICENSE). Fontes IBM Plex sob a SIL Open Font License 1.1 (`fonts/OFL-LICENSE.txt`).
