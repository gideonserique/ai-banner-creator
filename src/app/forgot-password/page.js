'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

export default function ForgotPasswordPage() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [email, setEmail] = useState('');

    const handleReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (error) throw error;

            setMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        } catch (err) {
            setError(err.message || 'Erro ao enviar e-mail. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.authContainer}>
            <div className={styles.bgOrbs}>
                <div className={styles.orb1} />
                <div className={styles.orb2} />
            </div>

            <div className={styles.authCard}>
                <h1 className={styles.authTitle}>Recuperar Senha</h1>
                <p className={styles.authSub}>Insira seu e-mail para receber um link de redefinição.</p>

                {message && <div style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>{message}</div>}
                {error && <div className={styles.errorMessage}>{error}</div>}

                <form className={styles.form} onSubmit={handleReset}>
                    <div className={styles.inputGroup}>
                        <label>E-mail</label>
                        <input
                            type="email"
                            placeholder="seu@email.com"
                            required
                            className={styles.input}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <button type="submit" className={styles.generateBtn} disabled={loading}>
                        {loading ? <span className={styles.spinner} /> : 'Enviar Link de Recuperação'}
                    </button>
                </form>

                <p className={styles.authFooter}>
                    Lembrou a senha? <Link href="/login">Voltar para entrar</Link>
                </p>
            </div>
        </div>
    );
}
