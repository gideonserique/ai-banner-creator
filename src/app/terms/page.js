'use client';

import Link from 'next/link';
import styles from '../page.module.css';

export default function TermsPage() {
    return (
        <main className={styles.main}>
            <div className={styles.bgOrbs}>
                <div className={styles.orb1} />
                <div className={styles.orb2} />
            </div>

            <div className={styles.container} style={{ maxWidth: '800px' }}>
                <header className={styles.header}>
                    <div className={styles.logo} onClick={() => window.location.href = '/'} style={{ cursor: 'pointer' }}>
                        <span className={styles.logoIcon}>✦</span>
                        <span className={styles.logoText}>BannerIA</span>
                    </div>
                </header>

                <section className={styles.hero} style={{ textAlign: 'left', alignItems: 'flex-start', gap: '8px' }}>
                    <h1 className={styles.heroTitle}>Termos e <span className={styles.heroGradient}>Regras</span></h1>
                    <p className={styles.heroSub}>Leia atentamente como funciona o uso do BannerIA.</p>
                </section>

                <div className={styles.card} style={{ gap: '24px', lineHeight: '1.7', color: 'var(--text-secondary)' }}>
                    <div>
                        <h2 className={styles.cardLabel} style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '10px' }}>1. Propósito do App</h2>
                        <p>O BannerIA é uma ferramenta de auxílio criativo que utiliza Inteligência Artificial para gerar banners publicitários para qualquer tipo de negócio: restaurantes, lojas, salões, clínicas, academias, serviços, e muito mais. Nosso objetivo é facilitar a criação de artes profissionais em segundos.</p>
                    </div>

                    <div>
                        <h2 className={styles.cardLabel} style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '10px' }}>2. Propriedade das Artes</h2>
                        <p>As artes geradas através do BannerIA podem ser usadas livremente para fins comerciais pelos usuários cadastrados. No entanto, por se tratar de IA, não garantimos exclusividade absoluta sobre os elementos visuais gerados, uma vez que o modelo pode criar padrões semelhantes para diferentes usuários baseados em prompts parecidos.</p>
                    </div>

                    <div>
                        <h2 className={styles.cardLabel} style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '10px' }}>3. Uso Grátis vs Premium</h2>
                        <p>Visitantes podem testar a ferramenta e previsualizar artes. No entanto, o download e compartilhamento é restrito a usuários cadastrados. Reservamo-nos o direito de implementar limites de geração diária para garantir a estabilidade do serviço para todos.</p>
                    </div>

                    <div>
                        <h2 className={styles.cardLabel} style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '10px' }}>4. Conteúdo Proibido</h2>
                        <p>É estritamente proibido usar a ferramenta para gerar imagens que promovam violência, discurso de ódio, conteúdo ilegal ou nudez. O descumprimento destas regras resultará no banimento imediato da conta sem aviso prévio.</p>
                    </div>

                    <div>
                        <h2 className={styles.cardLabel} style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '10px' }}>5. Responsabilidade</h2>
                        <p>O BannerIA não se responsabiliza por eventuais erros de digitação ou informações incorretas inseridas pelo usuário nos prompts de geração. A revisão final da arte antes da publicação é de inteira responsabilidade do usuário.</p>
                    </div>

                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                        <Link href="/profile" className={styles.primaryBtn} style={{ maxWidth: '200px' }}>
                            Voltar ao Perfil
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
