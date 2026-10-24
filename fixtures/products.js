// Representative data, not the user's original spreadsheet.
export const exampleProducts = [
  ['Achoc Po Chocolatto 3C Sh Leve 560G Pague 500g', '13,99'],
  ['Achoc Po Nescau Cilindro 2.0 Lt 200G', '5,99'],
  ['Achoc Pronto Nescau 180Ml', '1,69'],
  ['Acucar Payol Cristal 1kg', '2,95'],
  ...Array.from({ length: 76 }, (_, index) => {
    const names = ['Arroz branco 5kg', 'Feijão carioca 1kg', 'Café torrado 500g', 'Leite integral 1L', 'Óleo de soja 900ml', 'Macarrão espaguete 500g', 'Biscoito, água e sal 350g', 'Farinha de trigo 1kg'];
    const prices = ['13,995', '5,50', '0,09', '13,9', '1.234,50', '10,90', '8,50', '1,99'];
    return [`${names[index % names.length]} · item ${index + 5}`, prices[index % prices.length]];
  }),
];
