'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import styles from '../page.module.css';

const ADMIN_EMAIL = 'gideongsr94@gmail.com';

function MiniBar({ value, max, color = '#f97316' }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '22px', textAlign: 'right' }}>{value}</span>
        </div>
    );
}

function BarChart({ data, dataKey, color = '#f97316', label }) {
    const max = Math.max(...data.map(d => d[dataKey]), 1);
    return (
        <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px' }}>
                {data.map((d, i) => {
                    const h = max > 0 ? (d[dataKey] / max) * 60 : 2;
                    return (
                        <div
                            key={i}
                            title={`${d.label}: ${d[dataKey]}`}
                            style={{
                                flex: 1,
                                height: `${Math.max(h, 2)}px`,
                                background: d[dataKey] > 0 ? color : 'rgba(255,255,255,0.05)',
                                borderRadius: '3px 3px 0 0',
                                transition: 'height 0.4s ease',
                                cursor: 'default',
                            }}
                        />
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>{data[0]?.label}</span>
                <span>{data[data.length - 1]?.label}</span>
            </div>
        </div>
    );
}

function KPICard({ icon, label, value, sub, color = 'var(--accent)', highlight }) {
    return (
        <div style={{
            background: 'var(--bg-card)',
            border: `1px solid ${highlight ? color : 'var(--border)'}`,
            borderRadius: '16px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: highlight ? `0 0 20px ${color}33` : 'none',
        }}>
            <div style={{ fontSize: '20px' }}>{icon}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: highlight ? color : 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
            {sub && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{sub}</div>}
        </div>
    );
}

const TABS = [
    { id: 'overview', label: '📊 Visão Geral' },
    { id: 'traffic', label: '🌐 Tráfego' },
    { id: 'users', label: '👥 Usuários' },
    { id: 'activity', label: '🎨 Atividade' },
    { id: 'anon', label: '👻 Anónimos' },
];

export default function AdminDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
    const [deleting, setDeleting] = useState(false);
    const [deleteMsg, setDeleteMsg] = useState('');

    useEffect(() => { checkAndFetch(); }, []);

    async function checkAndFetch() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || session.user.email !== ADMIN_EMAIL) {
            router.push('/');
            return;
        }
        setAuthorized(true);
        try {
            const res = await fetch('/api/admin/stats', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setData(json);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteUser() {
        if (!deleteConfirm) return;
        setDeleting(true);
        setDeleteMsg('');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/delete-user', {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: deleteConfirm.id }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao excluir');
            // Remove from local state
            setData(prev => ({
                ...prev,
                profiles: prev.profiles.filter(p => p.id !== deleteConfirm.id),
                kpis: { ...prev.kpis, totalUsers: prev.kpis.totalUsers - 1 },
            }));
            setDeleteConfirm(null);
        } catch (e) {
            setDeleteMsg(e.message);
        } finally {
            setDeleting(false);
        }
    }

    if (!authorized || loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className={styles.spinner} style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontFamily: 'monospace' }}>
                ⚠️ {error}
            </div>
        );
    }

    const { kpis, chartData, profiles, recentActivity, sizeDistribution, traffic, anonymousBanners = [] } = data;
    const maxBanners = Math.max(...profiles.map(p => p.banner_count), 1);
    const maxViews = Math.max(...(traffic?.topPages || []).map(p => p.count), 1);

    return (
        <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px', paddingBottom: '40px' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '22px' }}>✦</span>
                            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '20px', background: 'linear-gradient(135deg, #f97316, #fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>BannerIA</span>
                            <span style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px' }}>ADMIN</span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            {new Date().toLocaleString('pt-BR')} • Dados excluem admin
                        </p>
                    </div>
                    <button onClick={() => window.location.reload()} style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '8px 18px', borderRadius: '20px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                        🔄 Atualizar
                    </button>
                </div>

                {/* === TRAFFIC KPIs (topo da página) === */}
                <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.08))', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '18px', padding: '20px 24px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#a78bfa', marginBottom: '16px' }}>🌐 Tráfego Total (todos visitantes, incl. anônimos)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#a78bfa' }}>{kpis.uniqueSessions.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Visitantes únicos</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>total histórico</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#818cf8' }}>{kpis.uniqueVisitorsLast7d.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Únicos (7 dias)</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{kpis.pageViewsLast7d} page views</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)' }}>{kpis.totalPageViews.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Page views</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>total histórico</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#f97316' }}>{kpis.anonymousVisits.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Visitas anônimas</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>sem cadastro</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', fontWeight: 800, color: '#22c55e' }}>{kpis.loggedInVisits.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Visitas logadas</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>cadastrados</div>
                        </div>
                    </div>
                </div>

                {/* User + Business KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    <KPICard icon="👥" label="Cadastros" value={kpis.totalUsers} sub={`+${kpis.newUsersLast7d} esta semana`} highlight />
                    <KPICard icon="💎" label="Premium" value={kpis.totalPremium} sub={`${kpis.totalFree} gratuitos`} color="#22c55e" highlight={kpis.totalPremium > 0} />
                    <KPICard icon="📈" label="Conversão" value={`${kpis.conversionRate}%`} sub="free → premium" color="#fbbf24" highlight />
                    <KPICard icon="🎨" label="Banners" value={kpis.totalBanners} sub={`+${kpis.newBannersLast7d} esta semana`} />
                    <KPICard icon="📋" label="Legendas IA" value={kpis.totalCaptions} sub="captions criadas" color="#a78bfa" />
                    <KPICard
                        icon="🏆"
                        label="MRR (R$)"
                        value={kpis.mrr.toFixed(0)}
                        sub={`Reflete todos os planos pagos`}
                        color="#22c55e"
                        highlight
                    />
                    <KPICard icon="⚡" label="Média/User" value={kpis.avgBannersPerUser} sub="banners por usuário" />
                    <KPICard icon="⚠️" label="Sem geração" value={kpis.usersWithNoBanners} sub="cadastrou e sumiu" color="#ef4444" highlight={kpis.usersWithNoBanners > 0} />
                </div>

                {/* Charts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                        <BarChart data={chartData} dataKey="uniqueVisitors" label="Visitantes únicos (30 dias)" color="#a78bfa" />
                    </div>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                        <BarChart data={chartData} dataKey="pageViews" label="Page views (30 dias)" color="#818cf8" />
                    </div>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                        <BarChart data={chartData} dataKey="newUsers" label="Novos cadastros (30 dias)" color="#f97316" />
                    </div>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                        <BarChart data={chartData} dataKey="newBanners" label="Banners gerados (30 dias)" color="#fbbf24" />
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                            padding: '8px 18px', borderRadius: '20px',
                            border: `1px solid ${activeTab === t.id ? 'var(--accent)' : 'var(--border)'}`,
                            background: activeTab === t.id ? 'rgba(249,115,22,0.1)' : 'transparent',
                            color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                            cursor: 'pointer', fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab: Overview */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' }}>🏆 Top Usuários (por banners)</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {profiles.slice(0, 8).map((p, i) => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '16px' }}>{i + 1}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.company_name || p.full_name || 'Usuário'}</div>
                                            <MiniBar value={p.generations_count || 0} max={maxBanners} />
                                        </div>
                                        <span style={{ fontSize: '11px', color: ['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(p.subscription_tier) ? '#22c55e' : 'var(--text-secondary)', fontWeight: 700 }}>
                                            {['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(p.subscription_tier) ? '💎' : '🆓'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', padding: '24px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px', color: '#ef4444' }}>⚠️ Cadastraram mas não geraram</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>{kpis.usersWithNoBanners} usuários — potencial de reativação</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                                {profiles.filter(p => !p.generations_count || p.generations_count === 0).map(p => (
                                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(239,68,68,0.05)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{p.company_name || p.full_name || 'Usuário'}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-BR') : ''}</div>
                                        </div>
                                        {p.whatsapp && (
                                            <a href={`https://wa.me/55${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#22c55e', textDecoration: 'none', fontWeight: 600, background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: '10px' }}>
                                                📱 WhatsApp
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Traffic */}
                {activeTab === 'traffic' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* Pages */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' }}>📄 Páginas mais acessadas</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {(traffic?.topPages || []).map((p, i) => (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.path || '/'}</span>
                                        </div>
                                        <MiniBar value={p.count} max={maxViews} color="#a78bfa" />
                                    </div>
                                ))}
                                {!traffic?.topPages?.length && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum dado ainda. Dados aparecerão após deploy.</p>}
                            </div>
                        </div>

                        {/* Devices + Referrers */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                                <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>📱 Dispositivos</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {[
                                        { key: 'mobile', label: '📱 Mobile', color: '#f97316' },
                                        { key: 'desktop', label: '🖥️ Desktop', color: '#818cf8' },
                                        { key: 'tablet', label: '📋 Tablet', color: '#fbbf24' },
                                    ].map(d => {
                                        const count = traffic?.deviceCount?.[d.key] || 0;
                                        const total = kpis.totalPageViews || 1;
                                        return (
                                            <div key={d.key}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{total > 0 ? `${((count / total) * 100).toFixed(0)}%` : '0%'}</span>
                                                </div>
                                                <MiniBar value={count} max={kpis.totalPageViews || 1} color={d.color} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                                <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '14px' }}>🔗 Origens de tráfego</div>
                                {(traffic?.topReferrers || []).length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {traffic.topReferrers.map((r, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.ref}</span>
                                                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{r.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Acesso direto ou sem referrer registrado ainda.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Users */}
                {activeTab === 'users' && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px' }}>👥 Todos os Usuários ({profiles.length})</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Ordenado por banners</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {['Empresa / Nome', 'Plano', 'Banners', 'WhatsApp', 'Atualizado', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 18px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {profiles.map((p, i) => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                            <td style={{ padding: '10px 18px' }}>
                                                <div style={{ fontWeight: 600 }}>{p.company_name || '—'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{p.full_name || '—'}</div>
                                            </td>
                                            <td style={{ padding: '10px 18px' }}>
                                                {(() => {
                                                    const isPaid = ['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(p.subscription_tier);
                                                    const label = p.subscription_tier === 'starter' ? '💎 Starter' :
                                                        p.subscription_tier === 'unlimited_monthly' ? '💎 Ilimitado Mensal' :
                                                            p.subscription_tier === 'unlimited_annual' ? '💎 Ilimitado Anual' :
                                                                p.subscription_tier === 'premium' ? '💎 Premium' : '🆓 Gratuito';
                                                    return (
                                                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: isPaid ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)', color: isPaid ? '#22c55e' : 'var(--text-secondary)', border: `1px solid ${isPaid ? '#22c55e44' : 'var(--border)'}` }}>
                                                            {label}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td style={{ padding: '10px 18px' }}>
                                                <MiniBar value={p.generations_count || 0} max={maxBanners} />
                                            </td>
                                            <td style={{ padding: '10px 18px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {p.whatsapp ? (
                                                        <>
                                                            <span>{p.whatsapp}</span>
                                                            <a href={`https://wa.me/55${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ fontSize: '14px', color: '#22c55e', textDecoration: 'none', background: 'rgba(34,197,94,0.1)', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }} title="Abrir conversa no WhatsApp">
                                                                📱
                                                            </a>
                                                        </>
                                                    ) : '—'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 18px', color: 'var(--text-secondary)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                {p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-BR') : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <button
                                                    onClick={() => setDeleteConfirm({ id: p.id, name: p.company_name || p.full_name || 'Usuário' })}
                                                    title="Excluir usuário"
                                                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}
                                                    onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,0.18)'; }}
                                                    onMouseLeave={e => { e.target.style.background = 'rgba(239,68,68,0.08)'; }}
                                                >
                                                    🗑️ Excluir
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {deleteConfirm && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '20px', padding: '32px', maxWidth: '380px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                            <div style={{ fontSize: '28px', marginBottom: '12px' }}>🗑️</div>
                            <div style={{ fontWeight: 800, fontSize: '18px', marginBottom: '8px' }}>Excluir usuário?</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                Isso vai remover <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong> permanentemente:
                            </div>
                            <ul style={{ fontSize: '12px', color: '#ef4444', paddingLeft: '18px', marginBottom: '20px', lineHeight: 1.8 }}>
                                <li>Perfil (profiles)</li>
                                <li>Todos os banners gerados</li>
                                <li>Conta de autenticação (auth.users)</li>
                            </ul>
                            {deleteMsg && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px' }}>⚠️ {deleteMsg}</div>}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => { setDeleteConfirm(null); setDeleteMsg(''); }}
                                    disabled={deleting}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={deleting}
                                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px', opacity: deleting ? 0.6 : 1 }}
                                >
                                    {deleting ? 'Excluindo...' : 'Sim, excluir'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Activity */}
                {activeTab === 'activity' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Últimos {recentActivity.length} banners gerados</div>
                        {recentActivity.map((item, i) => (
                            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <img src={item.image_url} alt="" style={{ width: 52, height: 52, borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.user_name}
                                        <span style={{ marginLeft: '8px', padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: ['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(item.subscription_tier) ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)', color: ['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(item.subscription_tier) ? '#22c55e' : 'var(--text-secondary)' }}>
                                            {['starter', 'unlimited_monthly', 'unlimited_annual', 'premium'].includes(item.subscription_tier) ? '💎' : '🆓'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{item.prompt || '—'}</div>
                                    {item.caption && <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '2px' }}>✍️ Legenda gerada</div>}
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{new Date(item.created_at).toLocaleDateString('pt-BR')}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {{ square: '▣', portrait: '▯', landscape: '▬' }[item.size] || item.size}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tab: Anonymous Banners */}
                {activeTab === 'anon' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Banners gerados por visitantes não cadastrados
                            </div>
                            <span style={{ padding: '2px 10px', borderRadius: '20px', background: 'rgba(249,115,22,0.12)', color: 'var(--accent)', fontSize: '12px', fontWeight: 700 }}>
                                {anonymousBanners.length} banners
                            </span>
                        </div>
                        {anonymousBanners.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                                Nenhum banner anônimo ainda.<br />
                                <span style={{ fontSize: '12px', marginTop: '6px', display: 'block' }}>Crie a tabela <code>anonymous_banners</code> no Supabase para ativar.</span>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                                {anonymousBanners.map((item, i) => (
                                    <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                                        <img
                                            src={item.image_url}
                                            alt="Banner anônimo"
                                            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                                            onError={e => { e.target.style.display = 'none'; }}
                                        />
                                        <div style={{ padding: '10px 12px' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                {item.prompt || '—'}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                                                    {{ square: '▣ Post', portrait: '▯ Story', landscape: '▬ YouTube' }[item.size] || item.size}
                                                </span>
                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>
                                                session: {item.session_id?.slice(0, 10)}...
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
