// Verifica se o token enviado pelo app (do login Supabase) é válido,
// e devolve o usuário correspondente. Usado por todas as funções da pasta /api.
export async function obterUsuarioAutenticado(req) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return null;

    const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.SUPABASE_ANON_KEY
        }
    });
    if (!resp.ok) return null;
    return resp.json();
}
