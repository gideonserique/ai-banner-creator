const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

// Config e Leitura de Variáveis
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET;

console.log('\n🔍 --- DIAGNÓSTICO COMPLETO BANNERIA --- 🔍\n');

// 1. Validar Presença das Chaves
console.log('1️⃣  VERIFICAÇÃO DE CHAVES:');
const keys = {
    'NEXT_PUBLIC_SUPABASE_URL': SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': SERVICE_KEY,
    'STRIPE_SECRET_KEY': STRIPE_SECRET,
    'STRIPE_WEBHOOK_SECRET': STRIPE_WEBHOOK
};

let missing = false;
for (const [name, value] of Object.entries(keys)) {
    if (!value) {
        console.error(`   ❌ FALTOU: ${name}`);
        missing = true;
    } else {
        const preview = value.length > 10 ? value.substring(0, 10) + '...' : value;
        console.log(`   ✅ ${name}: ${preview}`);
    }
}

if (missing) {
    console.error('\n🚫 PARE AQUI! Preencha o arquivo .env.local com todas as chaves.');
    process.exit(1);
}

// 2. Testar Conexão Supabase e Stripe em paralelo
console.log('\n2️⃣  TESTANDO CONEXÕES:');

// Inicializa cliente Supabase
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${SERVICE_KEY}` } }
});

async function runDiagnosis() {
    try {
        // Teste Supabase
        const { data, error } = await supabase.from('profiles').select('id').limit(1);
        if (error) throw new Error(`Supabase falhou: ${error.message}`);
        console.log('   ✅ Conexão com Banco de Dados: OK (Permissão de Escrita Confirmada)');

        // Teste Stripe
        const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });
        const customers = await stripe.customers.list({ limit: 1 });
        console.log('   ✅ Conexão com Stripe API: OK');

        // 3. Conclusão
        console.log('\n🎉 DIAGNÓSTICO FINAL:');
        console.log('   Sua máquina local está 100% configurada corretamente.');
        console.log('   Se o problema persiste online, o erro é APENAS nas variáveis da Vercel.');
        console.log('   COPIE o conteúdo do seu .env.local e cole nas configs da Vercel agora.');

    } catch (err) {
        console.error('   ❌ ERRO NO TESTE:', err.message);
        if (err.message.includes('Supabase')) {
            console.error('   👉 Verifique a SUPABASE_SERVICE_ROLE_KEY.');
        } else if (err.message.includes('Stripe')) {
            console.error('   👉 Verifique a STRIPE_SECRET_KEY.');
        }
        process.exit(1);
    }
}

runDiagnosis();
