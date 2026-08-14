// ==========================================
// 🔌 SUPABASE
// ==========================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://gmdrxybtqisubndiqtym.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__vtGf3D53lPsIPAru9TO3Q_xg05Goq-';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// Variáveis Globais
let listaPacientesGlobais = [];
let listaAgendaGlobal = [];
let listaTransacoesGlobais = [];
let listaTarefasGlobais = [];

let acessoAutorizado = false; 
let telaAlvoPendente = null;
let elementoMenuPendente = null;
let calendarInstance = null;

// Função de salvamento seguro usando upsert
async function salvarBD() {
    if (!currentUser) return;
    const uid = currentUser.id;

    try {
        // 1. Pacientes
        if (listaPacientesGlobais.length > 0) {
            const { error } = await supabase.from('pacientes').upsert(listaPacientesGlobais.map(p => ({
                id: p.id, user_id: uid, nome: p.nome || '', nascimento: p.nascimento || null,
                whatsapp: p.whatsapp || null, email: p.email || null, cpf: p.cpf || null,
                endereco: p.endereco || null, cep: p.cep || null,
                valor: p.valor ? parseFloat(p.valor) : null, motivo: p.motivo || null
            })));
            if (error) throw error;
        }

        // 2. Prontuários (Achatando o array de cada paciente)
        let todosProntuarios = [];
        listaPacientesGlobais.forEach(p => {
            (p.prontuarios || []).forEach(pr => {
                todosProntuarios.push({ id: pr.id, paciente_id: p.id, user_id: uid, data: pr.data, texto: pr.texto });
            });
        });
        if (todosProntuarios.length > 0) {
            const { error } = await supabase.from('prontuarios').upsert(todosProntuarios);
            if (error) throw error;
        }

        // 3. Agenda
        if (listaAgendaGlobal.length > 0) {
            const { error } = await supabase.from('agenda').upsert(listaAgendaGlobal.map(a => ({
                id: a.id, user_id: uid, tipo: a.tipo, descricao: a.descricao || '',
                whatsapp: a.whatsapp || null, data: a.data, horario: a.horario, duracao: a.duracao || 60,
                google_event_id: a.google_event_id || null
            })));
            if (error) throw error;
        }

        // 4. Transações Financeiras
        if (listaTransacoesGlobais.length > 0) {
            const { error } = await supabase.from('transacoes').upsert(listaTransacoesGlobais.map(t => ({
                id: t.id, user_id: uid, nome_paciente: t.nomePaciente || null,
                valor: parseFloat(t.valor) || 0, data: t.data, status: t.status
            })));
            if (error) throw error;
        }

        // 5. Tarefas
        if (listaTarefasGlobais.length > 0) {
            const { error } = await supabase.from('tarefas').upsert(listaTarefasGlobais.map(t => ({
                id: t.id, user_id: uid, texto: t.texto, status: t.status, prioridade: t.prioridade
            })));
            if (error) throw error;
        }
    } catch (err) {
        console.error('Erro ao salvar no Supabase:', err);
        alert('⚠️ Não foi possível salvar na nuvem agora. Verifique sua internet e tente de novo.');
    }
}

// Busca tudo do Supabase e preenche as listas em memória
async function carregarTudoDoSupabase() {
    const [pacRes, pronRes, agRes, finRes, tarRes] = await Promise.all([
        supabase.from('pacientes').select('*').order('nome'),
        supabase.from('prontuarios').select('*'),
        supabase.from('agenda').select('*'),
        supabase.from('transacoes').select('*'),
        supabase.from('tarefas').select('*')
    ]);

    if (pacRes.error) console.error(pacRes.error);
    if (pronRes.error) console.error(pronRes.error);
    if (agRes.error) console.error(agRes.error);
    if (finRes.error) console.error(finRes.error);
    if (tarRes.error) console.error(tarRes.error);

    const prontuariosPorPaciente = {};
    (pronRes.data || []).forEach(pr => {
        if (!prontuariosPorPaciente[pr.paciente_id]) prontuariosPorPaciente[pr.paciente_id] = [];
        prontuariosPorPaciente[pr.paciente_id].push({ id: pr.id, data: pr.data, texto: pr.texto });
    });

    listaPacientesGlobais = (pacRes.data || []).map(p => ({
        id: p.id, nome: p.nome, nascimento: p.nascimento, whatsapp: p.whatsapp, email: p.email,
        cpf: p.cpf, endereco: p.endereco, cep: p.cep, valor: p.valor, motivo: p.motivo,
        prontuarios: prontuariosPorPaciente[p.id] || []
    }));

    listaAgendaGlobal = (agRes.data || []).map(a => ({
        id: a.id, tipo: a.tipo, descricao: a.descricao, whatsapp: a.whatsapp, data: a.data,
        horario: a.horario ? a.horario.slice(0, 5) : a.horario, duracao: a.duracao,
        google_event_id: a.google_event_id
    }));

    listaTransacoesGlobais = (finRes.data || []).map(t => ({
        id: t.id, nomePaciente: t.nome_paciente, valor: t.valor, data: t.data, status: t.status
    }));

    listaTarefasGlobais = (tarRes.data || []).map(t => ({
        id: t.id, texto: t.texto, status: t.status, prioridade: t.prioridade
    }));
}

// ==========================================
// 🔐 LOGIN / LOGOUT
// ==========================================
window.fazerLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('input-login-email').value;
    const senha = document.getElementById('input-login-senha').value;
    const btn = document.getElementById('btn-login-submit');
    const erroDiv = document.getElementById('erro-login');
    erroDiv.style.display = 'none';
    btn.disabled = true; btn.innerText = 'Entrando...';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

    btn.disabled = false; btn.innerText = 'Entrar';

    if (error) {
        erroDiv.style.display = 'block';
        return;
    }
    currentUser = data.user;
    await iniciarApp();
}

window.fazerLogout = async function() {
    if (!confirm('Deseja realmente sair?')) return;
    await supabase.auth.signOut();
    currentUser = null;
    googleAccessToken = null;
    sessionStorage.removeItem('psiapp_google_token');
    atualizarStatusGoogle();
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('tela-login').style.display = 'flex';
}

async function iniciarApp() {
    document.getElementById('tela-login').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    await carregarTudoDoSupabase();
    window.inicializarCalendario();
    window.baixarListaDePacientesEmBackground();
    window.carregarTarefas();
    window.carregarFinanceiro();
    aguardarGoogleIdentity(inicializarGoogleAuth);
    atualizarStatusGoogle();
}

// ==========================================
// 📅 GOOGLE AGENDA (Google Calendar API)
// ==========================================
const GOOGLE_CLIENT_ID = '703690616893-ppk0n9r67h8q1ugl9f2scevqgj9ejp2c.apps.googleusercontent.com';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

let googleTokenClient = null;
let googleAccessToken = null;
window.eventosGoogleCache = [];

function aguardarGoogleIdentity(callback, tentativas = 0) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        callback();
    } else if (tentativas < 40) {
        setTimeout(() => aguardarGoogleIdentity(callback, tentativas + 1), 250);
    }
}

function salvarTokenNaSessao(resp) {
    const expiraEm = Date.now() + (resp.expires_in * 1000);
    sessionStorage.setItem('psiapp_google_token', JSON.stringify({ access_token: resp.access_token, expira_em: expiraEm }));
}

function tentarRestaurarTokenDaSessao() {
    try {
        const salvo = JSON.parse(sessionStorage.getItem('psiapp_google_token'));
        if (salvo && salvo.access_token && salvo.expira_em > Date.now()) {
            googleAccessToken = salvo.access_token;
            atualizarStatusGoogle();
            window.sincronizarComGoogleAgenda();
        }
    } catch { /* nada salvo ainda, sem problema */ }
}

function inicializarGoogleAuth() {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: (resp) => {
            if (resp.error) { console.error('Erro Google Auth:', resp); return; }
            googleAccessToken = resp.access_token;
            salvarTokenNaSessao(resp);
            atualizarStatusGoogle();
            window.sincronizarComGoogleAgenda();
        }
    });
    tentarRestaurarTokenDaSessao();
}

function renovarTokenSilenciosamente() {
    return new Promise((resolve) => {
        if (!googleTokenClient) { resolve(false); return; }
        const callbackOriginal = googleTokenClient.callback;
        googleTokenClient.callback = (resp) => {
            googleTokenClient.callback = callbackOriginal;
            if (resp.error) { resolve(false); return; }
            googleAccessToken = resp.access_token;
            salvarTokenNaSessao(resp);
            atualizarStatusGoogle();
            resolve(true);
        };
        googleTokenClient.requestAccessToken({ prompt: '' });
    });
}

window.conectarGoogleAgenda = function() {
    if (!googleTokenClient) { alert('A biblioteca do Google ainda está carregando, aguarde alguns segundos e tente de novo.'); return; }
    googleTokenClient.requestAccessToken({ prompt: googleAccessToken ? '' : 'consent' });
}

function atualizarStatusGoogle() {
    const el = document.getElementById('status-google-agenda');
    if (el) el.innerText = googleAccessToken ? '🟢 Google Agenda conectada' : '⚪ Google Agenda desconectada';
}

async function chamarGoogleCalendar(method, path, body = null, calendarId = 'primary', jaTentouRenovar = false) {
    if (!googleAccessToken) throw new Error('Google Agenda não conectada');
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/${path}`, {
        method,
        headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null
    });
    if (resp.status === 401 && !jaTentouRenovar) {
        const renovou = await renovarTokenSilenciosamente();
        if (renovou) return chamarGoogleCalendar(method, path, body, calendarId, true);
    }
    if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erro Google Calendar (${resp.status})`);
    }
    if (resp.status === 204) return null;
    return resp.json();
}

async function sincronizarEventoUnico(item) {
    if (!googleAccessToken || !item) return;
    const duracaoMinutos = item.duracao ? parseInt(item.duracao) : 60;
    const horario = item.horario || '09:00';
    const [h, m] = horario.split(':').map(Number);
    let totalMin = h * 60 + m + duracaoMinutos;
    const hf = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const mf = String(totalMin % 60).padStart(2, '0');

    const body = {
        summary: (item.tipo === 'pessoal' ? '📌 ' : '👤 ') + item.descricao,
        start: { dateTime: `${item.data}T${horario}:00`, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: `${item.data}T${hf}:${mf}:00`, timeZone: 'America/Sao_Paulo' }
    };

    try {
        if (item.google_event_id) {
            await chamarGoogleCalendar('PATCH', `events/${item.google_event_id}`, body);
        } else {
            const criado = await chamarGoogleCalendar('POST', 'events', body);
            item.google_event_id = criado.id;
        }
    } catch (err) {
        console.error('Erro ao sincronizar com Google Agenda:', err);
    }
}

async function excluirEventoGoogle(item) {
    if (!googleAccessToken || !item || !item.google_event_id) return;
    try {
        await chamarGoogleCalendar('DELETE', `events/${item.google_event_id}`);
    } catch (err) {
        console.error('Erro ao excluir do Google Agenda:', err);
    }
}

async function buscarListaDeCalendarios() {
    const resp = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    if (!resp.ok) throw new Error('Não foi possível buscar a lista de agendas.');
    const data = await resp.json();
    return data.items || [];
}

function obterCalendariosSelecionados() {
    try {
        const salvo = JSON.parse(localStorage.getItem('psiapp_calendarios_selecionados'));
        return Array.isArray(salvo) && salvo.length ? salvo : ['primary'];
    } catch { return ['primary']; }
}

window.abrirModalCalendarios = async function() {
    if (!googleAccessToken) { alert('Conecte o Google Agenda primeiro.'); return; }
    const container = document.getElementById('lista-calendarios-google');
    container.innerHTML = '<p style="color: var(--texto-secundario);">Carregando suas agendas...</p>';
    document.getElementById('modal-calendarios-google').style.display = 'flex';
    try {
        const calendarios = await buscarListaDeCalendarios();
        const selecionados = new Set(obterCalendariosSelecionados());
        container.innerHTML = '';
        calendarios.forEach(cal => {
            const linha = document.createElement('label');
            linha.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; margin-bottom:6px; background:rgba(124,58,237,0.04); cursor:pointer;';
            linha.innerHTML = `
                <input type="checkbox" value="${cal.id}" ${selecionados.has(cal.id) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--roxo-vibrante);">
                <span style="width:12px;height:12px;border-radius:50%;background:${cal.backgroundColor || '#7C3AED'}; flex-shrink:0;"></span>
                <span style="font-size:0.9em;">${cal.summary}${cal.primary ? ' (principal)' : ''}</span>
            `;
            container.appendChild(linha);
        });
    } catch (err) {
        container.innerHTML = `<p style="color: var(--texto-alerta);">${err.message}</p>`;
    }
}

window.fecharModalCalendarios = function() { document.getElementById('modal-calendarios-google').style.display = 'none'; }

window.salvarCalendariosSelecionados = function() {
    const marcados = Array.from(document.querySelectorAll('#lista-calendarios-google input[type="checkbox"]:checked')).map(c => c.value);
    localStorage.setItem('psiapp_calendarios_selecionados', JSON.stringify(marcados.length ? marcados : ['primary']));
    window.fecharModalCalendarios();
    window.sincronizarComGoogleAgenda();
}

const PALETA_AGENDAS_EXTERNAS = ['#475569', '#7C3AED', '#0E7490', '#B45309', '#4D7C0F', '#9D174D'];

window.sincronizarComGoogleAgenda = async function() {
    if (!googleAccessToken) return;
    try {
        const agora = new Date();
        const timeMin = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString();
        const timeMax = new Date(agora.getFullYear(), agora.getMonth() + 3, 1).toISOString();
        const idsDoApp = new Set(listaAgendaGlobal.map(a => a.google_event_id).filter(Boolean));
        const calendariosSelecionados = obterCalendariosSelecionados();

        const resultados = await Promise.all(calendariosSelecionados.map(async (calId, idx) => {
            try {
                const data = await chamarGoogleCalendar('GET', `events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=250`, null, calId);
                const cor = PALETA_AGENDAS_EXTERNAS[idx % PALETA_AGENDAS_EXTERNAS.length];
                return (data.items || [])
                    .filter(ev => !idsDoApp.has(ev.id) && ev.start)
                    .map(ev => ({
                        id: 'google-' + calId + '-' + ev.id,
                        title: '🗓️ ' + (ev.summary || 'Compromisso'),
                        start: ev.start.dateTime || ev.start.date,
                        end: ev.end ? (ev.end.dateTime || ev.end.date) : undefined,
                        allDay: !ev.start.dateTime,
                        backgroundColor: cor,
                        borderColor: cor,
                        textColor: '#ffffff',
                        editable: false
                    }));
            } catch (err) {
                console.error(`Erro ao buscar agenda ${calId}:`, err);
                return [];
            }
        }));

        window.eventosGoogleCache = resultados.flat();
        window.atualizarCalendarioNaTela();
    } catch (err) {
        console.error('Erro ao buscar Google Agenda:', err);
    }
}

function dispararConfetes() {
    const scriptCdn = document.createElement('script');
    scriptCdn.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.min.js';
    scriptCdn.onload = function() {
        if (typeof confetti === 'function') {
            confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 }, colors: ['#7C3AED', '#A78BFA', '#10B981'] });
        }
    };
    document.head.appendChild(scriptCdn);
}

window.onload = async function() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
        currentUser = data.session.user;
        await iniciarApp();
    } else {
        document.getElementById('tela-login').style.display = 'flex';
    }
};

// ==========================================
// 🗓️ CALENDÁRIO 
// ==========================================
window.inicializarCalendario = function() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' },
        locale: 'pt-br',
        editable: true,
        selectable: true,
        slotMinTime: '08:00:00',
        slotMaxTime: '23:00:00',
        allDaySlot: false,
        height: 580,
        events: window.obterEventosCalendario(),
        eventClick: function(info) { window.abrirModalNovoAgendamento(info.event); },
        eventDragStop: async function(info) {
            const lixeiraEl = document.getElementById('lixeira-calendario');
            if (lixeiraEl) {
                const rect = lixeiraEl.getBoundingClientRect();
                const mouseX = info.jsEvent.clientX;
                const mouseY = info.jsEvent.clientY;

                if (mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom) {
                    if (confirm(`Deseja eliminar o agendamento de "${info.event.title}"?`)) {
                        const itemRemovido = listaAgendaGlobal.find(a => a.id === info.event.id);
                        listaAgendaGlobal = listaAgendaGlobal.filter(a => a.id !== info.event.id);
                        
                        await supabase.from('agenda').delete().eq('id', info.event.id); // Deleção cirúrgica
                        
                        excluirEventoGoogle(itemRemovido);
                        salvarBD();
                        window.atualizarCalendarioNaTela();
                    }
                }
            }
        },
        eventDrop: function(info) {
            const novaDataHora = info.event.start;
            const ano = novaDataHora.getFullYear();
            const mes = String(novaDataHora.getMonth() + 1).padStart(2, '0');
            const dia = String(novaDataHora.getDate()).padStart(2, '0');
            const horas = String(novaDataHora.getHours()).padStart(2, '0');
            const minutos = String(novaDataHora.getMinutes()).padStart(2, '0');
            
            const novaDataStr = `${ano}-${mes}-${dia}`;
            const novoHorarioStr = `${horas}:${minutos}`;

            if (confirm(`Deseja realmente mover o agendamento de "${info.event.title}" para o dia ${dia}/${mes} às ${novoHorarioStr}?`)) {
                let index = listaAgendaGlobal.findIndex(a => a.id === info.event.id);
                if (index > -1) {
                    listaAgendaGlobal[index].data = novaDataStr;
                    listaAgendaGlobal[index].horario = novoHorarioStr;
                    sincronizarEventoUnico(listaAgendaGlobal[index]).then(salvarBD);
                    dispararConfetes();
                }
            } else {
                info.revert(); 
            }
        },
        eventResize: function(info) {
            if (confirm(`Deseja alterar a duração da sessão de "${info.event.title}"?`)) {
                const inicio = info.event.start;
                const fim = info.event.end;
                
                const diferencaMs = fim - inicio;
                const novaDuracaoMinutos = Math.round(diferencaMs / 60000);

                let index = listaAgendaGlobal.findIndex(a => a.id === info.event.id);
                if (index > -1) {
                    listaAgendaGlobal[index].duracao = novaDuracaoMinutos;
                    sincronizarEventoUnico(listaAgendaGlobal[index]).then(salvarBD);
                    dispararConfetes();
                }
            } else {
                info.revert();
            }
        },
        dateClick: function(info) {
            window.abrirModalNovoAgendamento();
            const dataObj = info.date;
            const ano = dataObj.getFullYear();
            const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
            const dia = String(dataObj.getDate()).padStart(2, '0');
            const dataStr = `${ano}-${mes}-${dia}`;
            const inputData = document.getElementById('input-data-agenda');
            if (inputData) inputData.value = dataStr;

            if (info.allDay === false || (dataObj.getHours() !== 0 || dataObj.getMinutes() !== 0)) {
                const horas = String(dataObj.getHours()).padStart(2, '0');
                const minutos = String(dataObj.getMinutes()).padStart(2, '0');
                const horarioStr = `${horas}:${minutos}`;
                const inputHorario = document.getElementById('input-horario-agenda');
                if (inputHorario && horarioStr !== '00:00') inputHorario.value = horarioStr;
            }
        },
        viewDidMount: function() {
            setTimeout(() => {
                const toolbarTitle = document.querySelector('.fc-toolbar-title');
                if (toolbarTitle && !document.getElementById('lixeira-calendario')) {
                    const lixeiraBtn = document.createElement('button');
                    lixeiraBtn.id = 'lixeira-calendario';
                    lixeiraBtn.className = 'btn-lixeira-calendario';
                    lixeiraBtn.innerHTML = '🗑️ Arraste aqui para apagar';
                    toolbarTitle.appendChild(lixeiraBtn);
                }
            }, 150);
        }
    });
    calendarInstance.render();
}

window.obterEventosCalendario = function() {
    return listaAgendaGlobal.map(item => {
        const isPessoal = item.tipo === 'pessoal';
        
        const duracaoMinutos = item.duracao ? parseInt(item.duracao) : 60; 
        const [horas, minutos] = (item.horario || '09:00').split(':').map(Number);
        
        let minFim = minutos + duracaoMinutos;
        let horasFim = horas + Math.floor(minFim / 60);
        minFim = minFim % 60;
        
        const horarioFimStr = `${String(horasFim).padStart(2, '0')}:${String(minFim).padStart(2, '0')}:00`;
        const horarioInicioStr = `${item.horario || '09:00'}:00`;

        return {
            id: item.id,
            title: (isPessoal ? '📌 ' : '👤 ') + item.descricao + (duracaoMinutos === 30 ? ' (30m)' : ''),
            start: `${item.data}T${horarioInicioStr}`,
            end: `${item.data}T${horarioFimStr}`, 
            backgroundColor: isPessoal ? '#7B1FA2' : '#7C3AED',
            borderColor: isPessoal ? '#7B1FA2' : '#7C3AED'
        };
    });
}

window.verificarConflitoAgenda = function(dataStr, horarioStr, duracaoNova, idAtual = null) {
    let [hNova, mNova] = horarioStr.split(':').map(Number);
    let inicioNovo = hNova * 60 + mNova;
    let fimNovo = inicioNovo + parseInt(duracaoNova);

    let eventosDoDia = listaAgendaGlobal.filter(a => a.data === dataStr && a.id !== idAtual);
    
    let ocupados = eventosDoDia.map(ev => {
        let [h, m] = (ev.horario || '09:00').split(':').map(Number);
        let inicio = h * 60 + m;
        let fim = inicio + (ev.duracao ? parseInt(ev.duracao) : 60);
        return { inicio, fim, descricao: ev.descricao };
    });

    ocupados.sort((a, b) => a.inicio - b.inicio);

    for (let i = 0; i < ocupados.length; i++) {
        let evento = ocupados[i];
        
        if (inicioNovo < evento.fim && fimNovo > evento.inicio) {
            
            let sugestao = evento.fim;
            
            for(let j = i + 1; j < ocupados.length; j++) {
                if ((sugestao + parseInt(duracaoNova)) <= ocupados[j].inicio) {
                    break; 
                } else {
                    sugestao = ocupados[j].fim; 
                }
            }

            let sugH = String(Math.floor(sugestao / 60)).padStart(2, '0');
            let sugM = String(sugestao % 60).padStart(2, '0');
            
            return {
                temConflito: true,
                mensagem: `⚠️ Ops! Esse horário choca com a agenda de "${evento.descricao}".\n\nQue tal marcar às ${sugH}:${sugM}?`
            };
        }
    }
    return { temConflito: false };
}

window.atualizarCalendarioNaTela = function() {
    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(window.obterEventosCalendario());
        calendarInstance.addEventSource(window.eventosGoogleCache || []);
        calendarInstance.render();
    }
}

// ==========================================
// CONTROLE DE TELAS E SEGURANÇA
// ==========================================
window.toggleMenuMobile = function() { document.querySelector('.sidebar').classList.toggle('aberta'); }
window.fecharMenuMobile = function() { document.querySelector('.sidebar').classList.remove('aberta'); }

window.mudarTela = function(idTela, elementoMenu) {
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    document.getElementById(idTela).classList.add('ativa');
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('ativo'));
    elementoMenu.classList.add('ativo');
    if(idTela === 'tela-agenda' && calendarInstance) setTimeout(() => { calendarInstance.updateSize(); calendarInstance.render(); }, 100);
    window.fecharMenuMobile();
}

window.tentarAcessarTela = function(idTela, elementoMenu) {
    window.fecharMenuMobile();
    if (acessoAutorizado) {
        window.abrirTelaProtegida(idTela, elementoMenu);
    } else {
        telaAlvoPendente = idTela;
        elementoMenuPendente = elementoMenu;
        document.getElementById('erro-senha').style.display = 'none';
        document.getElementById('input-senha').value = '';
        document.getElementById('modal-senha').style.display = 'flex';
        setTimeout(() => document.getElementById('input-senha').focus(), 100);
    }
}

window.verificarSenha = function(e) {
    e.preventDefault();
    if (document.getElementById('input-senha').value === "5581323") {
        acessoAutorizado = true;
        document.getElementById('modal-senha').style.display = 'none';
        window.abrirTelaProtegida(telaAlvoPendente, elementoMenuPendente);
    } else {
        document.getElementById('erro-senha').style.display = 'block';
        document.getElementById('input-senha').value = '';
    }
}

window.cancelarSenha = function() { document.getElementById('modal-senha').style.display = 'none'; }
window.abrirTelaProtegida = function(idTela, elementoMenu) {
    window.mudarTela(idTela, elementoMenu);
    if(idTela === 'tela-pacientes') window.carregarPacientes();
    if(idTela === 'tela-financeiro') window.carregarFinanceiro();
}

// ==========================================
// AGENDAMENTOS E PACOTES
// ==========================================
window.abrirModalNovoAgendamento = function(calendarEvent = null) {
    document.getElementById('form-agendamento')?.reset();
    document.getElementById('btn-deletar-agendamento').style.display = 'none';
    document.getElementById('agenda-id').value = '';
    
    if (calendarEvent) {
        document.getElementById('agenda-id').value = calendarEvent.id;
        document.getElementById('btn-deletar-agendamento').style.display = 'block';
        
        const item = listaAgendaGlobal.find(a => a.id === calendarEvent.id);
        if (item) {
            document.getElementById('agenda-tipo-oculto').value = item.tipo;
            document.getElementById('input-data-agenda').value = item.data;
            document.getElementById('input-horario-agenda').value = item.horario || '09:00';
            
            if (item.tipo === 'pessoal') {
                window.mudarTipoAgendamento('pessoal');
                document.getElementById('input-compromisso-pessoal').value = item.descricao;
                const durPessoaInput = document.getElementById('input-duracao-pessoal');
                if (durPessoaInput) durPessoaInput.value = item.duracao || 60;
            } else {
                window.mudarTipoAgendamento('paciente');
                let desc = item.descricao;
                let match = desc.match(/(.*?)\s*\((\d+)\/(\d+)\)/);
                if (match) {
                    let nomePac = match[1].trim();
                    document.getElementById('select-paciente-agenda').value = nomePac;
                    document.getElementById('select-tipo-sessao').value = 'pacote';
                    window.mudarOpcaoSessao();
                    document.getElementById('input-sessao-atual').value = match[2];
                    document.getElementById('input-total-pacote').value = match[3];
                    window.atualizarTextoContadorPacote();
                } else {
                    document.getElementById('select-paciente-agenda').value = desc.trim();
                    document.getElementById('select-tipo-sessao').value = 'avulsa';
                    window.mudarOpcaoSessao();
                }
            }
        }
    } else {
        document.getElementById('input-data-agenda').valueAsDate = new Date();
        window.mudarTipoAgendamento('paciente');
        document.getElementById('select-tipo-sessao').value = 'avulsa';
        window.mudarOpcaoSessao();
    }

    document.getElementById('check-recorrencia').checked = false;
    window.mudarOpcaoRecorrencia();
    document.getElementById('modal-agendamento').style.display = 'flex';
}

window.fecharModalAgendamento = function() { document.getElementById('modal-agendamento').style.display = 'none'; }
window.deletarAgendamentoDoModal = async function() {
    const id = document.getElementById('agenda-id').value;
    if (id && confirm("Tem certeza que deseja excluir este agendamento?")) {
        const itemRemovido = listaAgendaGlobal.find(a => a.id === id);
        listaAgendaGlobal = listaAgendaGlobal.filter(a => a.id !== id);
        
        await supabase.from('agenda').delete().eq('id', id); // Deleção cirúrgica
        excluirEventoGoogle(itemRemovido).then(salvarBD);
        
        window.atualizarCalendarioNaTela(); 
        window.fecharModalAgendamento();
    }
}
window.mudarTipoAgendamento = function(tipo) {
    document.getElementById('agenda-tipo-oculto').value = tipo;
    const btnP = document.getElementById('toggle-paciente');
    const btnPers = document.getElementById('toggle-pessoal');
    
    const selectPaciente = document.getElementById('select-paciente-agenda');
    const inputCompromisso = document.getElementById('input-compromisso-pessoal');

    if (tipo === 'pessoal') {
        btnPers.classList.add('ativo'); btnP.classList.remove('ativo');
        document.getElementById('bloco-campos-paciente').style.display = 'none';
        document.getElementById('campo-pessoal').style.display = 'block';
        document.getElementById('campo-duracao-pessoal').style.display = 'block';
        document.getElementById('bloco-duracao-sessao').style.display = 'none';
        
        if (selectPaciente) selectPaciente.removeAttribute('required');
        if (inputCompromisso) inputCompromisso.setAttribute('required', 'true');
        
    } else {
        btnP.classList.add('ativo'); btnPers.classList.remove('ativo');
        document.getElementById('campo-pessoal').style.display = 'none';
        document.getElementById('campo-duracao-pessoal').style.display = 'none';
        document.getElementById('bloco-campos-paciente').style.display = 'block';
        document.getElementById('bloco-duracao-sessao').style.display = 'block';
        
        if (selectPaciente) selectPaciente.setAttribute('required', 'true');
        if (inputCompromisso) inputCompromisso.removeAttribute('required');
    }
}
window.mudarOpcaoSessao = function() {
    const tipo = document.getElementById('select-tipo-sessao').value;
    const bloco = document.getElementById('bloco-opcoes-pacote');
    if (tipo === 'pacote') { bloco.style.display = 'block'; window.verificarPacotePaciente(); }
    else { bloco.style.display = 'none'; }
}
window.mudarOpcaoRecorrencia = function() {
    const isChecked = document.getElementById('check-recorrencia').checked;
    const textoAviso = document.getElementById('texto-aviso-recorrencia');
    if (textoAviso) textoAviso.style.display = isChecked ? 'block' : 'none';
}

window.verificarPacotePaciente = function() {
    const pacienteNome = document.getElementById('select-paciente-agenda').value;
    const tipoSessao = document.getElementById('select-tipo-sessao').value;
    if (!pacienteNome || tipoSessao !== 'pacote') return;
    const agendamentos = listaAgendaGlobal.filter(a => a.descricao && a.descricao.startsWith(pacienteNome + ' (') && a.descricao.match(/\(\d+\/\d+\)/));
    let prox = 1, tot = 4;
    if (agendamentos.length > 0) {
        const match = agendamentos[agendamentos.length - 1].descricao.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            let atual = parseInt(match[1]), total = parseInt(match[2]);
            tot = total || 4; prox = (atual < total) ? atual + 1 : 1;
        }
    }
    document.getElementById('input-sessao-atual').value = prox;
    document.getElementById('input-total-pacote').value = tot;
    window.atualizarTextoContadorPacote();
}

window.atualizarTextoContadorPacote = function() {
    document.getElementById('badge-contador-pacote').innerText = `Sessão ${document.getElementById('input-sessao-atual').value || 1}/${document.getElementById('input-total-pacote').value || 4}`;
}

window.salvarAgendamento = async function(e) {
    e.preventDefault();
    const agendaIdInput = document.getElementById('agenda-id').value;
    const tipo = document.getElementById('agenda-tipo-oculto').value;
    const dataInicialStr = document.getElementById('input-data-agenda').value;
    const horario = document.getElementById('input-horario-agenda').value;
    const rec = document.getElementById('check-recorrencia').checked;
    
    let duracao = 60;
    if (tipo === 'pessoal') {
        const durPessoaInput = document.getElementById('input-duracao-pessoal');
        duracao = durPessoaInput ? parseInt(durPessoaInput.value) || 60 : 60;
    } else {
        const duracaoSelect = document.getElementById('input-duracao-agenda');
        duracao = duracaoSelect ? parseInt(duracaoSelect.value) : 60;
    }
    
    let analise = window.verificarConflitoAgenda(dataInicialStr, horario, duracao, agendaIdInput || null);
    if (analise.temConflito) {
        alert(analise.mensagem);
        return;
    }

    let [ano, mes, dia] = dataInicialStr.split('-').map(Number);
    let dataBase = new Date(ano, mes - 1, dia);
    let itensNovos = [];

    if (agendaIdInput && !rec) {
        let index = listaAgendaGlobal.findIndex(a => a.id === agendaIdInput);
        if (index > -1) {
            if (tipo === 'pessoal') {
                listaAgendaGlobal[index].tipo = 'pessoal';
                listaAgendaGlobal[index].descricao = document.getElementById('input-compromisso-pessoal').value;
                listaAgendaGlobal[index].data = dataInicialStr;
                listaAgendaGlobal[index].horario = horario;
                listaAgendaGlobal[index].duracao = duracao; 
                delete listaAgendaGlobal[index].whatsapp;
            } else {
                const pacNome = document.getElementById('select-paciente-agenda').value;
                const obj = listaPacientesGlobais.find(p => p.nome === pacNome);
                let final = pacNome;
                if (document.getElementById('select-tipo-sessao').value === 'pacote') {
                    final = `${pacNome} (${document.getElementById('input-sessao-atual').value}/${document.getElementById('input-total-pacote').value})`;
                }
                listaAgendaGlobal[index].tipo = 'paciente';
                listaAgendaGlobal[index].descricao = final;
                listaAgendaGlobal[index].whatsapp = obj ? obj.whatsapp : '';
                listaAgendaGlobal[index].data = dataInicialStr;
                listaAgendaGlobal[index].horario = horario;
                listaAgendaGlobal[index].duracao = duracao; 
            }
            await sincronizarEventoUnico(listaAgendaGlobal[index]);
            await salvarBD(); dispararConfetes(); window.fecharModalAgendamento(); window.atualizarCalendarioNaTela(); return;
        }
    }

    if (tipo === 'pessoal') {
        const desc = document.getElementById('input-compromisso-pessoal').value;
        if (rec) {
            for (let i = 0; i < 12; i++) {
                let novo = { id: crypto.randomUUID(), tipo: 'pessoal', descricao: desc, data: dataBase.toISOString().split('T')[0], horario: horario, duracao: duracao };
                listaAgendaGlobal.push(novo); itensNovos.push(novo);
                dataBase.setDate(dataBase.getDate() + 7);
            }
        } else {
            let novo = { id: crypto.randomUUID(), tipo: 'pessoal', descricao: desc, data: dataInicialStr, horario: horario, duracao: duracao };
            listaAgendaGlobal.push(novo); itensNovos.push(novo);
        }
    } else {
        const pacNome = document.getElementById('select-paciente-agenda').value;
        const obj = listaPacientesGlobais.find(p => p.nome === pacNome);
        const wapp = obj ? obj.whatsapp : '';
        if (document.getElementById('select-tipo-sessao').value === 'avulsa') {
            if (rec) {
                for (let i = 0; i < 12; i++) {
                    let novo = { id: crypto.randomUUID(), tipo: 'paciente', descricao: pacNome, whatsapp: wapp, data: dataBase.toISOString().split('T')[0], horario: horario, duracao: duracao };
                    listaAgendaGlobal.push(novo); itensNovos.push(novo);
                    dataBase.setDate(dataBase.getDate() + 7);
                }
            } else {
                let novo = { id: crypto.randomUUID(), tipo: 'paciente', descricao: pacNome, whatsapp: wapp, data: dataInicialStr, horario: horario, duracao: duracao };
                listaAgendaGlobal.push(novo); itensNovos.push(novo);
            }
        } else {
            let sAtual = parseInt(document.getElementById('input-sessao-atual').value) || 1;
            let total = parseInt(document.getElementById('input-total-pacote').value) || 4;
            if (rec) {
                for (let i = sAtual; i <= total; i++) {
                    let novo = { id: crypto.randomUUID(), tipo: 'paciente', descricao: `${pacNome} (${i}/${total})`, whatsapp: wapp, data: dataBase.toISOString().split('T')[0], horario: horario, duracao: duracao };
                    listaAgendaGlobal.push(novo); itensNovos.push(novo);
                    dataBase.setDate(dataBase.getDate() + 7);
                }
            } else {
                let novo = { id: crypto.randomUUID(), tipo: 'paciente', descricao: `${pacNome} (${sAtual}/${total})`, whatsapp: wapp, data: dataInicialStr, horario: horario, duracao: duracao };
                listaAgendaGlobal.push(novo); itensNovos.push(novo);
            }
        }
    }
    await Promise.all(itensNovos.map(sincronizarEventoUnico));
    await salvarBD(); dispararConfetes(); window.fecharModalAgendamento(); window.atualizarCalendarioNaTela();
}

// ==========================================
// PACIENTES (Acordeão + NOVO BOTÃO PRONTUÁRIO)
// ==========================================
window.baixarListaDePacientesEmBackground = function() {
    listaPacientesGlobais.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    const select = document.getElementById('select-paciente-agenda');
    const selectFin = document.getElementById('select-paciente-fin');
    [select, selectFin].forEach(sel => {
        if(sel) {
            sel.innerHTML = '<option value="">Selecione o paciente...</option>';
            listaPacientesGlobais.forEach(p => sel.innerHTML += `<option value="${p.nome}">${p.nome}</option>`);
        }
    });
}

window.carregarPacientes = function() {
    const container = document.getElementById('lista-pacientes-container');
    if(!container) return;

    if (listaPacientesGlobais.length === 0) {
        container.innerHTML = '<p style="color: var(--texto-secundario);">Nenhum paciente cadastrado.</p>';
        return;
    }

    container.innerHTML = '';
    listaPacientesGlobais.forEach(paciente => {
        let numLimpo = paciente.whatsapp ? paciente.whatsapp.replace(/[^\d+]/g, '') : '';
        const linkWa = numLimpo ? 'https://wa.me/' + numLimpo.replace('+', '') : '#';

        const card = document.createElement('div');
        card.className = 'card-item-paciente';
        card.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 220px;">
                    <div style="font-size: 1.8em;">👤</div>
                    <div>
                        <div style="font-weight: 600; font-size: 1.1em; color: var(--texto-berinjela);">${paciente.nome}</div>
                        <div style="color: var(--texto-secundario); font-size: 0.85em;">📱 ${paciente.whatsapp || 'Sem telefone'} • ✉️ ${paciente.email || 'Sem e-mail'}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${paciente.whatsapp ? `<a href="${linkWa}" target="_blank" class="btn-icone btn-whatsapp">📲 WhatsApp</a>` : ''}
                    <button class="btn-icone" id="btn-toggle-${paciente.id}" onclick="toggleDetalhesPaciente('${paciente.id}')" style="font-weight: bold; background: rgba(124, 58, 237, 0.08); color: var(--roxo-vibrante);">➕ Ver Detalhes</button>
                </div>
            </div>
            
            <div id="detalhes-${paciente.id}" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(0,0,0,0.06); animation: fadeIn 0.3s ease;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.9em; color: var(--texto-principal); margin-bottom: 12px;">
                    <div>🎂 <strong>Nascimento:</strong> ${paciente.nascimento || 'Não informado'}</div>
                    <div>🪪 <strong>CPF:</strong> ${paciente.cpf || 'Não informado'}</div>
                    <div>📍 <strong>Endereço:</strong> ${paciente.endereco || 'Não informado'}</div>
                    <div>📮 <strong>CEP:</strong> ${paciente.cep || 'Não informado'}</div>
                    <div>💰 <strong>Valor da Sessão:</strong> R$ ${paciente.valor || '0,00'}</div>
                </div>
                ${paciente.motivo ? `<div style="background: rgba(124,58,237,0.03); padding: 10px; border-radius: 8px; font-size: 0.88em; margin-bottom: 12px; color: var(--texto-secundario);">💬 <strong>Queixa / Motivo:</strong> ${paciente.motivo}</div>` : ''}
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn-secundario" onclick="abrirModalProntuario('${paciente.id}')" style="padding: 6px 14px; font-size: 0.85em; background: rgba(124, 58, 237, 0.08); color: var(--roxo-vibrante); border: 1px solid rgba(124, 58, 237, 0.2); font-weight: 600;">📝 Prontuário</button>
                    <button class="btn-secundario" onclick="abrirModalEditarPaciente('${paciente.id}')" style="padding: 6px 14px; font-size: 0.85em;">✏️ Editar</button>
                    <button class="btn-secundario" onclick="excluirPaciente('${paciente.id}')" style="padding: 6px 14px; font-size: 0.85em; color: var(--texto-alerta); border-color: var(--texto-alerta);">🗑️ Excluir</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.toggleDetalhesPaciente = function(id) {
    const painel = document.getElementById(`detalhes-${id}`);
    const botao = document.getElementById(`btn-toggle-${id}`);
    if (painel.style.display === 'none') {
        painel.style.display = 'block'; botao.innerHTML = '➖ Ocultar'; botao.style.background = 'var(--roxo-vibrante)'; botao.style.color = '#fff';
    } else {
        painel.style.display = 'none'; botao.innerHTML = '➕ Ver Detalhes'; botao.style.background = 'rgba(124, 58, 237, 0.08)'; botao.style.color = 'var(--roxo-vibrante)';
    }
}

window.abrirModalNovoPaciente = function() {
    document.getElementById('form-paciente')?.reset(); document.getElementById('input-id').value = '';
    const titulo = document.getElementById('titulo-modal-paciente'); if(titulo) titulo.innerText = '👤 Novo Paciente';
    document.getElementById('modal-paciente').style.display = 'flex';
}

window.abrirModalEditarPaciente = function(id) {
    const p = listaPacientesGlobais.find(x => x.id === id); if (!p) return;
    document.getElementById('form-paciente')?.reset(); document.getElementById('input-id').value = p.id;
    document.getElementById('input-nome').value = p.nome || ''; document.getElementById('input-nascimento').value = p.nascimento || '';
    document.getElementById('input-whatsapp').value = p.whatsapp || ''; document.getElementById('input-email').value = p.email || '';
    document.getElementById('input-cpf').value = p.cpf || ''; document.getElementById('input-endereco').value = p.endereco || '';
    document.getElementById('input-cep').value = p.cep || ''; document.getElementById('input-valor').value = p.valor || '';
    document.getElementById('input-motivo').value = p.motivo || '';
    const titulo = document.getElementById('titulo-modal-paciente'); if(titulo) titulo.innerText = '✏️ Editar Paciente';
    document.getElementById('modal-paciente').style.display = 'flex';
}

window.fecharModalPaciente = function() { document.getElementById('modal-paciente').style.display = 'none'; }

window.salvarPaciente = function(e) {
    e.preventDefault();
    const idInput = document.getElementById('input-id').value;
    const dados = {
        nome: document.getElementById('input-nome').value, nascimento: document.getElementById('input-nascimento').value,
        whatsapp: document.getElementById('input-whatsapp').value, email: document.getElementById('input-email').value,
        cpf: document.getElementById('input-cpf').value, endereco: document.getElementById('input-endereco').value,
        cep: document.getElementById('input-cep').value, valor: document.getElementById('input-valor').value, motivo: document.getElementById('input-motivo').value
    };
    if (idInput) {
        let idx = listaPacientesGlobais.findIndex(p => p.id === idInput);
        if (idx > -1) listaPacientesGlobais[idx] = { ...listaPacientesGlobais[idx], ...dados };
    } else {
        listaPacientesGlobais.push({ id: crypto.randomUUID(), prontuarios: [], ...dados });
    }
    salvarBD(); dispararConfetes(); window.fecharModalPaciente(); window.carregarPacientes(); window.baixarListaDePacientesEmBackground();
}

window.excluirPaciente = async function(id) {
    if(confirm("Deseja excluir este paciente?")) {
        listaPacientesGlobais = listaPacientesGlobais.filter(p => p.id !== id);
        await supabase.from('pacientes').delete().eq('id', id); // Deleção cirúrgica
        salvarBD(); window.carregarPacientes(); window.baixarListaDePacientesEmBackground();
    }
}

// ==========================================
// FINANCEIRO E TAREFAS
// ==========================================
window.carregarFinanceiro = function() {
    const corpo = document.getElementById('tabela-transacoes-corpo'); if(!corpo) return;
    let rec = 0, pend = 0;
    if (listaTransacoesGlobais.length === 0) {
        corpo.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--texto-secundario);">Nenhum lançamento financeiro registrado.</td></tr>`;
        document.getElementById('fin-total-recebido').innerText = 'R$ 0,00'; document.getElementById('fin-total-pendente').innerText = 'R$ 0,00'; return;
    }
    corpo.innerHTML = '';
    listaTransacoesGlobais.forEach(t => {
        if (t.status === 'Pago') rec += parseFloat(t.valor); else pend += parseFloat(t.valor);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>👤 ${t.nomePaciente}</strong></td><td>${t.data}</td><td><strong>R$ ${parseFloat(t.valor).toFixed(2)}</strong></td>
            <td>${t.status === 'Pago' ? '<span class="badge-status-pago">Pago</span>' : '<span class="badge-status-pendente">Pendente</span>'}</td>
            <td style="text-align: right;"><button class="btn-icone" onclick="alternarStatusFin('${t.id}')">🔄</button> <button class="btn-icone" style="color: var(--texto-alerta);" onclick="deletarTransacao('${t.id}')">🗑️</button></td>
        `;
        corpo.appendChild(tr);
    });
    document.getElementById('fin-total-recebido').innerText = `R$ ${rec.toFixed(2)}`; document.getElementById('fin-total-pendente').innerText = `R$ ${pend.toFixed(2)}`;
}

window.abrirModalNovaTransacao = function() {
    document.getElementById('form-transacao')?.reset(); document.getElementById('input-data-fin').valueAsDate = new Date();
    window.baixarListaDePacientesEmBackground(); document.getElementById('modal-transacao').style.display = 'flex';
}
window.fecharModalTransacao = function() { document.getElementById('modal-transacao').style.display = 'none'; }
window.salvarTransacaoFinanceira = function(e) {
    e.preventDefault();
    listaTransacoesGlobais.push({ id: crypto.randomUUID(), nomePaciente: document.getElementById('select-paciente-fin').value, valor: parseFloat(document.getElementById('input-valor-fin').value) || 0, data: document.getElementById('input-data-fin').value, status: document.getElementById('select-status-fin').value });
    salvarBD(); dispararConfetes(); window.fecharModalTransacao(); window.carregarFinanceiro();
}
window.alternarStatusFin = function(id) { let t = listaTransacoesGlobais.find(x => x.id === id); if(t) { t.status = t.status === 'Pago' ? 'Pendente' : 'Pago'; salvarBD(); window.carregarFinanceiro(); } }

window.deletarTransacao = async function(id) { 
    if(confirm("Excluir este lançamento?")) { 
        listaTransacoesGlobais = listaTransacoesGlobais.filter(x => x.id !== id); 
        await supabase.from('transacoes').delete().eq('id', id); // Deleção cirúrgica
        salvarBD(); window.carregarFinanceiro(); 
    } 
}

window.carregarTarefas = function() {
    const c = document.getElementById('lista-tarefas-container'); if(!c) return;
    if(listaTarefasGlobais.length === 0) { c.innerHTML = '<p style="color:var(--texto-secundario); font-size:0.9em;">Nenhuma tarefa pendente.</p>'; return; }
    c.innerHTML = '';
    listaTarefasGlobais.forEach(t => {
        c.innerHTML += `
            <div class="tarefa-item ${t.status === 'Concluída' ? 'concluida' : ''}">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; font-size: 0.9em;">
                    <input type="checkbox" ${t.status === 'Concluída' ? 'checked' : ''} onclick="mudarStatusTarefa('${t.id}')" style="width:16px;height:16px;accent-color:var(--roxo-vibrante);">
                    <span>${t.texto}</span> ${t.prioridade === 'Urgente' ? '<span class="badge-urgente">🔥 URGENTE</span>' : ''}
                </label>
                <button class="btn-icone" style="color:var(--texto-alerta);" onclick="removerTarefa('${t.id}')">🗑️</button>
            </div>
        `;
    });
}
window.adicionarTarefa = function(e) { e.preventDefault(); listaTarefasGlobais.push({ id: crypto.randomUUID(), texto: document.getElementById('input-nova-tarefa').value, status: 'Pendente', prioridade: document.getElementById('select-prioridade-tarefa').value }); salvarBD(); document.getElementById('input-nova-tarefa').value = ''; window.carregarTarefas(); }
window.mudarStatusTarefa = function(id) { let t = listaTarefasGlobais.find(x => x.id === id); if(t) { t.status = t.status === 'Concluída' ? 'Pendente' : 'Concluída'; salvarBD(); window.carregarTarefas(); } }

window.removerTarefa = async function(id) { 
    listaTarefasGlobais = listaTarefasGlobais.filter(x => x.id !== id); 
    await supabase.from('tarefas').delete().eq('id', id); // Deleção cirúrgica
    salvarBD(); window.carregarTarefas(); 
}

// ==========================================
// PRONTUÁRIO ELETRÔNICO DA PACIENTE
// ==========================================
window.abrirModalProntuario = function(pacienteId) {
    const paciente = listaPacientesGlobais.find(p => p.id === pacienteId);
    if (!paciente) return;
    
    document.getElementById('titulo-modal-prontuario').innerText = `📝 Prontuário: ${paciente.nome}`;
    document.getElementById('prontuario-paciente-id').value = pacienteId;
    
    window.limparFormProntuario();
    window.renderizarHistoricoProntuario(pacienteId);
    
    document.getElementById('modal-prontuario').style.display = 'flex';
}

window.limparFormProntuario = function() {
    document.getElementById('prontuario-item-id').value = '';
    document.getElementById('input-data-prontuario').valueAsDate = new Date(); 
    document.getElementById('input-texto-prontuario').value = '';
}

window.fecharModalProntuario = function() {
    document.getElementById('modal-prontuario').style.display = 'none';
}

window.salvarProntuario = function(e) {
    e.preventDefault();
    const pacienteId = document.getElementById('prontuario-paciente-id').value;
    const itemId = document.getElementById('prontuario-item-id').value;
    const dataStr = document.getElementById('input-data-prontuario').value;
    const texto = document.getElementById('input-texto-prontuario').value;
    
    let index = listaPacientesGlobais.findIndex(p => p.id === pacienteId);
    if (index > -1) {
        if (!listaPacientesGlobais[index].prontuarios) {
            listaPacientesGlobais[index].prontuarios = [];
        }
        
        if (itemId) {
            let pIndex = listaPacientesGlobais[index].prontuarios.findIndex(pr => pr.id === itemId);
            if (pIndex > -1) {
                listaPacientesGlobais[index].prontuarios[pIndex].data = dataStr;
                listaPacientesGlobais[index].prontuarios[pIndex].texto = texto;
            }
        } else {
            listaPacientesGlobais[index].prontuarios.unshift({
                id: crypto.randomUUID(),
                data: dataStr,
                texto: texto
            });
        }
        
        salvarBD();
        window.limparFormProntuario(); 
        window.renderizarHistoricoProntuario(pacienteId); 
        dispararConfetes();
    }
}

window.renderizarHistoricoProntuario = function(pacienteId) {
    const container = document.getElementById('lista-prontuarios-container');
    const paciente = listaPacientesGlobais.find(p => p.id === pacienteId);
    
    if (!paciente || !paciente.prontuarios || paciente.prontuarios.length === 0) {
        container.innerHTML = '<p style="color: var(--texto-secundario); font-size: 0.9em; text-align: center; margin-top: 20px;">Nenhuma sessão registrada para este paciente ainda.</p>';
        return;
    }
    
    container.innerHTML = '';
    
    let listaOrdenada = [...paciente.prontuarios].sort((a, b) => new Date(b.data) - new Date(a.data));
    
    listaOrdenada.forEach(pron => {
        let [ano, mes, dia] = pron.data.split('-');
        let dataFormatada = `${dia}/${mes}/${ano}`;
        
        const item = document.createElement('div');
        item.className = 'card-prontuario';
        
        const textoQuebradoVisivel = pron.texto.replace(/\n/g, '<br>');

        item.innerHTML = `
            <div class="prontuario-header">
                <span class="prontuario-data">📅 ${dataFormatada}</span>
                <div class="prontuario-acoes">
                    <button type="button" class="btn-icone" onclick="editarProntuario('${pacienteId}', '${pron.id}')" title="Editar Anotação">✏️ Editar</button>
                    <button type="button" class="btn-icone" style="color: var(--texto-alerta);" onclick="excluirProntuario('${pacienteId}', '${pron.id}')" title="Apagar Anotação">🗑️</button>
                </div>
            </div>
            <div class="prontuario-corpo" onclick="toggleTextoProntuario('${pron.id}')">
                <div id="resumo-${pron.id}" class="prontuario-texto-resumo">${pron.texto}</div>
                <div id="completo-${pron.id}" class="prontuario-texto-completo" style="display:none;">${textoQuebradoVisivel}</div>
                <div class="prontuario-dica-clique">Clique no texto para expandir/reduzir a leitura...</div>
            </div>
        `;
        container.appendChild(item);
    });
}

window.editarProntuario = function(pacienteId, prontuarioId) {
    const paciente = listaPacientesGlobais.find(p => p.id === pacienteId);
    if(paciente && paciente.prontuarios) {
        const pron = paciente.prontuarios.find(p => p.id === prontuarioId);
        if(pron) {
            document.getElementById('prontuario-item-id').value = pron.id;
            document.getElementById('input-data-prontuario').value = pron.data;
            document.getElementById('input-texto-prontuario').value = pron.texto;
        }
    }
}

window.excluirProntuario = async function(pacienteId, prontuarioId) {
    if(confirm("Tem certeza que deseja apagar esta anotação do prontuário? Esta ação não tem volta.")) {
        let index = listaPacientesGlobais.findIndex(p => p.id === pacienteId);
        if (index > -1) {
            listaPacientesGlobais[index].prontuarios = listaPacientesGlobais[index].prontuarios.filter(p => p.id !== prontuarioId);
            await supabase.from('prontuarios').delete().eq('id', prontuarioId); // Deleção cirúrgica
            salvarBD();
            window.renderizarHistoricoProntuario(pacienteId);
        }
    }
}

window.toggleTextoProntuario = function(id) {
    const resumo = document.getElementById('resumo-' + id);
    const completo = document.getElementById('completo-' + id);
    if (completo.style.display === 'none') {
        completo.style.display = 'block';
        resumo.style.display = 'none';
    } else {
        completo.style.display = 'none';
        resumo.style.display = '-webkit-box';
    }
}

// ==========================================
// 🌍 CONVERSOR DE FUSO HORÁRIO INTELIGENTE
// ==========================================

function obterDiffMinutosFuso(fusoDestino) {
    try {
        const now = new Date();
        const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const targetTimeObj = new Date(now.toLocaleString('en-US', { timeZone: fusoDestino }));
        return Math.round((targetTimeObj - brTime) / 60000); 
    } catch (e) {
        return null;
    }
}

function calcularConversaoTempo(valorHoraInput, deBrasiliaParaTarget, fusoDestino) {
    if (!valorHoraInput || !fusoDestino) return '';
    
    const diffMinutos = obterDiffMinutosFuso(fusoDestino);
    if (diffMinutos === null) return '';

    let [h, m] = valorHoraInput.split(':').map(Number);
    let totalMinutos = (h * 60) + m;

    if (deBrasiliaParaTarget) {
        totalMinutos += diffMinutos;
    } else {
        totalMinutos -= diffMinutos;
    }

    while (totalMinutos < 0) totalMinutos += 24 * 60;
    while (totalMinutos >= 24 * 60) totalMinutos -= 24 * 60;

    const horasFinais = Math.floor(totalMinutos / 60);
    const minsFinais = totalMinutos % 60;

    return String(horasFinais).padStart(2, '0') + ':' + String(minsFinais).padStart(2, '0');
}

window.converterDeBRParaTarget = function() {
    const fuso = document.getElementById('input-fuso').value;
    const valBR = document.getElementById('input-hora-brasilia').value;
    if (!fuso || !valBR) return;
    
    document.getElementById('input-hora-target').value = calcularConversaoTempo(valBR, true, fuso);
};

window.converterDeTargetParaBR = function() {
    const fuso = document.getElementById('input-fuso').value;
    const valTarget = document.getElementById('input-hora-target').value;
    if (!fuso || !valTarget) return;
    
    document.getElementById('input-hora-brasilia').value = calcularConversaoTempo(valTarget, false, fuso);
};

window.atualizarNomesFuso = function() {
    const fuso = document.getElementById('input-fuso').value;
    const label = document.getElementById('label-fuso-escolhido');
    
    if (fuso && fuso.includes('/')) {
        let nomeFuso = fuso.split('/').pop().replace('_', ' ');
        label.innerText = 'Horário em ' + nomeFuso;
        
        if (document.getElementById('input-hora-brasilia').value) {
            window.converterDeBRParaTarget();
        } else if (document.getElementById('input-hora-target').value) {
            window.converterDeTargetParaBR();
        }
    } else {
        label.innerText = 'Horário lá';
    }
};