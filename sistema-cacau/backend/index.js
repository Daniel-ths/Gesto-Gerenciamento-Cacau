const express = require('express');
const cors = require('cors');
const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO BANCO DE DADOS (NeDB) ---

const userDataPath = process.env.USER_DATA_PATH || __dirname;
const dbFolder = path.join(userDataPath, 'database');
const TRASH_RETENTION_DAYS = 3;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

if (!fs.existsSync(dbFolder)) {
    try {
        fs.mkdirSync(dbFolder, { recursive: true });
    } catch (err) {
        console.error('Erro crítico ao criar pasta do banco:', err);
    }
}

console.log('--> Banco de dados localizado em:', dbFolder);

const db = {
    clientes: Datastore.create({
        filename: path.join(dbFolder, 'clientes.db'),
        autoload: true,
        timestampData: true
    }),
    transacoes: Datastore.create({
        filename: path.join(dbFolder, 'transacoes.db'),
        autoload: true,
        timestampData: true
    })
};

db.transacoes.ensureIndex({ fieldName: 'clienteId' });

// --- HELPERS ---

const TIPOS_TRANSACAO = {
    ADIANTAMENTO: 'ADIANTAMENTO',
    VENDA_NOVO: 'VENDA_NOVO',
    DEPOSITO: 'DEPOSITO',
    VENDA_DEPOSITO: 'VENDA_DEPOSITO',
    SAQUE: 'SAQUE',
    DEPOSITO_DINHEIRO: 'DEPOSITO_DINHEIRO'
};

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
};

const isValidTransactionType = (tipo) => {
    return Object.values(TIPOS_TRANSACAO).includes(tipo);
};

const isClientDeleted = (client) => {
    return !!client?.deleted_at;
};

const calcularEstoqueCliente = (transacoes = []) => {
    let entradas = 0;
    let saidas = 0;

    for (const t of transacoes) {
        if (t.tipo === TIPOS_TRANSACAO.DEPOSITO) entradas += toNumber(t.peso_kg);
        if (t.tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO) saidas += toNumber(t.peso_kg);
    }

    return round2(entradas - saidas);
};

const calcularSaldoCliente = (transacoes = []) => {
    let total = 0;

    for (const t of transacoes) {
        total += toNumber(t.valor_total);
    }

    return round2(total);
};

const agruparTransacoesPorCliente = (transacoes = []) => {
    const map = new Map();

    for (const t of transacoes) {
        const key = String(t.clienteId || '');
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
    }

    return map;
};

const enrichClient = (cliente, transacoesDoCliente = []) => {
    return {
        ...cliente,
        id: cliente._id,
        saldo_atual: calcularSaldoCliente(transacoesDoCliente),
        total_depositado: calcularEstoqueCliente(transacoesDoCliente)
    };
};

const purgeExpiredTrash = async () => {
    try {
        const now = new Date();

        const expiredClients = await db.clientes.find({
            deleted_at: { $exists: true },
            purge_at: { $lte: now }
        });

        if (!expiredClients.length) return 0;

        for (const client of expiredClients) {
            await Promise.all([
                db.transacoes.remove({ clienteId: String(client._id) }, { multi: true }),
                db.clientes.remove({ _id: client._id }, {})
            ]);
        }

        console.log(`[LIXEIRA] ${expiredClients.length} cliente(s) apagado(s) definitivamente.`);
        return expiredClients.length;
    } catch (err) {
        console.error('Erro ao limpar lixeira expirada:', err);
        return 0;
    }
};

// limpeza automática ao iniciar
purgeExpiredTrash();
// limpeza periódica a cada 1 hora
setInterval(() => {
    purgeExpiredTrash();
}, 60 * 60 * 1000);

// --- ROTAS DA API ---

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        path: dbFolder,
        type: 'NeDB',
        transaction_types: Object.values(TIPOS_TRANSACAO),
        trash_retention_days: TRASH_RETENTION_DAYS
    });
});

// LISTAR CLIENTES ATIVOS
app.get('/clientes', async (req, res) => {
    try {
        await purgeExpiredTrash();

        const [clientes, todasTransacoes] = await Promise.all([
            db.clientes.find({
                $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }]
            }).sort({ nome: 1 }),
            db.transacoes.find(
                {},
                {
                    clienteId: 1,
                    valor_total: 1,
                    valor_visual: 1,
                    tipo: 1,
                    peso_kg: 1
                }
            )
        ]);

        const transacoesPorCliente = agruparTransacoesPorCliente(todasTransacoes);

        const clientesFormatados = clientes.map((c) => {
            const transacoesDoCliente = transacoesPorCliente.get(String(c._id)) || [];
            return enrichClient(c, transacoesDoCliente);
        });

        res.json(clientesFormatados);
    } catch (err) {
        console.error('Erro ao listar clientes:', err);
        res.status(500).json({ error: err.message });
    }
});

// LISTAR LIXEIRA
app.get('/clientes/lixeira', async (req, res) => {
    try {
        await purgeExpiredTrash();

        const [clientesLixeira, todasTransacoes] = await Promise.all([
            db.clientes.find({
                deleted_at: { $exists: true }
            }).sort({ deleted_at: -1 }),
            db.transacoes.find(
                {},
                {
                    clienteId: 1,
                    valor_total: 1,
                    valor_visual: 1,
                    tipo: 1,
                    peso_kg: 1
                }
            )
        ]);

        const transacoesPorCliente = agruparTransacoesPorCliente(todasTransacoes);

        const data = clientesLixeira.map((c) => {
            const transacoesDoCliente = transacoesPorCliente.get(String(c._id)) || [];
            return {
                ...enrichClient(c, transacoesDoCliente),
                deleted_at: c.deleted_at,
                purge_at: c.purge_at
            };
        });

        res.json(data);
    } catch (err) {
        console.error('Erro ao listar lixeira:', err);
        res.status(500).json({ error: err.message });
    }
});

// CRIAR CLIENTE
app.post('/clientes', async (req, res) => {
    try {
        const { nome, cpf, telefone, endereco, taxa_juros, perfil_risco } = req.body;

        const newDoc = await db.clientes.insert({
            nome,
            cpf,
            telefone,
            endereco,
            taxa_juros: toNumber(taxa_juros || 0),
            perfil_risco: perfil_risco || 'Normal'
        });

        res.json({
            id: newDoc._id,
            message: 'Cliente cadastrado com sucesso!'
        });
    } catch (err) {
        console.error('Erro ao criar cliente:', err);
        res.status(500).json({ error: err.message });
    }
});

// EDITAR CLIENTE
app.put('/clientes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cpf, telefone, endereco, taxa_juros, perfil_risco } = req.body;

        const cliente = await db.clientes.findOne({ _id: id });
        if (!cliente) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }

        if (isClientDeleted(cliente)) {
            return res.status(400).json({ message: 'Cliente está na lixeira e não pode ser editado.' });
        }

        await db.clientes.update(
            { _id: id },
            {
                $set: {
                    nome,
                    cpf,
                    telefone,
                    endereco,
                    taxa_juros: toNumber(taxa_juros || 0),
                    perfil_risco: perfil_risco || 'Normal'
                }
            }
        );

        res.json({ message: 'Cliente atualizado!' });
    } catch (err) {
        console.error('Erro ao editar cliente:', err);
        res.status(500).json({ error: err.message });
    }
});

// MOVER CLIENTE PARA LIXEIRA
app.delete('/clientes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const cliente = await db.clientes.findOne({ _id: id });

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }

        if (isClientDeleted(cliente)) {
            return res.status(400).json({ message: 'Cliente já está na lixeira.' });
        }

        const deletedAt = new Date();
        const purgeAt = new Date(deletedAt.getTime() + TRASH_RETENTION_MS);

        await db.clientes.update(
            { _id: id },
            {
                $set: {
                    deleted_at: deletedAt,
                    purge_at: purgeAt
                }
            }
        );

        res.json({
            message: 'Cliente movido para a lixeira.',
            deleted_at: deletedAt,
            purge_at: purgeAt
        });
    } catch (err) {
        console.error('Erro ao mover cliente para lixeira:', err);
        res.status(500).json({ error: err.message });
    }
});

// RESTAURAR CLIENTE DA LIXEIRA
app.post('/clientes/:id/restaurar', async (req, res) => {
    try {
        const { id } = req.params;

        const cliente = await db.clientes.findOne({ _id: id });

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }

        if (!isClientDeleted(cliente)) {
            return res.status(400).json({ message: 'Cliente não está na lixeira.' });
        }

        await db.clientes.update(
            { _id: id },
            {
                $unset: {
                    deleted_at: true,
                    purge_at: true
                }
            }
        );

        res.json({ message: 'Cliente restaurado com sucesso.' });
    } catch (err) {
        console.error('Erro ao restaurar cliente:', err);
        res.status(500).json({ error: err.message });
    }
});

// EXCLUIR DEFINITIVAMENTE DA LIXEIRA
app.delete('/clientes/:id/definitivo', async (req, res) => {
    try {
        const { id } = req.params;

        const cliente = await db.clientes.findOne({ _id: id });

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }

        if (!isClientDeleted(cliente)) {
            return res.status(400).json({ message: 'Cliente não está na lixeira.' });
        }

        await Promise.all([
            db.transacoes.remove({ clienteId: id }, { multi: true }),
            db.clientes.remove({ _id: id }, {})
        ]);

        res.json({ message: 'Cliente apagado definitivamente.' });
    } catch (err) {
        console.error('Erro ao excluir definitivamente:', err);
        res.status(500).json({ error: err.message });
    }
});

// CONTA CORRENTE
app.get('/conta-corrente/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        const [cliente, todasTransacoes] = await Promise.all([
            db.clientes.findOne({ _id: id }),
            db.transacoes.find({ clienteId: id }).sort({ data_transacao: -1 })
        ]);

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente não encontrado' });
        }

        let extrato = todasTransacoes;

        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;

            if (end) end.setHours(23, 59, 59, 999);

            extrato = todasTransacoes.filter((t) => {
                const dataT = new Date(t.data_transacao || t.createdAt);
                if (start && dataT < start) return false;
                if (end && dataT > end) return false;
                return true;
            });
        }

        const saldoTotal = calcularSaldoCliente(todasTransacoes);
        const totalDepositado = calcularEstoqueCliente(todasTransacoes);

        res.json({
            cliente: {
                ...cliente,
                id: cliente._id,
                saldo: saldoTotal,
                total_depositado: totalDepositado,
                taxa_juros: cliente.taxa_juros || 0,
                deleted_at: cliente.deleted_at || null,
                purge_at: cliente.purge_at || null
            },
            extrato: extrato.map((t) => ({
                ...t,
                id: t._id,
                is_deposito: t.tipo === TIPOS_TRANSACAO.DEPOSITO,
                is_venda_deposito: t.tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO,
                is_saque: t.tipo === TIPOS_TRANSACAO.SAQUE,
                is_deposito_dinheiro: t.tipo === TIPOS_TRANSACAO.DEPOSITO_DINHEIRO
            }))
        });
    } catch (err) {
        console.error('[ERRO API]', err);
        res.status(500).json({ error: err.message });
    }
});

// LISTAR TODAS AS TRANSAÇÕES
app.get('/transacoes', async (req, res) => {
    try {
        await purgeExpiredTrash();

        const clientes = await db.clientes.find({}, { _id: 1, deleted_at: 1 });
        const deletedIds = new Set(
            clientes.filter((c) => isClientDeleted(c)).map((c) => String(c._id))
        );

        const transacoes = await db.transacoes.find({}).sort({ data_transacao: -1 });

        res.json(
            transacoes
                .filter((t) => !deletedIds.has(String(t.clienteId)))
                .map((t) => ({
                    ...t,
                    id: t._id
                }))
        );
    } catch (err) {
        console.error('Erro ao buscar transações:', err);
        res.status(500).json({ message: 'Erro ao buscar transações.' });
    }
});

// NOVA TRANSAÇÃO
app.post('/transacoes', async (req, res) => {
    try {
        const {
            clienteId,
            tipo,
            peso_kg,
            preco_por_kg,
            valor_total,
            observacao,
            data_transacao
        } = req.body;

        if (!clienteId) {
            return res.status(400).json({ message: 'clienteId é obrigatório.' });
        }

        if (!tipo || !isValidTransactionType(tipo)) {
            return res.status(400).json({ message: 'Tipo de transação inválido.' });
        }

        const cliente = await db.clientes.findOne({ _id: String(clienteId) });
        if (!cliente) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }

        if (isClientDeleted(cliente)) {
            return res.status(400).json({ message: 'Cliente está na lixeira.' });
        }

        const pesoNum = round2(toNumber(peso_kg));
        const precoNum = round2(toNumber(preco_por_kg));
        const valorRaw = round2(toNumber(valor_total));

        let valorFinalFinanceiro = 0;

        if (tipo === TIPOS_TRANSACAO.ADIANTAMENTO) {
            if (valorRaw <= 0) {
                return res.status(400).json({
                    message: 'Informe um valor válido para o adiantamento.'
                });
            }
            valorFinalFinanceiro = -Math.abs(valorRaw);
        } else if (tipo === TIPOS_TRANSACAO.DEPOSITO) {
            if (pesoNum <= 0) {
                return res.status(400).json({
                    message: 'Informe um peso válido para o depósito.'
                });
            }
            valorFinalFinanceiro = 0;
        } else if (tipo === TIPOS_TRANSACAO.VENDA_NOVO) {
            if (pesoNum <= 0 || precoNum <= 0 || valorRaw <= 0) {
                return res.status(400).json({
                    message: 'Informe peso, preço e valor válidos para a venda.'
                });
            }
            valorFinalFinanceiro = Math.abs(valorRaw);
        } else if (tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO) {
            if (pesoNum <= 0 || precoNum <= 0 || valorRaw <= 0) {
                return res.status(400).json({
                    message: 'Informe peso, preço e valor válidos para a venda de depósito.'
                });
            }

            const transacoesCliente = await db.transacoes.find({
                clienteId: String(clienteId)
            });

            const estoqueAtual = calcularEstoqueCliente(transacoesCliente);

            if (pesoNum > estoqueAtual) {
                return res.status(400).json({
                    message: `Estoque insuficiente. Estoque atual: ${estoqueAtual.toLocaleString('pt-BR')} Kg.`
                });
            }

            valorFinalFinanceiro = Math.abs(valorRaw);
        } else if (tipo === TIPOS_TRANSACAO.SAQUE) {
            if (valorRaw <= 0) {
                return res.status(400).json({
                    message: 'Informe um valor válido para o saque.'
                });
            }
            valorFinalFinanceiro = -Math.abs(valorRaw);
        } else if (tipo === TIPOS_TRANSACAO.DEPOSITO_DINHEIRO) {
            if (valorRaw <= 0) {
                return res.status(400).json({
                    message: 'Informe um valor válido para o depósito de dinheiro.'
                });
            }
            valorFinalFinanceiro = Math.abs(valorRaw);
        }

        const novaTransacao = {
            clienteId: String(clienteId),
            tipo,
            peso_kg: pesoNum,
            preco_por_kg: precoNum,
            valor_total: valorFinalFinanceiro,
            valor_visual: valorRaw,
            observacao: observacao || '',
            data_transacao: data_transacao ? new Date(data_transacao) : new Date()
        };

        const doc = await db.transacoes.insert(novaTransacao);

        res.json({
            id: doc._id,
            message: 'Transação registrada!'
        });
    } catch (err) {
        console.error('Erro ao registrar transação:', err);
        res.status(500).json({ error: err.message });
    }
});

// EXCLUIR TRANSAÇÃO
app.delete('/transacoes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const transacao = await db.transacoes.findOne({ _id: id });
        if (!transacao) {
            return res.status(404).json({ message: 'Transação não encontrada.' });
        }

        await db.transacoes.remove({ _id: id }, {});
        res.json({ message: 'Transação excluída.' });
    } catch (err) {
        console.error('Erro ao excluir transação:', err);
        res.status(500).json({ error: err.message });
    }
});

// MÉTRICAS GERAIS
app.get('/metrics/saldo-total', async (req, res) => {
    try {
        await purgeExpiredTrash();

        const [todasTransacoes, clientes] = await Promise.all([
            db.transacoes.find({}),
            db.clientes.find({
                $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }]
            })
        ]);

        const transacoesPorCliente = agruparTransacoesPorCliente(todasTransacoes);

        let total_credor = 0;
        let total_devedor = 0;
        let total_estoque = 0;

        for (const cli of clientes) {
            const transacoesCli = transacoesPorCliente.get(String(cli._id)) || [];

            const saldoCli = calcularSaldoCliente(transacoesCli);
            const estoqueCli = calcularEstoqueCliente(transacoesCli);

            if (saldoCli > 0) {
                total_credor += saldoCli;
            } else if (saldoCli < 0) {
                total_devedor += Math.abs(saldoCli);
            }

            total_estoque += estoqueCli;
        }

        res.json({
            total_credor: round2(total_credor),
            total_devedor: round2(total_devedor),
            total_estoque: round2(total_estoque)
        });
    } catch (err) {
        console.error('Erro ao calcular métricas:', err);
        res.status(500).json({ error: err.message });
    }
});

// BACKUP
app.get('/backup/clientes', (req, res) => {
    const file = path.join(dbFolder, 'clientes.db');
    if (fs.existsSync(file)) {
        res.download(file);
    } else {
        res.status(404).send('Sem dados.');
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor NeDB rodando na porta ${PORT}`);
});