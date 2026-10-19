-- Habilitar Foreign Keys no SQLite
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT UNIQUE NOT NULL,
    telefone TEXT NOT NULL,
    tipo_cliente TEXT CHECK(tipo_cliente IN ('AVULSO', 'MENSALISTA', 'VIP')) DEFAULT 'AVULSO',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS veiculos (
    placa TEXT PRIMARY KEY,
    cliente_id INTEGER,
    marca_modelo TEXT NOT NULL,
    cor TEXT NOT NULL,
    tipo_veiculo TEXT CHECK(tipo_veiculo IN ('CARRO', 'MOTO', 'CAMINHONETE')) NOT NULL,
    tamanho TEXT CHECK(tamanho IN ('PEQUENO', 'MEDIO', 'GRANDE')) NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vagas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    tipo_vaga TEXT CHECK(tipo_vaga IN ('NORMAL', 'PREFERENCIAL', 'IDOSO', 'PCD')) NOT NULL,
    status TEXT CHECK(status IN ('LIVRE', 'OCUPADA', 'MANUTENCAO')) DEFAULT 'LIVRE'
);

CREATE TABLE IF NOT EXISTS tabelas_precos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    tipo_veiculo TEXT NOT NULL,
    valor_hora REAL NOT NULL,
    valor_diaria REAL NOT NULL,
    valor_mensal REAL NOT NULL,
    tolerancia_minutos INTEGER DEFAULT 15
);

CREATE TABLE IF NOT EXISTS registros_estacionamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placa_veiculo TEXT NOT NULL,
    vaga_id INTEGER NOT NULL,
    data_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_saida DATETIME,
    valor_total REAL DEFAULT 0.0,
    status_pagamento TEXT CHECK(status_pagamento IN ('PENDENTE', 'PAGO', 'CANCELADO')) DEFAULT 'PENDENTE',
    FOREIGN KEY (placa_veiculo) REFERENCES veiculos(placa),
    FOREIGN KEY (vaga_id) REFERENCES vagas(id)
);