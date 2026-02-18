'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

// Translation Map for Supabase Errors
const ERROR_MAP = {
    'Invalid login credentials': 'E-mail ou senha incorretos. Verifique e tente novamente.',
    'Invalid email': 'Por favor, insira um e-mail válido.',
    'Email not confirmed': 'Por favor, confirme seu e-mail para entrar.',
};

const translateError = (msg) => {
    return ERROR_MAP[msg] || msg || 'Ocorreu um erro ao entrar. Tente novamente.';
};

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: formData.email,
                password: formData.password,
            });

            if (error) throw error;

            router.push('/');
            router.refresh();
        } catch (err) {
            setError(translateError(err.message));
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
                <h1 className={styles.authTitle}>Bem-vindo de volta!</h1>
                <p className={styles.authSub}>Entre para gerenciar seus banners gastronômicos.</p>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <form className={styles.form} onSubmit={handleLogin}>
                    <div className={styles.inputGroup}>
                        <label>E-mail</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="seu@email.com"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('Por favor, insira seu e-mail.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.email}
                            onChange={handleChange}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Senha</label>
                        <input
                            type="password"
                            name="password"
                            placeholder="Sua senha"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('Por favor, insira sua senha.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.password}
                            onChange={handleChange}
                        />
                        <Link href="/forgot-password" className={styles.forgotLink}>
                            Esqueci minha senha
                        </Link>
                    </div>

                    <button type="submit" className={styles.generateBtn} disabled={loading}>
                        {loading ? <span className={styles.spinner} /> : 'Entrar no BannerIA'}
                    </button>
                </form>

                <p className={styles.authFooter}>
                    Ainda não tem conta? <Link href="/signup">Criar agora</Link>
                </p>
            </div>
        </div>
    );
}
