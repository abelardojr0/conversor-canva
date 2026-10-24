# Conversor para Canva

Aplicativo React + Vite + JavaScript para transformar planilhas de produtos em arquivos para o **Criar em lote** do Canva. Tudo é processado no navegador, sem backend, conta, API, envio de arquivos ou armazenamento remoto.

## Executar

Requer Node.js **22.12 ou superior** e npm.

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://127.0.0.1:5173`.

```bash
npm test
npm run build
npm run preview
```

- `npm install`: instala as dependências do projeto; o lockfile mantém as versões reproduzíveis.
- `npm run dev`: inicia o servidor local com atualização automática.
- `npm test`: executa os testes de normalização, transformação, importação, exportação e interface.
- `npm run build`: gera o site estático na pasta `dist`.
- `npm run preview`: serve o build localmente para conferência.
- `npm run example`: recria os exemplos de 80 produtos em CSV e Excel.

## Usar

1. Na etapa **Planilha**, arraste ou selecione um `.xlsx` ou `.csv`. Para experimentar, clique em **Usar exemplo com 80 produtos**. Após importar, a aplicação abre a configuração.
2. Na etapa **Configuração**, comece definindo a quantidade de produtos por página. O limite depende dos campos selecionados: 2 campos permitem até 75 produtos; 3 permitem até 50; 4 permitem até 37. A saída nunca ultrapassa 150 colunas.
3. Em **Gerencie os campos de cada produto**, escolha a aba desejada, se houver mais de uma, e confira as colunas de origem e os exemplos. Produto e preço são selecionados inicialmente. Clique em **Adicionar campo** para incluir Categoria, Marca, Código ou outras colunas disponíveis. Defina o **Nome de saída**, o formato **Texto** ou **Preço**, e use as setas para mudar a ordem. O campo que identifica o produto é obrigatório; os demais podem ser removidos.
4. Se quiser, ative **Adicionar R$ aos preços**. Essa opção começa desmarcada.
5. Clique em **Conferir resultado**. Na etapa **Conferência**, use a aba **Por produto** para ler nomes e preços ou **Arquivo final** para conferir os cabeçalhos e a estrutura exata do download. Navegue até a primeira e a última página, ou digite o número da página. Na visão do arquivo, role horizontalmente para ver todas as colunas. Posições vazias permanecem em branco na exportação.
6. Baixe Excel ou CSV. Havendo mais de 300 páginas, selecione e baixe **cada lote** separadamente. Todos têm os mesmos cabeçalhos.
7. No Canva, importe o arquivo e associe os campos aos elementos do modelo. O botão **Como funciona** abre orientações em um painel lateral. Avisos da planilha também abrem em um painel lateral, com a linha de origem de cada problema.

Você pode voltar pelas etapas sem perder as escolhas. Os atalhos de 6, 10 e 12 produtos preenchem a quantidade; o campo numérico aceita os inteiros de 1 até o limite calculado como `150 ÷ campos por produto`, sem ultrapassar 150 colunas. Se um campo adicional exceder esse limite, o aplicativo bloqueia a continuação e oferece um botão para ajustar a quantidade, sem alterá-la silenciosamente. A navegação por teclado inclui foco ao mudar de etapa, abas da prévia com setas e painéis laterais com fechamento por Escape e retorno ao botão de origem.

Cada linha de saída representa uma página. Os campos selecionados se repetem para cada produto na ordem definida. A configuração inicial gera `PRODUTO1, PREÇO1, PRODUTO2, PREÇO2, …`. Incluindo Categoria ao final, a saída passa a ser `PRODUTO1, PREÇO1, CATEGORIA1, PRODUTO2, PREÇO2, CATEGORIA2, …`. A ordem dos produtos da origem é mantida. Espaços e quebras de linha nos textos são preservados.

### Escolher colunas e entender seus nomes

Na etapa **Configuração**, os seletores mostram os cabeçalhos que já existem na sua planilha. **Coluna com os nomes** indica de onde ler o nome de cada produto; **Coluna com os preços** indica de onde ler seu preço. Cada campo adicional também permite escolher sua coluna de origem. Uma coluna de origem só pode ser usada uma vez. Cada editor mostra um dado de exemplo e os campos de destino para ajudar a conferir a escolha.

Para a estrutura `Categoria | Produto | Oferta`, selecione **Produto** como nomes e **Oferta** como preços. Normalmente isso é detectado automaticamente. Categoria começa fora da seleção e pode ser incluída com **Adicionar campo**. Se outra planilha usar `Descrição | Valor`, selecione Descrição e Valor, respectivamente. São reconhecidas automaticamente as alternativas Nome, Descrição, Item, Nome do produto, Preço, Valor e Preço de Oferta; Oferta tem prioridade como preço.

O campo **Nome de saída** define o prefixo do cabeçalho. Por exemplo, `CATEGORIA` gera `CATEGORIA1`, `CATEGORIA2`, …, e `GRUPO` gera `GRUPO1`, `GRUPO2`, …. A numeração é acrescentada automaticamente e indica a posição do produto na arte. Os nomes devem ser preenchidos, diferentes entre si e não podem iniciar fórmulas; a aplicação também bloqueia colisões causadas pela numeração. O link **Entenda os nomes das colunas de saída** abre a explicação completa em um painel lateral. A aba **Arquivo final** exibe todos os cabeçalhos na ordem final.

O formato **Texto** preserva códigos, como `000123`, sem tratar seus dígitos como dinheiro. O formato **Preço** aplica a normalização monetária sem arredondamento. É possível incluir mais de um preço, como Oferta e Preço normal; a opção R$ vale para todos os campos com esse formato. Sem campos de preço, a conversão pode conter apenas o nome do produto e outros textos. Ao trocar de aba, os campos são redefinidos para a nova origem, evitando reutilizar colunas incompatíveis.

Com 80 produtos, usando os dois campos iniciais:

- 10 por página: **8 linhas de dados, 20 colunas** (9 linhas incluindo o cabeçalho).
- 6 por página: **14 linhas de dados, 12 colunas**. A última contém 2 produtos e 8 campos vazios, correspondentes a 4 posições de produto.
- 1 por página: 80 linhas de dados e 2 colunas.

Incluindo Categoria, 80 produtos com 10 por página geram 8 linhas de dados e 30 colunas. Com 6 por página, geram 14 linhas de dados e 18 colunas, com os últimos campos vazios. Os dois formatos de exportação e as duas visões da prévia seguem a mesma seleção e ordem de campos.

## Preços e segurança dos dados

`src/lib/prices.js` normaliza os preços por manipulação de strings. Não usa arredondamento, `toFixed`, soma nem multiplicação de valores monetários. Mantém casas adicionais e completa apenas as casas que faltam para o mínimo de duas:

```text
13,99       → 13,99
5,5         → 5,50
0,09        → 0,09
13,995      → 13,995
13,99500    → 13,99500
1.234,50    → 1234,50
13.99 (número do Excel) → 13,99
```

Vírgula simples é considerada decimal brasileira, inclusive com três casas. Texto com ponto e três casas, como `1.234` ou `13.995`, é ambíguo e **bloqueia o download** até que a origem seja corrigida, por exemplo para `1234,00` ou `13,995`. Combinações de milhar e decimal só são aceitas com agrupamento válido. Números do Excel usam o valor numérico disponível, inclusive notação científica. Precisão já perdida na origem não pode ser recuperada; zeros de formatação visual do Excel não são casas armazenadas no valor numérico.

Preços ausentes ou inválidos e fórmulas sem resultado calculado nos campos selecionados impedem o download. A prévia mantém os produtos com preço inválido na posição original e mostra seu preço em branco para conferência. Recalcule fórmulas no Excel, salve e reenvie o arquivo. O aplicativo não calcula fórmulas. Linhas completamente vazias são ignoradas; linhas sem produto são ignoradas com aviso. Fórmulas problemáticas nas outras colunas também geram avisos.

O resumo conta como válidos os produtos com nome e preço válido. Enquanto houver erros, a contagem de páginas da prévia também inclui os produtos nomeados que aguardam correção de preço; nenhum deles é descartado silenciosamente.

Nomes que possam ser interpretados como fórmula (`=`, `+`, `-`, `@` e certos espaços/controles iniciais) recebem um apóstrofo protetor. Isso aparece na prévia e nos dois formatos de exportação. Preços negativos válidos permanecem valores monetários, sem esse prefixo. Acentos, vírgulas, aspas e quebras de linha são escapados corretamente no CSV.

## Arquivos de saída

- **Excel:** uma aba `Canva`, cabeçalhos na primeira linha, todas as células de preço como string com formato `@`, sem fórmulas, índices ou mesclagens.
- **CSV:** UTF-8 com BOM, delimitador vírgula, linhas CRLF e campos entre aspas conforme RFC 4180. A vírgula de `13,99` permanece dentro de um único campo. Entrada CSV aceita vírgula ou ponto e vírgula, com ou sem BOM; use UTF-8 para preservar acentos.
- Campos da última página incompleta são strings vazias em ambos os formatos.
- Até 150 campos por arquivo e até 300 linhas de dados por lote. Lotes adicionais recebem sufixos como `_lote_1_de_2` no nome.

XLSX usa ExcelJS, carregado sob demanda ao importar ou exportar Excel. Seu bundle comprimido é maior que o código da interface; o build pode emitir aviso de tamanho de chunk, sem impedir a geração ou execução do site. CSV usa PapaParse sem conversão automática dos valores para número.

## Dados de exemplo e testes

O arquivo original `Encarte Inauguração.xlsx` não estava disponível na pasta do projeto. Os exemplos em `public/exemplo_80_produtos.csv` e `public/exemplo_80_produtos.xlsx` são **dados representativos**, com os quatro primeiros produtos fornecidos no pedido. O Excel contém a aba `Por Categoria`. Os demais produtos são exemplos e incluem preços com casas adicionais, zeros e separadores de milhar para validar a precisão.

Os testes verificam limites dinâmicos, inclusão e remoção de campos, nomes personalizados, reordenação, códigos de texto, múltiplos preços, página incompleta, aliases, fórmulas, múltiplas abas, erros e segurança. Reabrem os arquivos Excel gerados e releem o CSV para comparar todos os campos com os dados transformados. A configuração inicial continua coberta nos agrupamentos de 1, 6, 10 e 75 produtos; também há testes com Categoria e com apenas o nome do produto.

## Publicar na Vercel

1. Envie o projeto para um repositório Git de sua preferência.
2. Na Vercel, escolha **Add New → Project** e importe o repositório.
3. Use as configurações já declaradas em `vercel.json`:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install` (ou o padrão da Vercel)
   - **Node.js:** 22.x ou superior compatível
4. Clique em **Deploy**.

Não há variáveis de ambiente, API do Canva ou configuração de servidor. O projeto está preparado para publicação, sem criação automática de conta ou deploy. Os limites do Canva são os especificados no pedido: a aceitação final do arquivo no serviço depende do modelo e das regras disponíveis na conta utilizada.

## Estrutura

```text
src/App.jsx              Interface e fluxo de conversão
src/components/Drawer.jsx Painéis laterais acessíveis
src/components/FieldManager.jsx Seleção, nomes, formatos e ordem dos campos
src/components/ResultPreview.jsx Prévia por produto ou arquivo
src/workspace.css        Sistema visual e layouts responsivos
src/lib/prices.js        Normalização decimal sem arredondamento
src/lib/fields.js        Esquema dos campos e limites dinâmicos
src/lib/import.js        Importação CSV/XLSX e cabeçalhos
src/lib/transform.js     Produtos, avisos, páginas e lotes
src/lib/export.js        Exportação e download
fixtures/products.js     Dados representativos
scripts/create-example.js Geração dos exemplos
test/                    Testes automatizados
public/                  Favicon e exemplos
vercel.json              Configuração do deploy estático
```

Referências: [ExcelJS](https://github.com/exceljs/exceljs), [PapaParse](https://www.papaparse.com/docs) e [Vite](https://vite.dev/guide/).
