import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Lock } from 'lucide-react';

import ClientList from './pages/ClientList';
import ContaCorrente from './pages/ContaCorrente';
import GeneralReport from './pages/GeneralReport';

const LICENSE_URL =
  'https://gist.githubusercontent.com/Daniel-ths/ace75c57234ce4981f00cb76b0054423/raw/status.json';

function App() {
  const [bloqueado, setBloqueado] = useState(false);
  const [mensagem, setMensagem] = useState('Verificando licença...');
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    const verificarLicenca = async () => {
      try {
        const urlSemCache = `${LICENSE_URL}?t=${Date.now()}`;
        const response = await fetch(urlSemCache, { cache: 'no-store' });

        if (response.ok) {
          const data = await response.json();

          if (data.status === 'BLOQUEADO') {
            setBloqueado(true);
            setMensagem(data.mensagem || 'Acesso suspenso pelo administrador.');
          }
        }
      } catch (error) {
        console.log('Modo Offline ou Erro:', error);
      } finally {
        setVerificando(false);
      }
    };

    verificarLicenca();
  }, []);

  if (verificando) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
        }}
      />
    );
  }

  if (bloqueado) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            background: '#ef4444',
            padding: '20px',
            borderRadius: '50%',
            marginBottom: '20px',
          }}
        >
          <Lock size={64} color="#fff" />
        </div>

        <h1
          style={{
            fontSize: '2rem',
            marginBottom: '10px',
            fontWeight: 'bold',
          }}
        >
          Acesso Suspenso
        </h1>

        <p
          style={{
            color: '#d1d5db',
            maxWidth: '400px',
            textAlign: 'center',
            fontSize: '1.1rem',
          }}
        >
          {mensagem}
        </p>

        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '30px',
            padding: '12px 25px',
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid #4b5563',
            color: '#fff',
            borderRadius: '6px',
          }}
        >
          Tentar Reconectar
        </button>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<ClientList screen="suppliers" />} />
        <Route path="/cadastros" element={<ClientList screen="suppliers" />} />
        <Route path="/compra-venda" element={<ClientList screen="trade" />} />
        <Route path="/conta-corrente/:id" element={<ContaCorrente />} />
        <Route path="/relatorio-geral" element={<GeneralReport />} />
      </Routes>
    </Router>
  );
}

export default App;
