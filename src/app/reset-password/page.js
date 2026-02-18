'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) throw error;

            alert('Senha atualizada com sucesso! Você já pode entrar.');
            router.push('/login');
        } catch (err) {
            setError(err.message || 'Erro ao atualizar senha. Tente novamente.');
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
                <h1 className={styles.authTitle}>Nova Senha</h1>
                <p className={styles.authSub}>Escolha uma nova senha segura para sua conta.</p>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <form className={styles.form} onSubmit={handleUpdate}>
                    <div className={styles.inputGroup}>
                        <label>Nova Senha</label>
                        <input
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            required
                            className={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Confirmar Nova Senha</label>
                        <input
                            type="password"
                            placeholder="Repita a nova senha"
                            required
                            className={styles.input}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    <button type="submit" className={styles.generateBtn} disabled={loading}>
                        {loading ? <span className={styles.spinner} /> : 'Atualizar Minha Senha'}
                    </button>
                </form>
            </div>
        </div>
    );
}
