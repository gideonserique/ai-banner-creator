'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../../page.module.css';

export default function SuccessPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <main className={styles.main}>
            <div className={styles.bgOrbs}>
                <div className={styles.orb1} />
                <div className={styles.orb2} />
                <div className={styles.orb3} />
            </div>

            <div className={styles.container} style={{ textAlign: 'center', alignItems: 'center' }}>
                <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '40px',
                    marginBottom: '20px',
                    border: '2px solid rgba(34, 197, 94, 0.2)',
                    animation: 'pulse-success 2s infinite'
                }}>
                    🎉
                </div>

                <h1 style={{
                    fontSize: '48px',
                    fontWeight: '900',
                    background: 'linear-gradient(to right, #fff, #94a3b8)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '10px'
                }}>
                    Assinatura Confirmada!
                </h1>

                <p style={{
                    fontSize: '18px',
                    color: 'var(--text-secondary)',
                    maxWidth: '500px',
                    lineHeight: '1.6',
                    marginBottom: '40px'
                }}>
                    Seja bem-vindo ao próximo nível do design com IA. Seu plano foi ativado e você já pode começar a criar sem limites.
                </p>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '20px',
                    width: '100%',
                    maxWidth: '600px',
                    marginBottom: '40px'
                }}>
                    <div className={styles.card} style={{ padding: '20px', textAlign: 'left' }}>
                        <span style={{ fontSize: '24px' }}>🎤</span>
                        <h3 style={{ margin: '10px 0 5px', fontSize: '16px' }}>Comando por Voz</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Crie artes apenas falando o que você precisa.</p>
                    </div>
                    <div className={styles.card} style={{ padding: '20px', textAlign: 'left' }}>
                        <span style={{ fontSize: '24px' }}>✨</span>
                        <h3 style={{ margin: '10px 0 5px', fontSize: '16px' }}>Legendas com IA</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Textos profissionais prontos para suas redes.</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '15px' }}>
                    <Link href="/" className={styles.primaryBtn} style={{ padding: '15px 40px', fontSize: '16px' }}>
                        Começar a Criar Agora
                    </Link>
                    <Link href="/profile" className={styles.secondaryBtn} style={{ padding: '15px 30px' }}>
                        Ver Minha Conta
                    </Link>
                </div>
            </div>
        </main>
    );
}
