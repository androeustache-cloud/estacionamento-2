const readline = require('readline');
const { db, initDb } = require('./database');

initDb();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// --- OPERAÇÕES DO BANCO ---

function cadastrarCliente(nome, cpf, telefone) {
  try {
    const stmt = db.prepare('INSERT INTO clientes (nome, cpf, telefone) VALUES (?, ?, ?)');
    const info = stmt.run(nome, cpf, telefone);
    console.log(`\nCliente cadastrado com sucesso! ID: ${info.lastInsertRowid}`);
  } catch (err) {
    console.log(`\nErro ao cadastrar cliente: ${err.message}`);
  }
}

function cadastrarVeiculo(placa, clienteId, marcaModelo, cor, tipo, tamanho, ano) {
  try {
    const stmt = db.prepare(`
      INSERT INTO veiculos (placa, cliente_id, marca_modelo, cor, tipo, tamanho, ano)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      placa.toUpperCase().trim(),
      clienteId ? parseInt(clienteId) : null,
      marcaModelo,
      cor,
      tipo.toUpperCase().trim(),
      tamanho.toUpperCase().trim(),
      parseInt(ano)
    );
    console.log(`\nVeículo de placa ${placa.toUpperCase()} cadastrado com sucesso!`);
  } catch (err) {
    console.log(`\nErro ao cadastrar veículo: ${err.message}`);
  }
}

function listarVagasLivres() {
  const stmt = db.prepare("SELECT id, codigo, tipo_vaga FROM vagas WHERE status = 'LIVRE'");
  return stmt.all();
}

function registrarEntrada(placa, vagaId, tipoCobranca = 'HORA') {
  placa = placa.toUpperCase().trim();
  
  // 1. Verifica se o veículo existe
  const veiculo = db.prepare('SELECT tipo FROM veiculos WHERE placa = ?').get(placa);
  if (!veiculo) {
    console.log('\nErro: Veículo não encontrado! Realize o cadastro prévio.');
    return;
  }

  // 2. Verifica se já está estacionado
  const emAberto = db.prepare("SELECT id FROM registros WHERE placa_veiculo = ? AND status = 'ABERTO'").get(placa);
  if (emAberto) {
    console.log('\nErro: Este veículo já possui uma entrada em aberto.');
    return;
  }

  // 3. Ocupa a vaga e cria o registro em uma transação
  const transacao = db.transaction(() => {
    const vagaStmt = db.prepare("UPDATE vagas SET status = 'OCUPADA' WHERE id = ? AND status = 'LIVRE'");
    const res = vagaStmt.run(vagaId);
    if (res.changes === 0) throw new Error('Vaga indisponível.');

    const regStmt = db.prepare(`
      INSERT INTO registros (placa_veiculo, vaga_id, tipo_cobranca)
      VALUES (?, ?, ?)
    `);
    regStmt.run(placa, vagaId, tipoCobranca.toUpperCase());
  });

  try {
    transacao();
    console.log(`\nEntrada registrada com sucesso para o veículo ${placa}!`);
  } catch (err) {
    console.log(`\nErro na entrada: ${err.message}`);
  }
}

function registrarSaida(placa) {
  placa = placa.toUpperCase().trim();

  const registro = db.prepare(`
    SELECT r.id, r.vaga_id, r.data_entrada, r.tipo_cobranca, v.tipo
    FROM registros r
    JOIN veiculos v ON r.placa_veiculo = v.placa
    WHERE r.placa_veiculo = ? AND r.status = 'ABERTO'
  `).get(placa);

  if (!registro) {
    console.log('\nErro: Nenhuma entrada em aberto encontrada para esta placa.');
    return;
  }

  const precos = db.prepare('SELECT valor_hora, valor_diaria, valor_anual FROM tabelas_precos WHERE tipo_veiculo = ?').get(registro.tipo);

  // Cálculo de tempo
  const dataEntrada = new Date(registro.data_entrada);
  const dataSaida = new Date();
  const diffHoras = Math.abs(dataSaida - dataEntrada) / 36e5; // Diferença em horas

  let valorTotal = 0;
  if (registro.tipo_cobranca === 'ANUAL') {
    valorTotal = 0.00;
  } else if (registro.tipo_cobranca === 'DIARIA') {
    const dias = Math.max(1, Math.ceil(diffHoras / 24));
    valorTotal = dias * precos.valor_diaria;
  } else { // HORA
    const horas = Math.max(1, Math.ceil(diffHoras));
    valorTotal = horas * precos.valor_hora;
  }

  // Finaliza registro e libera vaga
  const transacao = db.transaction(() => {
    db.prepare(`
      UPDATE registros 
      SET data_saida = CURRENT_TIMESTAMP, valor_pago = ?, status = 'CONCLUIDO' 
      WHERE id = ?
    `).run(valorTotal, registro.id);

    db.prepare("UPDATE vagas SET status = 'LIVRE' WHERE id = ?").run(registro.vaga_id);
  });

  try {
    transacao();
    console.log('\n================ RECIBO DE SAÍDA ================');
    console.log(`Placa: ${placa} | Tipo: ${registro.tipo}`);
    console.log(`Entrada: ${registro.data_entrada}`);
    console.log(`Saída: ${dataSaida.toISOString().replace('T', ' ').substring(0, 19)}`);
    console.log(`Modalidade: ${registro.tipo_cobranca}`);
    console.log(`Total Pago: R$ ${valorTotal.toFixed(2)}`);
    console.log('=================================================\n');
  } catch (err) {
    console.log(`\nErro no processamento da saída: ${err.message}`);
  }
}

// --- MENU PRINCIPAL ---

async function menu() {
  while (true) {
    console.log('\n=== SISTEMA DE GESTÃO DE ESTACIONAMENTO (JS/Node) ===');
    console.log('1. Cadastrar Cliente');
    console.log('2. Cadastrar Veículo');
    console.log('3. Listar Vagas Livres');
    console.log('4. Registrar Entrada de Veículo');
    console.log('5. Registrar Saída e Calcular Valor');
    console.log('0. Sair');

    const opcao = await question('\nEscolha uma opção: ');

    switch (opcao.trim()) {
      case '1': {
        const nome = await question('Nome do Cliente: ');
        const cpf = await question('CPF: ');
        const telefone = await question('Telefone: ');
        cadastrarCliente(nome, cpf, telefone);
        break;
      }
      case '2': {
        const placa = await question('Placa do Veículo: ');
        const clienteId = await question('ID do Cliente (deixe em branco se avulso): ');
        const marcaModelo = await question('Marca/Modelo (ex: VW Gol): ');
        const cor = await question('Cor: ');
        const tipo = await question('Tipo (CARRO/MOTO/CAMINHONETE): ');
        const tamanho = await question('Tamanho (PEQUENO/MEDIO/GRANDE): ');
        const ano = await question('Ano: ');
        cadastrarVeiculo(placa, clienteId, marcaModelo, cor, tipo, tamanho, ano);
        break;
      }
      case '3': {
        const vagas = listarVagasLivres();
        console.log('\n--- VAGAS DISPONÍVEIS ---');
        vagas.forEach((v) => console.log(`ID: ${v.id} | Código: ${v.codigo} | Tipo: ${v.tipo_vaga}`));
        break;
      }
      case '4': {
        const placa = await question('Placa do Veículo: ');
        const vagas = listarVagasLivres();
        if (vagas.length === 0) {
          console.log('\nNão há vagas disponíveis!');
          break;
        }
        console.log('\nVagas Disponíveis:');
        vagas.forEach((v) => console.log(`ID: ${v.id} - Código: ${v.codigo} (${v.tipo_vaga})`));
        const vagaId = await question('Informe o ID da Vaga escolhida: ');
        const tipoCobranca = (await question('Tipo de Cobrança (HORA/DIARIA/ANUAL) [Padrão: HORA]: ')) || 'HORA';
        registrarEntrada(placa, parseInt(vagaId), tipoCobranca);
        break;
      }
      case '5': {
        const placa = await question('Placa do Veículo: ');
        registrarSaida(placa);
        break;
      }
      case '0':
        console.log('\nEncerrando o sistema...');
        rl.close();
        process.exit(0);
      default:
        console.log('\nOpção inválida!');
    }
  }
}

menu();