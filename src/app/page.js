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
  'Smartphone Galaxy Pro 256GB. Oferta: R$ 1.899,00. Design clean tech, fundo escuro, destaque na câmera. WhatsApp (11) 99999-9999',
  'Promoção: Hamburguer Duplo + Batata por R$ 39,90. Texto "OFERTA DO DIA". WhatsApp (11) 99999-9999',
  'Salão de Beleza: Tintura + Hidratação por R$ 120,00. Estilo elegante, tons rose gold. Reserve pelo Instagram!',
  'Academia FitZone: Matrícula grátis em Fevereiro! Mensalidade R$ 89,90. Energia máxima, tipografia bold.',
  'Lançamento: Tênis Runner X2 — Conforto e Performance. R$ 299,00. Estilo esportivo, fundo branco clean.',
  'Clínica Odonto Sorrir: Clareamento Dental R$ 350,00. Design profissional, azul e branco, transmite confiança.',
  'Apartamento 2 quartos, 68m², Varanda. R$ 480.000. Foto do imóvel, tons sóbrios, chamada: "AGENDE SUA VISITA"',
  'Buffet Infantil: Pacote Completo para 50 crianças — R$ 2.500. Cores vibrantes, alegre, telefone de contato.',
  'Curso Online de Marketing Digital: 40h + Certificado por R$ 197,00. Design moderno, cores vibrantes.',
  'Oficina AutoCenter: Revisão Completa R$ 189,90. Foto do carro, design sério e confiável. Tel: (11) 3333-4444',
];

const UX_PHRASES = [
  'Analisando o seu negócio...',
  'Detectando o segmento ideal...',
  'Definindo paleta de cores...',
  'Aplicando design profissional...',
  'Gerando imagem em 4K...',
  'Ajustando tipografia premium...',
  'Finalizando detalhes visuais...',
  'Harmonizando elementos do banner...',
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
    generationsCount: 0,
    isAdmin: false
  });
  const [showPreGenModal, setShowPreGenModal] = useState(false);
  const [showPostGenModal, setShowPostGenModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [guestMode, setGuestMode] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const resultsRef = useRef(null);
  const recognitionRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');
  const isManualStopRef = useRef(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

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
              saveBannerForUser(currentUser.id, data.variations[0].url, data.selectedSize || 'square', data.prompt || '');
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

    // Listen for auth changes (e.g. redirect back after signup)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);

        // If signup/login happened and there's a pending banner, save it now
        const pending = localStorage.getItem('banneria_pending_session');
        if (pending) {
          try {
            const data = JSON.parse(pending);
            setVariations(data.variations || []);
            setPrompt(data.prompt || '');
            setSelectedSize(data.selectedSize || 'square');
            setImages(data.images || []);
            if (data.variations && data.variations.length > 0) {
              saveBannerForUser(currentUser.id, data.variations[0].url, data.selectedSize || 'square', data.prompt || '');
            }
            localStorage.removeItem('banneria_pending_session');
            setGuestMode(true);
          } catch (e) {
            console.error('Falha ao restaurar banner pendente no auth change:', e);
          }
        }
      }
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

  // Restore UX warning: prevent accidental page leave during generation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (loading) {
        e.preventDefault();
        e.returnValue = 'Sua arte ainda está sendo gerada! Se você sair agora, poderá perder o progresso.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [loading]);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_name, logo_url, subscription_tier, generations_count')
        .eq('id', userId)
        .single();

      if (data) {
        const currentUser = (await supabase.auth.getSession()).data.session?.user;
        const isAdmin = currentUser?.email === 'gideongsr94@gmail.com';

        setUserData({
          companyName: data.company_name || '',
          logoUrl: data.logo_url || '',
          subscriptionTier: isAdmin ? 'unlimited_annual' : (data.subscription_tier || 'free'),
          generationsCount: data.generations_count || 0,
          isAdmin: isAdmin
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

    // Client-side fast-path: block limited users who already hit their cap
    // ADMIN BYPASS: Allow everything for the admin email
    const tierLimits = { free: 5, starter: 20, premium: 20 };
    const localLimit = tierLimits[userData.subscriptionTier];
    if (user && !userData.isAdmin && localLimit !== undefined && userData.generationsCount >= localLimit) {
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
      const sessionId = (() => {
        if (typeof sessionStorage !== 'undefined') {
          let id = sessionStorage.getItem('banneria_session_id');
          if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('banneria_session_id', id); }
          return id;
        }
        return '';
      })();

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size: generationSize,
          images,
          logoUrl: userData.logoUrl,
          companyName: userData.companyName,
          userId: user?.id,
          sessionId: user ? '' : sessionId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Handle server-side enforced limit (catches starter plan hitting 20, etc.)
        if (data.error === 'LIMIT_REACHED') {
          setShowLimitModal(true);
          setLoading(false);
          setProgress(0);
          return;
        }
        throw new Error(data.error || 'Falha na geração');
      }

      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.error('Failed to parse server response:', parseErr);
        throw new Error('O servidor demorou muito para responder ou encontrou um problema técnico. Por favor, tente novamente em alguns segundos.');
      }

      if (data.image) {
        const result = { url: data.image, size: generationSize };
        setVariations([result]);
        setProgress(100);

        // AUTO-SAVE: Se estiver logado, o servidor já salvou o banner via Supabase Admin API.
        // O cliente apenas atualiza a contagem local (perfil).
        if (user) {
          setTimeout(() => fetchProfile(user.id), 2000);
        }
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        throw new Error('O modelo não retornou uma imagem válida.');
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

  // saveBannerForUser accepts userId explicitly to avoid stale state closure issues
  const saveBannerForUser = async (userId, url, size, promptText) => {
    if (!userId) {
      setError('Sua arte foi gerada, mas você precisa estar logado para salvá-la.');
      return;
    }
    setError(null);
    try {
      const { error: saveError } = await supabase.from('banners').insert([{
        user_id: userId,
        image_url: url,
        prompt: promptText,
        size: size,
      }]);
      if (saveError) throw saveError;
      console.log('✅ Banner salvo com sucesso.');
      setTimeout(() => fetchProfile(userId), 1500);
    } catch (e) {
      console.error('Erro ao salvar banner:', e);
      setError('Sua arte foi gerada, mas houve um erro ao salvá-la na galeria: ' + e.message);
    }
  };

  // saveBanner uses current user state (for logged-in flows)
  const saveBanner = async (url, size, promptText) => {
    setError(null);
    try {
      // O contador (generations_count) agora é incrementado automaticamente 
      // via Trigger no Banco de Dados quando um novo banner é inserido.
      const { error: saveError } = await supabase.from('banners').insert([{
        user_id: user.id,
        image_url: url,
        prompt: promptText,
        size: size,
      }]);
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
    link.download = `banner-${size}-${index + 1}.png`;
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
    setShowMediaPicker(false);
  };

  const handleUploadClick = () => {
    if (isMobile) {
      setShowMediaPicker(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const startVoice = (e) => {
    if (e && e.cancelable) e.preventDefault();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Seu navegador não suporta gravação de voz. Use Chrome ou Edge.');
      return;
    }

    setVoiceError('');
    setVoiceTranscript('');
    accumulatedTranscriptRef.current = '';
    isManualStopRef.current = false;

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
    };

    recognition.onresult = (event) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      accumulatedTranscriptRef.current = fullTranscript;
    };

    recognition.onerror = (e) => {
      if (e.error === 'aborted') return;
      // If it's a 'no-speech' error, we don't want to show it as a red error block 
      // if we are going to auto-restart anyway.
      if (e.error === 'no-speech') return;

      const msgs = {
        'not-allowed': 'Permissão de microfone negada.',
        'network': 'Erro de rede.',
      };
      setVoiceError(msgs[e.error] || `Erro: ${e.error}`);
      setIsListening(false);
      setVoiceTranscript('');
    };

    recognition.onend = () => {
      // COMMIT current chunk
      const finalText = accumulatedTranscriptRef.current;
      if (finalText && finalText.trim()) {
        setPrompt(prev => {
          const sep = prev.trim() ? ' ' : '';
          return prev + sep + finalText.trim();
        });
      }

      // Clear current chunk ref after commit
      accumulatedTranscriptRef.current = '';

      // AUTO-RESTART logic:
      // If it wasn't a manual stop (clicked by user), restart immediately
      if (!isManualStopRef.current) {
        console.log('[Voice] Auto-restarting session...');
        try {
          recognition.start();
        } catch (err) {
          // If start fails (e.g. already starting), we try again in startVoice
          console.error('[Voice] Failed to auto-restart:', err);
          setIsListening(false);
        }
      } else {
        setIsListening(false);
        setVoiceTranscript('');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleVoice = (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (isListening) {
      stopVoice(e);
    } else {
      startVoice(e);
    }
  };

  const stopVoice = (e) => {
    if (e && e.cancelable) e.preventDefault();
    isManualStopRef.current = true; // Mark as manual to prevent auto-restart
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
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
            Banners para
            <span className={styles.heroGradient}> o seu negócio</span>
          </h1>

        </section>

        <div className={styles.card}>
          <div style={{ position: 'relative' }}>
            <textarea
              className={styles.textarea}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Descreva seu produto, serviço ou promoção"
              rows={3}
            />
            <button
              className={styles.magicSuggestBtn}
              onClick={() => setPrompt(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)])}
              title="Sugerir uma ideia"
            >
              ✨
            </button>

            {/* WhatsApp Style Mic Button */}
            {(userData.subscriptionTier === 'free' && !userData.isAdmin) ? (
              // Locked for free users (Admin bypasses)
              <button
                type="button"
                className={styles.voiceBtn}
                onClick={() => {
                  setShowVoiceModal(true);
                }}
                title="Comando por Voz (PRO). Clique para ver planos."
                style={{ opacity: 0.7, cursor: 'pointer' }}
              >
                <div style={{ position: 'relative' }}>
                  <span className={styles.micIcon}>🎤</span>
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    fontSize: '8px',
                    background: 'var(--accent-light)',
                    color: 'white',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    fontWeight: '800'
                  }}>PRO</span>
                </div>
              </button>
            ) : (
              // Unlocked for paid users
              <button
                type="button"
                className={`${styles.voiceBtn} ${isListening ? styles.voiceBtnActive : ''}`}
                onClick={toggleVoice}
                onContextMenu={(e) => e.preventDefault()}
                title={isListening ? 'Clique para parar' : 'Clique para falar (Comando por Voz)'}
              >
                <span className={styles.micIcon}>🎤</span>
              </button>
            )}

            {/* Recording Feedback Overlay */}
            {isListening && (
              <div
                className={styles.recordingOverlay}
                onClick={toggleVoice}
                title="Clique em qualquer lugar para parar"
              >
                <div className={styles.recordingPulse} />
                <span className={styles.recordingText}>
                  Gravando áudio... Clique para parar
                </span>
              </div>
            )}
          </div>

          {voiceError && (
            <div className={styles.errorMessage} style={{ marginTop: '8px', marginBottom: 0, padding: '8px' }}>
              {voiceError}
            </div>
          )}

          <div className={styles.uploadSection}>
            <div className={styles.sizeLabel}>Fotos do Produto ou Serviço (Opcional)</div>
            <div className={styles.imageGrid}>
              {images.map((img, idx) => (
                <div key={idx} className={styles.imagePreview}>
                  <img src={img} alt="Preview" />
                  <button className={styles.removeImg} onClick={() => removeImage(idx)}>×</button>
                </div>
              ))}
              <button className={styles.uploadBtn} onClick={handleUploadClick}>
                <span>+</span>
              </button>
            </div>
            {/* Gallery input (desktop + gallery on mobile) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              multiple
              accept="image/*"
              style={{ display: 'none' }}
            />
            {/* Camera input (mobile camera) */}
            <input
              type="file"
              ref={cameraInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
            />
          </div>

          {/* Mobile Media Picker Bottom Sheet */}
          {showMediaPicker && (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
              onClick={() => setShowMediaPicker(false)}
            >
              <div
                style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '10px' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px', textAlign: 'center' }}>Adicionar Foto</div>
                <button
                  onClick={() => { setShowMediaPicker(false); cameraInputRef.current?.click(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(249,115,22,0.08)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '15px', fontWeight: 600 }}
                >
                  <span style={{ fontSize: '22px' }}>📷</span> Tirar Foto (Câmera)
                </button>
                <button
                  onClick={() => { setShowMediaPicker(false); fileInputRef.current?.click(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '15px', fontWeight: 600 }}
                >
                  <span style={{ fontSize: '22px' }}>🖼️</span> Escolher da Galeria
                </button>
                <button
                  onClick={() => setShowMediaPicker(false)}
                  style={{ marginTop: '4px', padding: '12px', borderRadius: '12px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
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

        {variations.length > 0 && (
          <div className={styles.variations} ref={resultsRef}>
            <h2 className={styles.sectionTitle}>Banner Gerado</h2>
            <div className={styles.variationsGrid} style={{ maxWidth: '600px', margin: '0 auto' }}>
              {variations.map((v, i) => (
                <div key={i} className={styles.variationCard}>
                  <div className={styles.variationPreview} style={{
                    aspectRatio: SIZES.find(s => s.id === v.size).dims.replace('×', '/'),
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    <img
                      src={v.url}
                      alt={`Banner ${i + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '12px',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                        pointerEvents: 'none',
                      }}
                      draggable={false}
                      onContextMenu={e => e.preventDefault()}
                      onDragStart={e => e.preventDefault()}
                    />
                    {/* Invisible overlay to block right-click and long-press on mobile */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 1,
                        WebkitTouchCallout: 'none',
                        userSelect: 'none',
                        cursor: 'default',
                      }}
                      onContextMenu={e => e.preventDefault()}
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

      {
        showLimitModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: '420px', textAlign: 'center' }}>
              <span style={{ fontSize: '40px' }}>🚀</span>
              <h2 className={styles.modalTitle} style={{ marginTop: '10px' }}>Limite Atingido!</h2>
              <p className={styles.modalSub} style={{ margin: '15px 0' }}>
                Você usou todas as {userData.subscriptionTier === 'starter' ? '20' : '5'} artes do seu plano
                <strong> {userData.subscriptionTier === 'starter' ? 'Starter' : 'Gratuito'}</strong>.
                Faça upgrade para continuar criando!
              </p>
              <div style={{ textAlign: 'left', marginBottom: '20px', fontSize: '14px', background: 'rgba(139, 92, 246, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <p style={{ marginBottom: '10px', fontWeight: '600' }}>No plano Ilimitado você tem:</p>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>♾️ Criações ilimitadas todos os meses</li>
                  <li>🎤 Criação por comando de voz</li>
                  <li>✨ Escritor de Legendas com IA</li>
                  <li>⭐ Suporte prioritário no WhatsApp</li>
                </ul>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Link href="/profile" className={styles.primaryBtn}>
                  Ver Planos e Fazer Upgrade
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
        )
      }
      {
        showVoiceModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: '420px', textAlign: 'center' }}>
              <span style={{ fontSize: '40px' }}>🎤</span>
              <h2 className={styles.modalTitle} style={{ marginTop: '10px' }}>Comando por Voz</h2>
              <p className={styles.modalSub} style={{ margin: '15px 0' }}>
                A criação de artes por voz é uma função <strong>exclusiva</strong> para assinantes.
                Economize tempo e crie artes incríveis apenas falando!
              </p>
              <div style={{ textAlign: 'left', marginBottom: '20px', fontSize: '14px', background: 'rgba(139, 92, 246, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <p style={{ marginBottom: '10px', fontWeight: '600' }}>Liberte seu potencial com o Starter:</p>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>🎤 Comando por Voz ilimitado</li>
                  <li>🖼️ 20 artes profissionais por mês</li>
                  <li>✨ Escritor de Legendas com IA</li>
                  <li>🚀 Suporte priorizado</li>
                </ul>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Link href="/profile" className={styles.primaryBtn}>
                  Ver Planos e Upgrade
                </Link>
                <button
                  className={styles.secondaryBtn}
                  onClick={() => setShowVoiceModal(false)}
                  style={{ background: 'transparent', border: 'none' }}
                >
                  Talvez mais tarde
                </button>
              </div>
            </div>
          </div>
        )
      }
    </main >
  );
}
