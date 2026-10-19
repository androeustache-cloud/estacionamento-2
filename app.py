import sqlite3
from datetime import datetime
import math

DB_NAME = "estacionamento.db"

def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

# --- CADASTROS ---

def cadastrar_cliente(nome, cpf, telefone):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO clientes (nome, cpf, telefone) VALUES (?, ?, ?)", (nome, cpf, telefone))
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        print("Erro: CPF já cadastrado.")
        return None
    finally:
        conn.close()

def cadastrar_veiculo(placa, cliente_id, marca_modelo, cor, tipo, tamanho, ano):
    conn = get_connection()
    cursor = conn.cursor()
    placa = placa.upper().strip()
    try:
        cursor.execute("""
            INSERT INTO veiculos (placa, cliente_id, marca_modelo, cor, tipo, tamanho, ano)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (placa, cliente_id, marca_modelo, cor, tipo.upper(), tamanho.upper(), ano))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        print("Erro: Placa já cadastrada ou cliente inválido.")
        return False
    finally:
        conn.close()

# --- OPERAÇÕES DO ESTACIONAMENTO ---

def listar_vagas_livres(tipo_vaga=None):
    conn = get_connection()
    cursor = conn.cursor()
    if tipo_vaga:
        cursor.execute("SELECT id, codigo, tipo_vaga FROM vagas WHERE status = 'LIVRE' AND tipo_vaga = ?", (tipo_vaga.upper(),))
    else:
        cursor.execute("SELECT id, codigo, tipo_vaga FROM vagas WHERE status = 'LIVRE'")
    vagas = cursor.fetchall()
    conn.close()
    return vagas

def registrar_entrada(placa, vaga_id, tipo_cobranca='HORA'):
    conn = get_connection()
    cursor = conn.cursor()
    placa = placa.upper().strip()

    # Valida se veículo está cadastrado
    cursor.execute("SELECT tipo FROM veiculos WHERE placa = ?", (placa,))
    veiculo = cursor.fetchone()
    if not veiculo:
        print("Erro: Veículo não encontrado! Realize o cadastro antes da entrada.")
        conn.close()
        return False

    # Valida se o veículo já está no estacionamento
    cursor.execute("SELECT id FROM registros WHERE placa_veiculo = ? AND status = 'ABERTO'", (placa,))
    if cursor.fetchone():
        print("Erro: Veículo já possui um registro de entrada em aberto.")
        conn.close()
        return False

    # Altera status da vaga e cria registro
    cursor.execute("UPDATE vagas SET status = 'OCUPADA' WHERE id = ? AND status = 'LIVRE'", (vaga_id,))
    if cursor.rowcount == 0:
        print("Erro: Vaga indisponível.")
        conn.close()
        return False

    cursor.execute("""
        INSERT INTO registros (placa_veiculo, vaga_id, data_entrada, tipo_cobranca)
        VALUES (?, ?, CURRENT_TIMESTAMP, ?)
    """, (placa, vaga_id, tipo_cobranca.upper()))
    
    conn.commit()
    conn.close()
    print(f"Entrada registrada para a placa {placa}!")
    return True

def registrar_saida(placa):
    conn = get_connection()
    cursor = conn.cursor()
    placa = placa.upper().strip()

    cursor.execute("""
        SELECT r.id, r.vaga_id, r.data_entrada, r.tipo_cobranca, v.tipo
        FROM registros r
        JOIN veiculos v ON r.placa_veiculo = v.placa
        WHERE r.placa_veiculo = ? AND r.status = 'ABERTO'
    """, (placa,))
    registro = cursor.fetchone()

    if not registro:
        print("Erro: Registro de entrada não encontrado para esta placa.")
        conn.close()
        return None

    reg_id, vaga_id, str_entrada, tipo_cobranca, tipo_veiculo = registro

    # Busca tabela de preços do veículo
    cursor.execute("SELECT valor_hora, valor_diaria, valor_anual FROM tabelas_precos WHERE tipo_veiculo = ?", (tipo_veiculo,))
    p_hora, p_diaria, p_anual = cursor.fetchone()

    # Cálculo do tempo decorrido
    fmt = "%Y-%m-%d %H:%M:%S"
    data_entrada = datetime.strptime(str_entrada, fmt)
    data_saida = datetime.now()
    diferenca = data_saida - data_entrada

    # Regras de cálculo
    if tipo_cobranca == 'ANUAL':
        valor_total = 0.0  # Já cobrado via contrato
    elif tipo_cobranca == 'DIARIA':
        dias = max(1, math.ceil(diferenca.total_seconds() / 86400))
        valor_total = dias * p_diaria
    else:  # Cobrança por HORA
        horas = max(1, math.ceil(diferenca.total_seconds() / 3600))
        valor_total = horas * p_hora

    # Atualiza registro de saída e libera vaga
    cursor.execute("""
        UPDATE registros 
        SET data_saida = CURRENT_TIMESTAMP, valor_pago = ?, status = 'CONCLUIDO' 
        WHERE id = ?
    """, (valor_total, reg_id))

    cursor.execute("UPDATE vagas SET status = 'LIVRE' WHERE id = ?", (vaga_id,))

    conn.commit()
    conn.close()

    print(f"\n--- RECIBO DE SAÍDA ---")
    print(f"Placa: {placa} | Veículo: {tipo_veiculo}")
    print(f"Entrada: {str_entrada} | Saída: {data_saida.strftime(fmt)}")
    print(f"Tipo Cobrança: {tipo_cobranca}")
    print(f"Total a Pagar: R$ {valor_total:.2f}")
    return valor_total