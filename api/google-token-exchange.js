import { obterUsuarioAutenticado } from './_lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const usuario = await obterUsuarioAutenticado(req);
    if (!usuario) return res.status(401).json({ error: 'Não autenticado' });

    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Código ausente' });

    try {
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: 'postmessage',
                grant_type: 'authorization_code'
            })
        });
        const tokenData = await tokenResp.json();
        if (!tokenResp.ok) {
            return res.status(400).json({ error: tokenData.error_description || 'Erro ao trocar código com o Google' });
        }

        // Só recebemos refresh_token na primeira autorização (com prompt=consent).
        // Se recebemos, salvamos/atualizamos no banco pra usar depois sem popup.
        let salvoEm = null;
        if (tokenData.refresh_token) {
            salvoEm = new Date().toISOString();
            await fetch(`${process.env.SUPABASE_URL}/rest/v1/google_tokens`, {
                method: 'POST',
                headers: {
                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({ user_id: usuario.id, refresh_token: tokenData.refresh_token, updated_at: salvoEm })
            });
        } else {
            // Não veio refresh_token novo (ela já tinha um válido) — busca a data salva do que já existe
            const busca = await fetch(`${process.env.SUPABASE_URL}/rest/v1/google_tokens?user_id=eq.${usuario.id}&select=updated_at`, {
                headers: {
                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                }
            });
            const linhas = await busca.json();
            if (linhas.length) salvoEm = linhas[0].updated_at;
        }

        return res.status(200).json({ access_token: tokenData.access_token, expires_in: tokenData.expires_in, salvo_em: salvoEm });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
