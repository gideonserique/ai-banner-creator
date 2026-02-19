'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState({
        full_name: '',
        company_name: '',
        whatsapp: '',
        logo_url: '',
        subscription_tier: 'free',
        generations_count: 0,
        stripe_customer_id: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchUserAndProfile();
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
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (data) {
                    setProfile({
                        full_name: data.full_name || '',
                        company_name: data.company_name || '',
                        whatsapp: data.whatsapp || '',
                        logo_url: data.logo_url || '',
                        subscription_tier: data.subscription_tier || 'free',
                        generations_count: data.generations_count || 0,
                        stripe_customer_id: data.stripe_customer_id || ''
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

        if (file.size > 2 * 1024 * 1024) {
            setError('O logotipo deve ter menos de 2MB.');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setProfile(prev => ({ ...prev, logo_url: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
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
        if (newPassword !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
            setSuccess('Senha atualizada com sucesso!');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setError(err.message || 'Erro ao atualizar senha.');
        } finally {
            setSaving(false);
        }
    };

    const handleUpgrade = async () => {
        setSaving(true);
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    email: user.email
                }),
            });

            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Erro ao iniciar checkout');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirm = window.confirm('TEM CERTEZA? Esta ação é permanente e você perderá todos os seus banners salvos.');
        if (!confirm) return;

        alert('Por motivos de segurança, entre em contato com o suporte para excluir sua conta permanentemente: gideonseriquevfx@gmail.com');
    };

    const handleManageSubscription = async () => {
        if (!profile.stripe_customer_id) {
            setError('ID do cliente Stripe não encontrado. Se você acabou de assinar, aguarde alguns minutos.');
            return;
        }

        setSaving(true);
        try {
            const response = await fetch('/api/customer-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: profile.stripe_customer_id
                }),
            });

            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Erro ao abrir portal de gerenciamento');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
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
                    <Link href="/login" className={styles.primaryBtn} style={{ maxWidth: '200px', margin: '20px auto' }}>
                        Entrar agora
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <main className={styles.main}>
            <div className={styles.bgOrbs}>
                <div className={styles.orb1} />
                <div className={styles.orb2} />
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
                    <p className={styles.heroSub}>Gerencie sua conta e identidade visual.</p>
                </section>

                {/* Seção de Planos */}
                <div style={{ marginBottom: '40px' }}>
                    <h2 className={styles.cardLabel} style={{ marginBottom: '20px', fontSize: '20px' }}>Seu Plano Atual</h2>
                    <div className={styles.responsiveGrid} style={{ gap: '20px' }}>
                        <div className={styles.card} style={{ border: profile.subscription_tier === 'free' ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '22px', margin: 0 }}>Gratuito</h3>
                                {profile.subscription_tier === 'free' && <span style={{ background: 'var(--accent)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>ATIVO</span>}
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '15px 0' }}>Ideal para testar a ferramenta e criar suas primeiras artes.</p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                <li style={{ marginBottom: '8px' }}>✅ 5 Gerações de Banner para Testar</li>
                                <li style={{ marginBottom: '8px' }}>✅ Galeria Pessoal</li>
                                <li>✅ Suporte por E-mail e WhatsApp</li>
                            </ul>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>R$ 0,00</div>
                            <div style={{ fontSize: '12px', color: 'var(--accent-light)', marginTop: '10px' }}>
                                {profile.generations_count} / 5 banners usados
                            </div>
                        </div>

                        <div className={styles.card} style={{ border: profile.subscription_tier === 'premium' ? '2px solid var(--accent)' : '1px solid var(--border)', background: 'linear-gradient(145deg, rgba(245, 158, 11, 0.05) 0%, rgba(0,0,0,0) 100%)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '22px', margin: 0 }}>Premium 💎</h3>
                                {profile.subscription_tier === 'premium' && <span style={{ background: '#22c55e', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>ATIVO</span>}
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '15px 0' }}>Banners ilimitados para escala o seu negócio gastronômico.</p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                <li style={{ marginBottom: '8px' }}>✅ Banners **ILIMITADOS**</li>
                                <li style={{ marginBottom: '8px' }}>✅ Suporte VIP no WhatsApp</li>
                                <li style={{ marginBottom: '8px' }}>✅ Galeria Pessoal</li>
                                <li>✅ Todas as atualizações futuras</li>
                            </ul>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>R$ 29,90 / mês</div>
                            {profile.subscription_tier === 'free' ? (
                                <button
                                    className={styles.primaryBtn}
                                    style={{ marginTop: '20px', width: '100%' }}
                                    onClick={handleUpgrade}
                                    disabled={saving}
                                >
                                    {saving ? <span className={styles.spinner} /> : 'Assinar Agora'}
                                </button>
                            ) : (
                                <button
                                    className={styles.secondaryBtn}
                                    style={{ marginTop: '20px', width: '100%' }}
                                    onClick={handleManageSubscription}
                                    disabled={saving}
                                >
                                    {saving ? <span className={styles.spinner} /> : 'Gerenciar Assinatura'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.responsiveGrid} style={{ gap: '30px', alignItems: 'start' }}>
                    {/* Coluna 1: Dados Pessoais e Logo */}
                    <div className={styles.card}>
                        <h2 className={styles.cardLabel} style={{ fontSize: '18px', marginBottom: '10px' }}>Informações da Empresa</h2>

                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '12px',
                                    border: '1px dashed var(--border)',
                                    margin: '0 auto 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: profile.logo_url ? 'white' : 'var(--bg-secondary)',
                                    overflow: 'hidden'
                                }}
                            >
                                {profile.logo_url ? (
                                    <img src={profile.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                ) : (
                                    <span style={{ fontSize: '30px', opacity: 0.3 }}>🏢</span>
                                )}
                            </div>
                            <button className={styles.uploadBtnSmall} onClick={() => fileInputRef.current?.click()}>
                                {profile.logo_url ? 'Trocar Logotipo' : 'Adicionar Logotipo'}
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*"
                                onChange={handleLogoUpload}
                            />
                        </div>

                        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label className={styles.sizeLabel} style={{ marginBottom: '5px', display: 'block' }}>Nome Completo</label>
                                <input
                                    className={styles.textarea}
                                    style={{ padding: '12px' }}
                                    value={profile.full_name}
                                    onChange={e => setProfile(prev => ({ ...prev, full_name: e.target.value }))}
                                    placeholder="Seu nome"
                                />
                            </div>
                            <div>
                                <label className={styles.sizeLabel} style={{ marginBottom: '5px', display: 'block' }}>Nome da Empresa</label>
                                <input
                                    className={styles.textarea}
                                    style={{ padding: '12px' }}
                                    value={profile.company_name}
                                    onChange={e => setProfile(prev => ({ ...prev, company_name: e.target.value }))}
                                    placeholder="Ex: Pizzaria do Zé"
                                />
                            </div>
                            <div>
                                <label className={styles.sizeLabel} style={{ marginBottom: '5px', display: 'block' }}>WhatsApp</label>
                                <input
                                    className={styles.textarea}
                                    style={{ padding: '12px' }}
                                    value={profile.whatsapp}
                                    onChange={e => setProfile(prev => ({ ...prev, whatsapp: e.target.value }))}
                                    placeholder="(99) 99999-9999"
                                />
                            </div>
                            <button className={styles.primaryBtn} disabled={saving}>
                                {saving ? <span className={styles.spinner} /> : 'Salvar Alterações'}
                            </button>
                        </form>
                    </div>

                    {/* Coluna 2: Segurança e Suporte */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        {/* Suporte */}
                        <div className={styles.card} style={{ gap: '15px' }}>
                            <h2 className={styles.cardLabel} style={{ fontSize: '18px' }}>Suporte & Ajuda</h2>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Precisa de ajuda com o app ou sugestões?</p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <a href="https://wa.me/5595981020414" target="_blank" className={styles.selectBtn} style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>
                                    📱 WhatsApp
                                </a>
                                <a href="mailto:gideonseriquevfx@gmail.com" className={styles.selectBtn} style={{ textDecoration: 'none', textAlign: 'center', flex: 1 }}>
                                    📧 E-mail
                                </a>
                            </div>
                            <Link href="/terms" style={{ fontSize: '13px', color: 'var(--accent-light)', textAlign: 'center' }}> Ver Termos e Regras </Link>
                        </div>

                        {/* Senha */}
                        <div className={styles.card}>
                            <h2 className={styles.cardLabel} style={{ fontSize: '18px', marginBottom: '15px' }}>Segurança</h2>
                            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <input
                                    type="password"
                                    className={styles.textarea}
                                    style={{ padding: '12px' }}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Nova Senha"
                                />
                                <input
                                    type="password"
                                    className={styles.textarea}
                                    style={{ padding: '12px' }}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Confirmar Nova Senha"
                                />
                                <button className={styles.primaryBtn} disabled={saving || !newPassword}>
                                    Alterar Senha
                                </button>
                            </form>
                        </div>

                        {/* Perigo */}
                        <div className={styles.card} style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                            <h3 className={styles.cardLabel} style={{ color: '#ef4444' }}>Zona de Perigo</h3>
                            <button className={styles.dangerBtn} onClick={handleDeleteAccount} style={{ width: '100%' }}>
                                Excluir Minha Conta
                            </button>
                        </div>
                    </div>
                </div>

                {success && (
                    <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#22c55e', color: 'white', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 2000 }}>
                        {success}
                    </div>
                )}
                {error && (
                    <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: 'white', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 2000 }}>
                        {error}
                    </div>
                )}
            </div>
        </main>
    );
}
