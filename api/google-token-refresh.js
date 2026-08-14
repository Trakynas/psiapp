import { obterUsuarioAutenticado } from './_lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const usuario = await obterUsuarioAutenticado(req);
    if (!usuario) return res.status(401).json({ error: 'Não autenticado' });

    try {
        const buscaResp = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/google_tokens?user_id=eq.${usuario.id}&select=refresh_token,updated_at`,
            {
                headers: {
                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                }
            }
        );
        const linhas = await buscaResp.json();
        if (!linhas.length) return res.status(404).json({ error: 'Nenhuma conexão Google salva ainda' });

        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: linhas[0].refresh_token,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                grant_type: 'refresh_token'
            })
        });
        const tokenData = await tokenResp.json();
        if (!tokenResp.ok) {
            // Se o refresh_token expirou (7 dias em modo Testes) ou foi revogado, o Google retorna invalid_grant aqui.
            return res.status(400).json({ error: tokenData.error_description || tokenData.error || 'Erro ao renovar token' });
        }

        return res.status(200).json({ access_token: tokenData.access_token, expires_in: tokenData.expires_in, salvo_em: linhas[0].updated_at });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
