'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

const SIZES = [
    { id: 'square', label: 'Quadrado', icon: '◻', dims: '1080×1080' },
    { id: 'portrait', label: 'Vertical', icon: '▯', dims: '1080×1920' },
    { id: 'landscape', label: 'Horizontal', icon: '▬', dims: '1280×720' },
];

export default function GalleryPage() {
    const [banners, setBanners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [previewBanner, setPreviewBanner] = useState(null);
    const [generatingCaption, setGeneratingCaption] = useState(null); // ID do banner sendo processado
    const [sharingBanner, setSharingBanner] = useState(null); // Banner sendo preparado para compartilhar
    const [showCaptionPrompt, setShowCaptionPrompt] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState({ show: false, type: '', id: null }); // type: 'banner' ou 'caption'
    const [editingCaption, setEditingCaption] = useState({ id: null, text: '' });
    const [userData, setUserData] = useState({ subscriptionTier: 'free' });
    const [error, setError] = useState(null);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                fetchBanners(session.user.id);
            } else {
                setLoading(false);
            }
        };
        checkUser();
    }, []);

    const fetchBanners = async (userId) => {
        try {
            // Fetch profile for tier gating
            const { data: profile } = await supabase
                .from('profiles')
                .select('subscription_tier')
                .eq('id', userId)
                .single();

            if (profile) {
                const isAdmin = (await supabase.auth.getSession()).data.session?.user?.email === 'gideongsr94@gmail.com';
                setUserData({
                    subscriptionTier: isAdmin ? 'unlimited_annual' : (profile.subscription_tier || 'free')
                });
            }

            const { data, error } = await supabase
                .from('banners')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBanners(data || []);
        } catch (err) {
            console.error('Erro ao buscar banners:', err);
            setError('Certifique-se de que a tabela "banners" foi criada no seu Supabase. Verifique o guia database_setup.md.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = (banner) => {
        // Se é plano pago e não tem legenda, pergunta
        if (['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(userData.subscriptionTier) && !banner.caption) {
            setSharingBanner({ ...banner, type: 'download' });
            setShowCaptionPrompt(true);
        } else {
            executeDownload(banner.image_url, banner.size, banner.id);
        }
    };

    const executeDownload = async (url, size, id) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `meu-banner-${size}-${id}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Erro ao baixar:', err);
            const link = document.createElement('a');
            link.href = url;
            link.download = `meu-banner-${size}-${id}.png`;
            link.target = '_blank';
            link.click();
        }
    };

    const handleShare = async (banner) => {
        // Se já tem legenda, compartilha direto
        if (banner.caption) {
            executeShare(banner.image_url, banner.size, banner.caption);
            return;
        }

        // Se não tem legenda, abre o modal de sugestão
        setSharingBanner(banner);
        setShowCaptionPrompt(true);
    };

    const executeShare = async (base64, size, caption = '') => {
        try {
            const res = await fetch(base64);
            const blob = await res.blob();
            const file = new File([blob], `banner-${size}.png`, { type: 'image/png' });

            if (navigator.share) {
                await navigator.share({
                    files: [file],
                    title: 'Meu Banner de Restaurante',
                    text: caption || 'Confira esse banner que gerei no BannerIA! 🍕✨',
                });
            } else {
                alert('Compartilhamento não suportado neste navegador. Tente baixar a imagem.');
            }
        } catch (err) {
            console.error('Erro ao compartilhar:', err);
        }
    };

    const handleGenerateCaption = async (id, prompt) => {
        setGeneratingCaption(id);
        try {
            const response = await fetch('/api/caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            const data = await response.json();
            if (data.caption) {
                // Salvar no Banco de Dados
                const { error: updateError } = await supabase
                    .from('banners')
                    .update({ caption: data.caption })
                    .eq('id', id);

                if (updateError) throw updateError;

                // Atualizar estado local
                setBanners(prev => prev.map(b => b.id === id ? { ...b, caption: data.caption } : b));

                // Se estiver no fluxo de compartilhamento, atualiza o banner sendo compartilhado
                if (sharingBanner?.id === id) {
                    setSharingBanner({ ...sharingBanner, caption: data.caption });
                }
            } else {
                throw new Error(data.error || 'Erro ao gerar legenda');
            }
        } catch (err) {
            console.error('Erro de legenda:', err);
            alert(`Erro: ${err.message}`);
        } finally {
            setGeneratingCaption(null);
        }
    };

    const handleCopyCaption = (text) => {
        navigator.clipboard.writeText(text);
        // Usando um efeito visual simples em vez de alert
        const btn = document.activeElement;
        const originalText = btn.innerText;
        btn.innerText = 'Copiado! ✅';
        setTimeout(() => {
            if (btn) btn.innerText = originalText;
        }, 2000);
    };

    const handleDeleteCaption = async (id) => {
        try {
            const { error } = await supabase
                .from('banners')
                .update({ caption: null })
                .eq('id', id);

            if (error) throw error;
            setBanners(prev => prev.map(b => b.id === id ? { ...b, caption: null } : b));
            setConfirmDelete({ show: false, type: '', id: null });
        } catch (err) {
            console.error('Erro ao excluir legenda:', err);
            alert('Erro ao excluir legenda.');
        }
    };

    const handleUpdateCaption = async (id, newText) => {
        try {
            const { error } = await supabase
                .from('banners')
                .update({ caption: newText })
                .eq('id', id);

            if (error) throw error;
            setBanners(prev => prev.map(b => b.id === id ? { ...b, caption: newText } : b));
            setEditingCaption({ id: null, text: '' });
        } catch (err) {
            console.error('Erro ao salvar legenda:', err);
            alert('Erro ao salvar sua edição.');
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };


    const handleDelete = async (id) => {
        try {
            const { error } = await supabase
                .from('banners')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setBanners(prev => prev.filter(b => b.id !== id));
            setConfirmDelete({ show: false, type: '', id: null });
        } catch (err) {
            console.error('Erro ao excluir:', err);
            alert('Erro ao excluir banner.');
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
                <div className={styles.container} style={{
                    textAlign: 'center',
                    paddingTop: '100px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '20px'
                }}>
                    <h1 className={styles.heroTitle}>Acesso Restrito</h1>
                    <p className={styles.heroSub} style={{ margin: '0 auto' }}>Você precisa estar logado para ver sua galeria.</p>
                    <Link href="/login" className={styles.primaryBtn} style={{ maxWidth: '200px' }}>
                        Entrar agora
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <main className={styles.main}>
            {previewBanner && (
                <div className={styles.modalOverlay} onClick={() => setPreviewBanner(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
                        <img
                            src={previewBanner.image_url}
                            alt="Preview"
                            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px', objectFit: 'contain' }}
                        />
                        <div className={styles.modalActions} style={{ marginTop: '20px' }}>
                            <button className={styles.primaryBtn} onClick={() => handleDownload(previewBanner.image_url, previewBanner.size, previewBanner.id)}>
                                Baixar Agora
                            </button>
                            <button className={styles.secondaryBtn} onClick={() => setPreviewBanner(null)}>
                                Fechar
                            </button>
                        </div>
                        <button className={styles.closeModal} onClick={() => setPreviewBanner(null)}>×</button>
                    </div>
                </div>
            )}

            {confirmDelete.show && (
                <div className={styles.modalOverlay} onClick={() => setConfirmDelete({ show: false, id: null, type: '' })}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
                        <h2 className={styles.authTitle} style={{ fontSize: '20px', color: 'var(--danger)' }}>Confirmar Exclusão ⚠️</h2>
                        <p className={styles.heroSub} style={{ fontSize: '15px' }}>
                            {confirmDelete.type === 'banner'
                                ? 'Isso apagará o banner e a legenda para sempre. Continuar?'
                                : 'A legenda será apagada, mas a imagem continuará na galeria.'}
                        </p>
                        <div className={styles.modalActions} style={{ marginTop: '20px' }}>
                            <button
                                className={styles.dangerBtn}
                                style={{ flex: 1 }}
                                onClick={() => confirmDelete.type === 'banner' ? handleDelete(confirmDelete.id) : handleDeleteCaption(confirmDelete.id)}
                            >
                                Sim, Excluir
                            </button>
                            <button className={styles.secondaryBtn} style={{ flex: 1 }} onClick={() => setConfirmDelete({ show: false, id: null, type: '' })}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showCaptionPrompt && sharingBanner && (
                <div className={styles.modalOverlay} onClick={() => setShowCaptionPrompt(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 className={styles.authTitle} style={{ fontSize: '24px' }}>Legenda com IA 🤖</h2>

                        {sharingBanner.caption ? (
                            <>
                                <div style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '15px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    whiteSpace: 'pre-wrap',
                                    marginBottom: '20px',
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    textAlign: 'left'
                                }}>
                                    {sharingBanner.caption}
                                </div>
                                <div className={styles.modalActions}>
                                    <button
                                        className={styles.primaryBtn}
                                        onClick={() => {
                                            if (sharingBanner.type === 'download') {
                                                executeDownload(sharingBanner.image_url, sharingBanner.size, sharingBanner.id);
                                            } else {
                                                executeShare(sharingBanner.image_url, sharingBanner.size, sharingBanner.caption);
                                            }
                                            setShowCaptionPrompt(false);
                                        }}
                                    >
                                        {sharingBanner.type === 'download' ? 'Baixar com Legenda' : 'Compartilhar com Legenda'}
                                    </button>
                                    <button
                                        className={styles.selectBtn}
                                        onClick={() => handleCopyCaption(sharingBanner.caption)}
                                    >
                                        📋 Copiar Legenda
                                    </button>
                                    <button
                                        className={styles.secondaryBtn}
                                        onClick={() => handleGenerateCaption(sharingBanner.id, sharingBanner.prompt)}
                                        disabled={generatingCaption === sharingBanner.id}
                                    >
                                        {generatingCaption === sharingBanner.id ? 'Gerando...' : '🔄 Regerar'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className={styles.heroSub} style={{ fontSize: '16px' }}>
                                    Quer criar uma legenda persuasiva com IA para acompanhar sua arte?
                                </p>
                                <div className={styles.modalActions} style={{ marginTop: '30px' }}>
                                    <button
                                        className={styles.primaryBtn}
                                        onClick={() => handleGenerateCaption(sharingBanner.id, sharingBanner.prompt)}
                                        disabled={generatingCaption === sharingBanner.id}
                                    >
                                        {generatingCaption === sharingBanner.id ? <span className={styles.spinner} /> : '✨ Sim, Gerar Agora'}
                                    </button>
                                    <button
                                        className={styles.secondaryBtn}
                                        onClick={() => {
                                            if (sharingBanner.type === 'download') {
                                                executeDownload(sharingBanner.image_url, sharingBanner.size, sharingBanner.id);
                                            } else {
                                                executeShare(sharingBanner.image_url, sharingBanner.size);
                                            }
                                            setShowCaptionPrompt(false);
                                        }}
                                    >
                                        Apenas {sharingBanner.type === 'download' ? 'Baixar' : 'Compartilhar'}
                                    </button>
                                </div>
                            </>
                        )}
                        <button className={styles.closeModal} onClick={() => setShowCaptionPrompt(false)}>×</button>
                    </div>
                </div>
            )}

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
                        <Link href="/" className={styles.loginLink}>Novo Banner</Link>
                        <Link href="/profile" className={styles.loginLink}>Meu Perfil</Link>
                        <button className={styles.loginLink} onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
                    </nav>
                </header>

                <section className={styles.hero} style={{ marginBottom: '40px' }}>
                    <h1 className={styles.heroTitle}>Minha <span className={styles.heroGradient}>Galeria</span></h1>
                    <p className={styles.heroSub}>Todas as suas criações gastronômicas em um só lugar.</p>
                </section>

                <div
                    style={{
                        background: 'rgba(245, 158, 11, 0.05)',
                        border: '1px dashed var(--accent)',
                        borderRadius: '12px',
                        padding: '15px',
                        marginBottom: '30px',
                        textAlign: 'center',
                        fontSize: '14px',
                        color: 'var(--text-secondary)'
                    }}
                >
                    ✨ **Dica**: Se você acabou de gerar um banner, ele aparecerá aqui automaticamente em alguns segundos.
                    <button
                        onClick={() => { setLoading(true); fetchBanners(user.id); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginLeft: '10px', textDecoration: 'underline' }}
                    >
                        Atualizar agora
                    </button>
                </div>

                {error && (
                    <div className={styles.errorMessage} style={{ marginBottom: '30px', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                {banners.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '24px',
                        padding: '60px 0'
                    }}>
                        <p className={styles.heroSub} style={{ margin: '0 auto' }}>Você ainda não gerou nenhum banner.</p>
                        <Link href="/" className={styles.primaryBtn} style={{ maxWidth: '250px' }}>
                            Começar a Criar
                        </Link>
                    </div>
                ) : (
                    <div className={styles.variationsGrid} style={{
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '24px'
                    }}>
                        {banners.map((b) => (
                            <div key={b.id} className={styles.variationCard}>
                                <div
                                    className={styles.variationPreview}
                                    style={{
                                        aspectRatio: SIZES.find(s => s.id === b.size)?.dims.replace('×', '/') || '1/1',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setPreviewBanner(b)}
                                >
                                    <img
                                        src={b.image_url}
                                        alt="Banner Salvo"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                                    />
                                </div>

                                {b.caption && (
                                    <div style={{ position: 'relative', marginTop: '12px' }}>
                                        {editingCaption.id === b.id ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <textarea
                                                    autoFocus
                                                    className={styles.input}
                                                    style={{
                                                        fontSize: '11px',
                                                        height: '100px',
                                                        resize: 'none',
                                                        padding: '10px',
                                                        background: 'rgba(255,255,255,0.06)'
                                                    }}
                                                    value={editingCaption.text}
                                                    onChange={(e) => setEditingCaption({ ...editingCaption, text: e.target.value })}
                                                />
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button
                                                        className={styles.primaryBtn}
                                                        style={{ flex: 1, padding: '5px', fontSize: '10px' }}
                                                        onClick={() => handleUpdateCaption(b.id, editingCaption.text)}
                                                    >
                                                        Salvar
                                                    </button>
                                                    <button
                                                        className={styles.secondaryBtn}
                                                        style={{ flex: 1, padding: '5px', fontSize: '10px' }}
                                                        onClick={() => setEditingCaption({ id: null, text: '' })}
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => setEditingCaption({ id: b.id, text: b.caption })}
                                                style={{
                                                    fontSize: '11px',
                                                    background: 'rgba(255,158,11,0.08)',
                                                    border: '1px solid rgba(255,158,11,0.2)',
                                                    padding: '12px',
                                                    borderRadius: '8px',
                                                    whiteSpace: 'pre-wrap',
                                                    lineHeight: '1.4',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    transition: 'all 0.2s ease',
                                                    minHeight: '40px'
                                                }}
                                                title="Clique para editar a legenda"
                                            >
                                                {b.caption}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '-10px',
                                                    right: '-10px',
                                                    display: 'flex',
                                                    gap: '5px'
                                                }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCopyCaption(b.caption);
                                                        }}
                                                        style={{
                                                            background: 'var(--accent)',
                                                            border: '2px solid var(--bg)',
                                                            borderRadius: '50%',
                                                            width: '28px',
                                                            height: '28px',
                                                            fontSize: '12px',
                                                            color: '#fff',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                                                        }}
                                                        title="Copiar Legenda"
                                                    >
                                                        📋
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmDelete({ show: true, type: 'caption', id: b.id });
                                                        }}
                                                        style={{
                                                            background: '#451a1a', // Tom de vermelho mais escuro/premium para o cesto
                                                            border: '2px solid var(--bg)',
                                                            borderRadius: '12px', // Mais quadradinho como no anexo
                                                            width: '28px',
                                                            height: '28px',
                                                            fontSize: '14px',
                                                            color: '#ff4d4d',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseOver={(e) => e.currentTarget.style.background = '#632525'}
                                                        onMouseOut={(e) => e.currentTarget.style.background = '#451a1a'}
                                                        title="Excluir Legenda"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '12px', opacity: 0.6, fontStyle: 'italic' }}>
                                    Briefing: {b.prompt}
                                </p>
                                <div className={styles.actionGroup} style={{ marginTop: '12px' }}>
                                    <button
                                        className={styles.selectBtn}
                                        style={{ flex: 1, padding: '10px' }}
                                        onClick={() => handleDownload(b)}
                                    >
                                        Baixar
                                    </button>
                                    <button
                                        className={styles.shareBtn}
                                        style={{ flex: 1, padding: '10px' }}
                                        onClick={() => handleShare(b)}
                                    >
                                        Compartilhar
                                    </button>
                                    <button
                                        className={styles.dangerBtn}
                                        style={{ padding: '10px', fontSize: '14px', minWidth: '45px' }}
                                        onClick={() => setConfirmDelete({ show: true, type: 'banner', id: b.id })}
                                        title="Excluir Banner"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
