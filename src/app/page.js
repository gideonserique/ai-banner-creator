'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

const SIZES = [
  { id: 'square', label: 'Quadrado', icon: '◻', dims: '1080×1080' },
  { id: 'portrait', label: 'Vertical', icon: '▯', dims: '1080×1920' },
  { id: 'landscape', label: 'Horizontal', icon: '▬', dims: '1280×720' },
];

const EXAMPLES = [
  'Promoção: Hamburguer Duplo + Batata por R$ 39,90. Foto suculenta, iluminação quente, texto "OFERTA DO DIA", WhatsApp (11) 99999-9999',
  'Cardápio: Prato Executivo de Picanha (Arroz, Feijão, Farofa). Preço: R$ 32,00. Estilo rústico e elegante.',
  'Combo de Sushi: Barco Premium 40 peças com Salmão e Atum. Tons de preto e dourado, design sofisticado.',
  'Noite da Pizza: Compre 1 Grande e ganhe 1 brotinho doce. Foto saindo do forno, Endereço: Av. Principal, 500.',
  'Happy Hour: Balde com 5 Cervejas + Porção de Batata. Foto de bar animado, texto "VEM RELAXAR COM A GENTE!"',
  'Menu de Sobremesas: Brownie com Sorvete e Calda de Chocolate. Estilo clean, luz suave de estúdio.',
  'Café da Manhã: Cappuccino + Pão de Queijo por R$ 12,00. Clima aconchegante, mesa de madeira.',
  'Promoção Delivery: Taxa Grátis até 5km. Foto de prato variado, cores vibrantes para destaque.',
  'Prato do Chef: Risoto de Camarão com Ervas Finas. Foto high-end, iluminação de restaurante de luxo.',
  'Festival de Massas: Rodízio de Massas Artesanais. Preços a partir de R$ 45,00. Chamada: "RESERVE SUA MESA!"',
];

const UX_PHRASES = [
  'Analisando o cardápio...',
  'Temperando as cores e texturas...',
  'Montando o prato visual...',
  'Ajustando iluminação gourmet 4K...',
  'Finalizando detalhes de design...',
  'Aplicando gramática impecável...',
  'Harmonizando elementos visuais...',
];

export default function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState('square');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState([]);
  const [progress, setProgress] = useState(0);
  const [currentPhrase, setCurrentPhrase] = useState(UX_PHRASES[0]);
  const [error, setError] = useState(null);

  // Auth state
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({
    logoUrl: '',
    companyName: '',
    subscriptionTier: 'free',
    generationsCount: 0
  });
  const [showPreGenModal, setShowPreGenModal] = useState(false);
  const [showPostGenModal, setShowPostGenModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [guestMode, setGuestMode] = useState(false);

  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) fetchProfile(currentUser.id);

      // If user just logged in and has pending banner, restore it
      if (currentUser) {
        const pending = localStorage.getItem('banneria_pending_session');
        if (pending) {
          try {
            const data = JSON.parse(pending);
            setVariations(data.variations || []);
            setPrompt(data.prompt || '');
            setSelectedSize(data.selectedSize || 'square');
            setImages(data.images || []);

            // AUTO-SAVE: Se restauramos um banner e o user agora está logado, 
            // salvamos na galeria dele imediatamente se ele veio de um guest flow.
            if (data.variations && data.variations.length > 0) {
              saveBanner(data.variations[0].url, data.selectedSize || 'square', data.prompt || '');
            }

            // Clear from storage after restoration
            localStorage.removeItem('banneria_pending_session');
            setGuestMode(true); // Ensure they can see the results
          } catch (e) {
            console.error('Falha ao restaurar banner pendente:', e);
          }
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) fetchProfile(currentUser.id);
    });

    // REFRESH RESILIENCE: Check if a generation was in progress
    const generatingSince = localStorage.getItem('banneria_generating_timestamp');
    if (generatingSince) {
      const diff = Date.now() - parseInt(generatingSince);
      if (diff < 120000) { // 2 minutos
        setError('Você tinha uma geração em andamento! Ela está sendo processada no servidor e aparecerá na sua Galeria em instantes. 🚀');
      }
      localStorage.removeItem('banneria_generating_timestamp');
    }

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_name, logo_url, subscription_tier, generations_count')
        .eq('id', userId)
        .single();

      if (data) {
        setUserData({
          companyName: data.company_name || '',
          logoUrl: data.logo_url || '',
          subscriptionTier: data.subscription_tier || 'free',
          generationsCount: data.generations_count || 0
        });
      }
    } catch (e) {
      console.error('Erro ao buscar perfil:', e);
    }
  };

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setCurrentPhrase(prev => {
          const idx = UX_PHRASES.indexOf(prev);
          return UX_PHRASES[(idx + 1) % UX_PHRASES.length];
        });
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    // Check limits for free users
    if (user && userData.subscriptionTier === 'free' && userData.generationsCount >= 5) {
      setShowLimitModal(true);
      return;
    }

    // Se guestMode estiver ativo, permitimos gerar mas o modal voltará no download
    setLoading(true);
    if (user) {
      localStorage.setItem('banneria_generating_timestamp', Date.now().toString());
    }
    setVariations([]);
    setProgress(10);
    setError(null);

    const generationSize = selectedSize;

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size: generationSize,
          images,
          logoUrl: userData.logoUrl,
          companyName: userData.companyName,
          userId: user?.id
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Falha na geração');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.image) {
              accumulated.push({ url: parsed.image, size: generationSize });
              setVariations([...accumulated]);
              setProgress(100);
            }
          } catch (e) { }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.image) {
            accumulated.push({ url: parsed.image, size: generationSize });
            setVariations([...accumulated]);
          }
        } catch (e) { }
      }

      if (accumulated.length === 0) {
        throw new Error('O modelo não retornou uma imagem válida. Tente descrever sua ideia novamente.');
      }
      setProgress(100);

      // AUTO-SAVE: Se estiver logado, o servidor já salvou o banner em segundo plano
      // via SUPABASE_SERVICE_ROLE_KEY no endpoint /api/generate.
      // O cliente apenas atualiza a contagem local.
      if (user && accumulated.length > 0) {
        // Aguardamos um pouco para o trigger no banco processar
        setTimeout(() => fetchProfile(user.id), 2000);
      }

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Falha de conexão com o servidor.');
    } finally {
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
        localStorage.removeItem('banneria_generating_timestamp');
      }, 500);
    }
  };

  const saveBanner = async (url, size, promptText) => {
    setError(null);
    try {
      // O contador (generations_count) agora é incrementado automaticamente 
      // via Trigger no Banco de Dados quando um novo banner é inserido.
      const { error: saveError } = await supabase.from('banners').insert([
        {
          user_id: user.id,
          image_url: url,
          prompt: promptText,
          size: size,
        },
      ]);
      if (saveError) throw saveError;

      console.log('✅ Banner salvo com sucesso. O Trigger deve incrementar o contador.');

      // Aguarda um pouco para o trigger processar e atualiza os dados locais
      setTimeout(() => fetchProfile(user.id), 1500);
    } catch (e) {
      console.error('Erro ao salvar banner:', e);
      setError('Sua arte foi gerada, mas houve um erro ao salvá-la na galeria: ' + e.message);
    }
  };

  const handleDownload = (base64, size, index) => {
    if (!user) {
      setShowPostGenModal(true);
      return;
    }
    const link = document.createElement('a');
    link.href = base64;
    link.download = `banner-restaurante-${size}-${index + 1}.png`;
    link.click();
  };

  const handleShare = async (base64, size) => {
    if (!user) {
      setShowPostGenModal(true);
      return;
    }
    try {
      const res = await fetch(base64);
      const blob = await res.blob();
      const file = new File([blob], `banner-${size}.png`, { type: 'image/png' });

      if (navigator.share) {
        await navigator.share({
          files: [file],
          title: 'Meu Banner de Restaurante',
        });
      } else {
        alert('Compartilhamento não suportado neste navegador. Tente baixar a imagem.');
      }
    } catch (err) {
      console.error('Erro ao compartilhar:', err);
    }
  };

  const savePendingAndRedirect = () => {
    localStorage.setItem('banneria_pending_session', JSON.stringify({
      variations,
      prompt,
      selectedSize,
      images
    }));
    window.location.href = '/signup';
  };

  const resetAndLoseBanner = () => {
    localStorage.removeItem('banneria_pending_session');
    window.location.reload();
  };

  const resizeImage = (base64Str, maxWidth = 800) => {
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
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const resized = await resizeImage(reader.result);
        setImages(prev => [...prev, resized]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <main className={styles.main}>
      {/* Modal 1: Aviso de Pré-Geração */}
      {showPreGenModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <span className={styles.modalIcon}>💡</span>
            <h2 className={styles.modalTitle}>Teste Grátis ativado!</h2>
            <p className={styles.modalText}>
              Você pode gerar banners de teste, mas para <strong>baixar e compartilhar</strong>, você precisará de uma conta gratuita.
            </p>
            <div className={styles.modalActions}>
              <Link href="/signup" className={styles.primaryBtn}>
                Criar Conta Grátis
              </Link>
              <button className={styles.secondaryBtn} onClick={() => { setShowPreGenModal(false); setGuestMode(true); handleGenerate(); }}>
                Gerar Mesmo Assim
              </button>
            </div>
            <button className={styles.closeModal} onClick={() => setShowPreGenModal(false)}>×</button>
          </div>
        </div>
      )}

      {/* Modal 2: Decisão de Pós-Geração (Download/Share) */}
      {showPostGenModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <span className={styles.modalIcon}>🔒</span>
            <h2 className={styles.modalTitle}>Sua arte está pronta!</h2>
            <p className={styles.modalText}>
              Não perca este banner! 🏠 <strong>Cadastre-se grátis agora</strong> para salvar esta arte e liberarmos o seu download.
              <span style={{ display: 'block', marginTop: '10px', color: '#f59e0b' }}>Se você sair sem se cadastrar, esta arte será perdida.</span>
            </p>
            <div className={styles.modalActions}>
              <button className={styles.primaryBtn} onClick={savePendingAndRedirect}>
                Cadastrar e Baixar Arte
              </button>
              <button className={styles.dangerBtn} onClick={resetAndLoseBanner}>
                Perder esta Arte
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.bgOrbs}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.orb3} />
      </div>

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logo} onClick={() => window.location.href = '/'} style={{ cursor: 'pointer' }}>
            <span className={styles.logoIcon}>✦</span>
            <span className={styles.logoText}>BannerIA</span>
          </div>

          <nav className={styles.navButtons}>
            {user ? (
              <>
                <Link href="/gallery" className={styles.loginLink}>Minha Galeria</Link>
                <Link href="/profile" className={styles.loginLink}>Meu Perfil</Link>
                <button className={styles.loginLink} onClick={handleLogout}>Sair</button>
              </>
            ) : (
              <>
                <Link href="/login" className={styles.loginLink}>Entrar</Link>
                <Link href="/signup" className={styles.signupBtn}>Criar Conta</Link>
              </>
            )}
          </nav>
        </header>

        <section className={styles.hero}>

          <h1 className={styles.heroTitle}>
            Banners de
            <span className={styles.heroGradient}> gastronomia</span>
          </h1>

        </section>

        <div className={styles.card}>
          <div style={{ position: 'relative' }}>
            <textarea
              className={styles.textarea}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Descreva seu prato ou promoção"
              rows={3}
            />
            <button
              className={styles.magicSuggestBtn}
              onClick={() => setPrompt(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)])}
              title="Sugerir uma ideia"
            >
              ✨
            </button>
          </div>

          <div className={styles.uploadSection}>
            <div className={styles.sizeLabel}>Fotos dos seus Pratos (Opcional)</div>
            <div className={styles.imageGrid}>
              {images.map((img, idx) => (
                <div key={idx} className={styles.imagePreview}>
                  <img src={img} alt="Preview" />
                  <button className={styles.removeImg} onClick={() => removeImage(idx)}>×</button>
                </div>
              ))}
              <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                <span>+</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              multiple
              accept="image/*"
              style={{ display: 'none' }}
            />
          </div>

          <div className={styles.sizeLabel}>Escolha o formato</div>
          <div className={styles.sizes}>
            {SIZES.map(s => (
              <button
                key={s.id}
                className={`${styles.sizeBtn} ${selectedSize === s.id ? styles.sizeBtnActive : ''}`}
                onClick={() => setSelectedSize(s.id)}
              >
                <span className={styles.sizeIcon}>{s.icon}</span>
                <span className={styles.sizeName}>{s.label}</span>
                <span className={styles.sizeDims}>{s.dims}</span>
              </button>
            ))}
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          {loading && (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <p className={styles.uxPhrase}>{currentPhrase}</p>
            </div>
          )}

          <button
            className={styles.generateBtn}
            onClick={() => {
              if (!user && !guestMode) {
                setShowPreGenModal(true);
              } else {
                handleGenerate();
              }
            }}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <>
                <span className={styles.spinner} />
                Gerando Banner...
              </>
            ) : (
              <>
                <span>✦</span>
                Gerar Banner
              </>
            )}
          </button>
        </div>

        {variations.length > 0 && (
          <div className={styles.variations} ref={resultsRef}>
            <h2 className={styles.sectionTitle}>Banner Gerado</h2>
            <div className={styles.variationsGrid} style={{ maxWidth: '600px', margin: '0 auto' }}>
              {variations.map((v, i) => (
                <div key={i} className={styles.variationCard}>
                  <div className={styles.variationPreview} style={{
                    aspectRatio: SIZES.find(s => s.id === v.size).dims.replace('×', '/')
                  }}>
                    <img
                      src={v.url}
                      alt={`Banner ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                    />
                  </div>
                  <div className={styles.actionGroup}>
                    <button className={styles.selectBtn} onClick={() => handleDownload(v.url, v.size, i)}>
                      Baixar Banner
                    </button>
                    <button className={styles.shareBtn} onClick={() => handleShare(v.url, v.size)}>
                      Compartilhar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {showLimitModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <span style={{ fontSize: '40px' }}>💎</span>
            <h2 className={styles.modalTitle} style={{ marginTop: '10px' }}>Limite Atingido!</h2>
            <p className={styles.modalSub} style={{ margin: '15px 0' }}>
              Você atingiu o limite de 5 banners no plano Gratuito, mas sua criatividade não precisa parar aqui!
            </p>
            <div style={{ textAlign: 'left', marginBottom: '20px', fontSize: '14px', background: 'rgba(245, 158, 11, 0.1)', padding: '15px', borderRadius: '12px' }}>
              <p>Migre para o <strong>Premium</strong> e garanta:</p>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '10px' }}>
                <li style={{ marginBottom: '5px' }}>✅ Banners **ILIMITADOS**</li>
                <li style={{ marginBottom: '5px' }}>✅ Suporte VIP no WhatsApp</li>
                <li>✅ Todas as atualizações futuras</li>
              </ul>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link href="/profile" className={styles.primaryBtn}>
                Ver Planos e Upgrade
              </Link>
              <button
                className={styles.secondaryBtn}
                onClick={() => setShowLimitModal(false)}
                style={{ background: 'transparent', border: 'none' }}
              >
                Talvez mais tarde
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
