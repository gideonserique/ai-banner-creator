'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../page.module.css';

// Translation Map for Supabase Errors
const ERROR_MAP = {
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
    'Invalid email': 'E-mail inválido.',
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Password is too short': 'A senha é muito curta.',
};

const translateError = (msg) => {
    return ERROR_MAP[msg] || msg || 'Ocorreu um erro inesperado. Tente novamente.';
};

export default function SignupPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileInputRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        fullName: '',
        companyName: '',
        whatsapp: '',
        email: '',
        password: '',
        confirmPassword: '',
        logoUrl: '',
    });

    // Capture Marketing Coupon/Plan
    useEffect(() => {
        const coupon = searchParams.get('coupon');
        const plan = searchParams.get('plan');
        if (coupon || plan) {
            localStorage.setItem('pendingPromo', JSON.stringify({ coupon, plan }));
            console.log('🎟️ Promo capturada:', { coupon, plan });
        }
    }, [searchParams]);

    const formatWhatsApp = (value) => {
        // Se começar com +, permite formato livre internacional
        if (value.startsWith('+')) {
            return value.replace(/[^\d+]/g, '').slice(0, 20);
        }

        const numbers = value.replace(/\D/g, '');
        // Formato brasileiro apenas se tiver até 11 dígitos e não começar com +
        if (numbers.length <= 11) {
            let formatted = numbers;
            if (numbers.length > 0) formatted = `(${numbers.slice(0, 2)}`;
            if (numbers.length > 2) formatted += `) ${numbers.slice(2, 7)}`;
            if (numbers.length > 7) formatted += `-${numbers.slice(7, 11)}`;
            return formatted;
        }
        // Se for maior que 11, trata como formato livre (pode ser internacional sem +)
        return numbers.slice(0, 20);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'whatsapp') {
            setFormData(prev => ({ ...prev, [name]: formatWhatsApp(value) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const resizeImage = (base64Str, maxWidth = 400) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
        });
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const resized = await resizeImage(reader.result);
            setFormData(prev => ({ ...prev, logoUrl: resized }));
        };
        reader.readAsDataURL(file);
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não coincidem.');
            setLoading(false);
            return;
        }

        try {
            // 1. Sign up the user with metadata (trigger will use this)
            const { data: { user }, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName,
                    }
                }
            });

            if (authError) throw authError;

            if (user) {
                // 2. Upsert extra profile data (using upsert to avoid duplicate key error with trigger)
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: user.id,
                        full_name: formData.fullName,
                        company_name: formData.companyName,
                        whatsapp: formData.whatsapp,
                        logo_url: formData.logoUrl,
                        updated_at: new Date().toISOString(),
                    });

                if (profileError) throw profileError;

                router.push('/');
                router.refresh();
            }
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
                <h1 className={styles.authTitle}>Criar Conta Gourmet</h1>
                <p className={styles.authSub}>Fique profissional com artes exclusivas e salvamento automático.</p>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <form className={styles.form} onSubmit={handleSignup}>
                    <div className={styles.inputGroup}>
                        <label>Nome Completo</label>
                        <input
                            type="text"
                            name="fullName"
                            placeholder="Seu nome"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('Por favor, preencha este campo.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.fullName}
                            onChange={handleChange}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Nome da Empresa</label>
                        <input
                            type="text"
                            name="companyName"
                            placeholder="Ex: Pizzaria do Zé"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('Por favor, preencha o nome da sua empresa.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.companyName}
                            onChange={handleChange}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Logotipo da Empresa (Opcional)</label>
                        <div className={styles.logoPreviewWrapper}>
                            {formData.logoUrl && (
                                <img src={formData.logoUrl} className={styles.logoThumbnail} alt="Preview" />
                            )}
                            <button
                                type="button"
                                className={styles.uploadBtnSmall}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                🖼️ {formData.logoUrl ? 'Mudar Logo' : 'Enviar Logo'}
                            </button>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            hidden
                            onChange={handleLogoUpload}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>WhatsApp</label>
                        <input
                            type="text"
                            name="whatsapp"
                            placeholder="+55 00 00000-0000"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('O WhatsApp é importante para suas artes.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.whatsapp}
                            onChange={handleChange}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>E-mail</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="seu@email.com"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('E-mail necessário.')}
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
                            placeholder="No mínimo 6 caracteres"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('Escolha uma senha segura.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.password}
                            onChange={handleChange}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Repetir Senha</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            placeholder="Confirme sua senha"
                            required
                            onInvalid={(e) => e.target.setCustomValidity('Confirme sua senha.')}
                            onInput={(e) => e.target.setCustomValidity('')}
                            className={styles.input}
                            value={formData.confirmPassword}
                            onChange={handleChange}
                        />
                    </div>

                    <button type="submit" className={styles.generateBtn} disabled={loading}>
                        {loading ? <span className={styles.spinner} /> : 'Criar Minha Conta'}
                    </button>
                </form>

                <p className={styles.authFooter}>
                    Já tem uma conta? <Link href="/login">Entrar agora</Link>
                </p>
            </div>
        </div>
    );
}
