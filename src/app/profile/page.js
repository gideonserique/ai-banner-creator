'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

// ─── Plan Definitions ─────────────────────────────────────────────────────────
const PLANS = [
    {
        slug: 'free',
        name: 'Gratuito',
        price: 'R$ 0',
        priceSub: 'para sempre',
        limit: 5,
        limitLabel: '5 artes/mês',
        color: '#64748b',
        icon: '🆓',
        features: [
            { label: 'Suporte Humano', ok: true },
            { label: 'Comando por Voz', ok: false, badge: 'PRO' },
            { label: 'Escritor de Legendas IA', ok: false, badge: 'PRO' },
        ],
    },
    {
        slug: 'starter',
        name: 'Starter',
        price: 'R$ 29,90',
        priceSub: '/mês',
        limit: 20,
        limitLabel: '20 artes/mês',
        color: '#f97316',
        icon: '🚀',
        features: [
            { label: 'Suporte Humano', ok: true },
            { label: 'Comando por Voz', ok: true },
            { label: 'Escritor de Legendas IA', ok: true },
        ],
    },
    {
        slug: 'unlimited_monthly',
        name: 'Ilimitado',
        price: 'R$ 69,90',
        priceSub: '/mês',
        limit: null,
        limitLabel: 'Artes Ilimitadas',
        color: '#8b5cf6',
        icon: '♾️',
        badge: 'Popular',
        features: [
            { label: 'Suporte Prioritário', ok: true },
            { label: 'Comando por Voz', ok: true },
            { label: 'Escritor de Legendas IA', ok: true },
        ],
    },
    {
        slug: 'unlimited_annual',
        name: 'Ilimitado Anual',
        price: 'R$ 49,90',
        priceSub: '/mês',
        priceAnnual: 'R$ 598,80/ano',
        limit: null,
        limitLabel: 'Artes Ilimitadas',
        color: '#22c55e',
        icon: '💎',
        badge: 'Mais Econômico',
        features: [
            { label: 'Suporte Prioritário', ok: true },
            { label: 'Comando por Voz', ok: true },
            { label: 'Escritor de Legendas IA', ok: true },
        ],
    },
];

const PAID_PLANS = ['starter', 'unlimited_monthly', 'unlimited_annual'];

function getTierLabel(slug) {
    return PLANS.find(p => p.slug === slug)?.name || slug;
}

function formatDate(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState({
        full_name: '',
        company_name: '',
        whatsapp: '',
        logo_url: '',
        subscription_tier: 'free',
        generations_count: 0,
        stripe_customer_id: '',
        stripe_subscription_id: '',
        subscription_expires_at: null,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState('');
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchUserAndProfile();

        // Handle return from Stripe
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            setSuccess('🎉 Assinatura confirmada! Seu plano foi atualizado.');
            window.history.replaceState({}, '', '/profile');
        }
        if (params.get('canceled') === 'true') {
            setError('Checkout cancelado. Você pode tentar novamente a qualquer momento.');
            window.history.replaceState({}, '', '/profile');
        }
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    async function fetchUserAndProfile() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (data) {
                    const isAdmin = session.user.email === 'gideongsr94@gmail.com';
                    setProfile({
                        full_name: data.full_name || '',
                        company_name: data.company_name || '',
                        whatsapp: data.whatsapp || '',
                        logo_url: data.logo_url || '',
                        subscription_tier: isAdmin ? 'unlimited_annual' : (data.subscription_tier || 'free'),
                        generations_count: data.generations_count || 0,
                        stripe_customer_id: data.stripe_customer_id || '',
                        stripe_subscription_id: data.stripe_subscription_id || '',
                        subscription_expires_at: data.subscription_expires_at || null,
                        isAdmin: isAdmin,
                    });
                }
            }
        } catch (err) {
            console.error('Erro ao carregar perfil:', err);
        } finally {
            setLoading(false);
        }
    }

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { setError('O logotipo deve ter menos de 2MB.'); return; }
        const reader = new FileReader();
        reader.onloadend = () => setProfile(prev => ({ ...prev, logo_url: reader.result }));
        reader.readAsDataURL(file);
    };

    const handleDeleteLogo = async () => {
        const ok = window.confirm('Deseja realmente remover o logotipo?');
        if (!ok) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ logo_url: null })
                .eq('id', user.id);

            if (error) throw error;

            setProfile(prev => ({ ...prev, logo_url: '' }));
            setSuccess('Logotipo removido com sucesso!');
        } catch (err) {
            setError('Erro ao remover logotipo: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setSaving(true); setError(''); setSuccess('');
        try {
            const { error } = await supabase.from('profiles').upsert({
                id: user.id,
                full_name: profile.full_name,
                company_name: profile.company_name,
                whatsapp: profile.whatsapp,
                logo_url: profile.logo_url,
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
            setSuccess('Perfil atualizado com sucesso!');
        } catch (err) {
            setError(err.message || 'Erro ao atualizar perfil.');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { setError('As senhas não coincidem.'); return; }
        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setSuccess('Senha atualizada com sucesso!');
            setNewPassword(''); setConfirmPassword('');
        } catch (err) {
            setError(err.message || 'Erro ao atualizar senha.');
        } finally {
            setSaving(false);
        }
    };

    const handleSubscribe = async (planSlug) => {
        if (planSlug === 'free') return;
        setCheckoutLoading(planSlug); setError('');
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, email: user.email, planId: planSlug }),
            });
            const data = await response.json();
            if (data.url) { window.location.href = data.url; }
            else throw new Error(data.error || 'Erro ao iniciar checkout');
        } catch (err) {
            setError(err.message);
        } finally {
            setCheckoutLoading('');
        }
    };

    const handleManageSubscription = async () => {
        if (!profile.stripe_customer_id) {
            setError('ID de cliente não encontrado. Se você acabou de assinar, aguarde alguns minutos e recarregue.');
            return;
        }
        setSaving(true);
        try {
            const response = await fetch('/api/customer-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: profile.stripe_customer_id }),
            });
            const data = await response.json();
            if (data.url) { window.location.href = data.url; }
            else {
                let msg = data.error || 'Erro ao abrir portal';
                if (msg.includes('No such customer') && msg.includes('test mode')) {
                    msg = '⚠️ Erro de sincronização: Este usuário possui um ID do Stripe em modo TESTE, mas você está em modo LIVE (ou vice-versa). Para corrigir, limpe o campo stripe_customer_id deste usuário no Supabase.';
                }
                throw new Error(msg);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        const ok = window.confirm('TEM CERTEZA? Esta ação é permanente e você perderá todos os seus banners.');
        if (!ok) return;
        alert('Por motivos de segurança, entre em contato: gideonseriquevfx@gmail.com');
    };

    if (loading) {
        return (
            <div className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className={styles.spinner} />
            </div>
        );
    }

    if (!user) {
        return (
            <div className={styles.main}>
                <div className={styles.container} style={{ textAlign: 'center', paddingTop: '100px' }}>
                    <h1 className={styles.heroTitle}>Acesso Restrito</h1>
                    <p className={styles.heroSub}>Você precisa estar logado para ver seu perfil.</p>
                    <Link href="/login" className={styles.primaryBtn} style={{ maxWidth: '200px', margin: '20px auto' }}>Entrar agora</Link>
                </div>
            </div>
        );
    }

    const currentPlan = PLANS.find(p => p.slug === profile.subscription_tier) || PLANS[0];
    const isPaid = PAID_PLANS.includes(profile.subscription_tier) || profile.isAdmin;
    const isUnlimited = profile.subscription_tier === 'unlimited_monthly' || profile.subscription_tier === 'unlimited_annual' || profile.isAdmin;
    const usagePercent = isUnlimited ? 0 : Math.min(100, ((profile.generations_count || 0) / (currentPlan.limit || 5)) * 100);
    const renewalDate = profile.isAdmin ? 'Acesso Vitalício Admin' : formatDate(profile.subscription_expires_at);

    return (
        <main className={styles.main}>
            <div className={styles.bgOrbs}>
                <div className={styles.orb1} /> <div className={styles.orb2} />
            </div>

            <div className={styles.container}>
                <header className={styles.header}>
                    <div className={styles.logo} onClick={() => window.location.href = '/'} style={{ cursor: 'pointer' }}>
                        <span className={styles.logoIcon}>✦</span>
                        <span className={styles.logoText}>BannerIA</span>
                    </div>
                    <nav className={styles.navButtons}>
                        <Link href="/" className={styles.loginLink}>Home</Link>
                        <Link href="/gallery" className={styles.loginLink}>Galeria</Link>
                        <button className={styles.loginLink} onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
                    </nav>
                </header>

                <section className={styles.hero} style={{ marginBottom: '30px' }}>
                    <h1 className={styles.heroTitle}>Meu <span className={styles.heroGradient}>Perfil</span></h1>
                    <p className={styles.heroSub}>Gerencie sua conta e assinatura.</p>
                </section>

                {/* ── CURRENT PLAN BANNER ─────────────────────────────────── */}
                <div className={styles.card} style={{
                    marginBottom: '32px',
                    borderColor: currentPlan.color,
                    borderWidth: '1.5px',
                    background: `linear-gradient(135deg, ${currentPlan.color}10 0%, transparent 60%)`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '24px' }}>{profile.isAdmin ? '🛠️' : currentPlan.icon}</span>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: profile.isAdmin ? '#3b82f6' : currentPlan.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {profile.isAdmin ? 'Acesso Admin' : 'Plano Atual'}
                                </span>
                            </div>
                            <h2 style={{ fontSize: '28px', fontWeight: '800', margin: '0 0 4px', color: 'var(--text-primary)' }}>
                                {profile.isAdmin ? 'Administrador' : currentPlan.name}
                            </h2>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                                {profile.isAdmin ? 'Acesso total ilimitado liberado ✓' : (isUnlimited ? 'Criações ilimitadas ✓ Voz ✓ Legendas IA ✓' : `${currentPlan.limitLabel} · Suporte incluído`)}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            {isPaid && renewalDate && (
                                <div style={{ marginBottom: '10px', textAlign: 'right' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Renova em</div>
                                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>{renewalDate}</div>
                                </div>
                            )}
                            {isPaid ? (
                                <button
                                    onClick={handleManageSubscription}
                                    disabled={saving}
                                    className={styles.secondaryBtn}
                                    style={{ fontSize: '13px', padding: '8px 16px' }}
                                >
                                    {saving ? <span className={styles.spinner} /> : '⚙️ Gerenciar Assinatura'}
                                </button>
                            ) : (
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gratuito · Sem vencimento</div>
                            )}
                        </div>
                    </div>

                    {/* Usage bar (only for limited plans) */}
                    {!isUnlimited && (
                        <div style={{ marginTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Artes criadas este mês</span>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: usagePercent >= 90 ? '#ef4444' : 'var(--text-primary)' }}>
                                    {profile.generations_count} / {currentPlan.limit}
                                </span>
                            </div>
                            <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${usagePercent}%`,
                                    borderRadius: '4px',
                                    background: usagePercent >= 90 ? '#ef4444' : `linear-gradient(90deg, ${currentPlan.color}, ${currentPlan.color}cc)`,
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                            {usagePercent >= 80 && (
                                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px', fontWeight: '600' }}>
                                    ⚠️ {usagePercent >= 100 ? 'Limite atingido! Faça upgrade para continuar.' : `Quase no limite! Restam ${currentPlan.limit - profile.generations_count} artes.`}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── PRICING TABLE ────────────────────────────────────────── */}
                <div style={{ marginBottom: '40px' }}>
                    <h2 className={styles.cardLabel} style={{ marginBottom: '20px', fontSize: '20px' }}>Planos Disponíveis</h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '20px',
                        maxWidth: '900px',
                        margin: '0 auto'
                    }}>
                        {PLANS.map((plan) => {
                            const isCurrentPlan = profile.subscription_tier === plan.slug;
                            return (
                                <div
                                    key={plan.slug}
                                    className={styles.card}
                                    style={{
                                        border: isCurrentPlan ? `2px solid ${plan.color}` : '1px solid var(--border)',
                                        padding: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        position: 'relative',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                    }}
                                >
                                    {/* Badge */}
                                    {plan.badge && (
                                        <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: plan.color, color: 'white', fontSize: '11px', fontWeight: '700', padding: '3px 12px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                                            ⭐ {plan.badge}
                                        </div>
                                    )}
                                    {isCurrentPlan && (
                                        <div style={{ position: 'absolute', top: '12px', right: '12px', background: plan.color, color: 'white', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px' }}>
                                            ATIVO
                                        </div>
                                    )}

                                    {/* Plan header */}
                                    <div>
                                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>{plan.icon}</div>
                                        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>{plan.name}</div>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: plan.color, lineHeight: '1' }}>{plan.price}<span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>{plan.priceSub}</span></div>
                                        {plan.priceAnnual && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{plan.priceAnnual}</div>}
                                    </div>

                                    {/* Limit */}
                                    <div style={{ fontSize: '13px', color: plan.color, fontWeight: '600' }}>📊 {plan.limitLabel}</div>

                                    {/* Features */}
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {plan.features.map((f, i) => (
                                            <li key={i} style={{
                                                fontSize: '13px',
                                                color: f.ok ? 'var(--text-secondary)' : 'var(--text-muted)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <span style={{ fontSize: '14px' }}>{f.ok ? '✅' : '🔒'}</span>
                                                <span>{f.label}</span>
                                                {f.badge && (
                                                    <span style={{
                                                        fontSize: '9px',
                                                        fontWeight: '800',
                                                        background: 'var(--accent-light)',
                                                        color: 'white',
                                                        padding: '1px 5px',
                                                        borderRadius: '4px',
                                                        marginLeft: '4px'
                                                    }}>
                                                        {f.badge}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>

                                    {/* Action button */}
                                    <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                                        {isCurrentPlan ? (
                                            <div style={{ fontSize: '13px', color: plan.color, fontWeight: '600', textAlign: 'center', padding: '8px' }}>✓ Seu plano atual</div>
                                        ) : plan.slug === 'free' ? (
                                            isPaid ? (
                                                <button className={styles.secondaryBtn} style={{ width: '100%', fontSize: '13px' }} onClick={handleManageSubscription} disabled={saving}>
                                                    Fazer Downgrade
                                                </button>
                                            ) : null
                                        ) : (
                                            <button
                                                className={styles.primaryBtn}
                                                style={{ width: '100%', fontSize: '13px', background: plan.color, boxShadow: `0 4px 15px ${plan.color}40` }}
                                                onClick={() => handleSubscribe(plan.slug)}
                                                disabled={!!checkoutLoading}
                                            >
                                                {checkoutLoading === plan.slug
                                                    ? <span className={styles.spinner} />
                                                    : isPaid ? '↑ Mudar para este plano' : '⚡ Assinar Agora'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {isPaid && (
                        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
                            Upgrades e downgrades são gerenciados pelo Stripe e têm efeito proporcional ao ciclo atual.
                            <button onClick={handleManageSubscription} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-light)', fontSize: '12px', marginLeft: '4px' }}>Abrir portal de assinatura →</button>
                        </p>
                    )}
                </div>

                {/* ── PROFILE & SECURITY ───────────────────────────────────── */}
                <div className={styles.responsiveGrid} style={{ gap: '30px', alignItems: 'start' }}>
                    {/* Column 1: Company info */}
                    <div className={styles.card}>
                        <h2 className={styles.cardLabel} style={{ fontSize: '18px', marginBottom: '10px' }}>Informações da Empresa</h2>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ width: '100px', height: '100px', borderRadius: '12px', border: '1px dashed var(--border)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: profile.logo_url ? 'white' : 'var(--bg-secondary)', overflow: 'hidden' }}>
                                {profile.logo_url ? (
                                    <img src={profile.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                ) : (
                                    <span style={{ fontSize: '30px', opacity: 0.3 }}>🏢</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                <button className={styles.uploadBtnSmall} onClick={() => fileInputRef.current?.click()}>
                                    {profile.logo_url ? 'Trocar Logotipo' : 'Adicionar Logotipo'}
                                </button>
                                {profile.logo_url && (
                                    <button
                                        onClick={handleDeleteLogo}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#ef4444',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        Remover Logotipo
                                    </button>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleLogoUpload} />
                        </div>
                        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label className={styles.sizeLabel} style={{ marginBottom: '5px', display: 'block' }}>Nome Completo</label>
                                <input className={styles.textarea} style={{ padding: '12px' }} value={profile.full_name} onChange={e => setProfile(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Seu nome" />
                            </div>
                            <div>
                                <label className={styles.sizeLabel} style={{ marginBottom: '5px', display: 'block' }}>Nome da Empresa</label>
                                <input className={styles.textarea} style={{ padding: '12px' }} value={profile.company_name} onChange={e => setProfile(prev => ({ ...prev, company_name: e.target.value }))} placeholder="Ex: Pizzaria do Zé" />
                            </div>
                            <div>
                                <label className={styles.sizeLabel} style={{ marginBottom: '5px', display: 'block' }}>WhatsApp</label>
                                <input className={styles.textarea} style={{ padding: '12px' }} value={profile.whatsapp} onChange={e => setProfile(prev => ({ ...prev, whatsapp: e.target.value }))} placeholder="(99) 99999-9999" />
                            </div>
                            <button className={styles.primaryBtn} disabled={saving}>{saving ? <span className={styles.spinner} /> : 'Salvar Alterações'}</button>
                        </form>
                    </div>

                    {/* Column 2: Security & Support */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        <div className={styles.card} style={{ gap: '15px' }}>
                            <h2 className={styles.cardLabel} style={{ fontSize: '18px' }}>Suporte & Ajuda</h2>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                {isPaid ? '⭐ Você tem suporte prioritário!' : 'Precisa de ajuda com o app?'}
                            </p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <a href="https://wa.me/5595981020414" target="_blank" className={styles.selectBtn} style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>📱 WhatsApp</a>
                                <a href="mailto:gideonseriquevfx@gmail.com" className={styles.selectBtn} style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>📧 E-mail</a>
                            </div>
                            <Link href="/terms" style={{ fontSize: '13px', color: 'var(--accent-light)', textAlign: 'center' }}>Ver Termos e Regras</Link>
                        </div>

                        <div className={styles.card}>
                            <h2 className={styles.cardLabel} style={{ fontSize: '18px', marginBottom: '15px' }}>Segurança</h2>
                            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <input type="password" className={styles.textarea} style={{ padding: '12px' }} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova Senha" />
                                <input type="password" className={styles.textarea} style={{ padding: '12px' }} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmar Nova Senha" />
                                <button className={styles.primaryBtn} disabled={saving || !newPassword}>Alterar Senha</button>
                            </form>
                        </div>

                        <div className={styles.card} style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                            <h3 className={styles.cardLabel} style={{ color: '#ef4444' }}>Zona de Perigo</h3>
                            <button className={styles.dangerBtn} onClick={handleDeleteAccount} style={{ width: '100%' }}>Excluir Minha Conta</button>
                        </div>
                    </div>
                </div>

                {/* Toast notifications */}
                {success && (
                    <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#22c55e', color: 'white', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 2000, maxWidth: '90vw', textAlign: 'center' }}>
                        {success}
                    </div>
                )}
                {error && (
                    <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: 'white', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 2000, maxWidth: '90vw', textAlign: 'center' }} onClick={() => setError('')}>
                        {error}
                    </div>
                )}
            </div>
        </main>
    );
}
