import Script from 'next/script';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import PageViewTracker from '@/components/PageViewTracker';

export const metadata = {
  title: 'BannerIA - Banners Profissionais para Qualquer Negócio',
  description: 'Crie banners profissionais para qualquer tipo de negócio em segundos. Inteligência Artificial que adapta o design para seu segmento: loja, restaurante, salão, clínica, academia e muito mais.',
  keywords: 'banner, design, redes sociais, instagram, whatsapp, promoção, loja, produto, serviço, IA, inteligência artificial',
  openGraph: {
    title: 'BannerIA - Design Profissional para Qualquer Negócio',
    description: 'Transforme seu produto ou serviço em banners de alto impacto com IA.',
    siteName: 'BannerIA',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;700;900&family=Space+Grotesk:wght@300;400;500;600;700&family=Bebas+Neue&family=Montserrat:wght@400;700;900&family=Raleway:wght@400;700;900&family=Poppins:wght@300;400;600;700;900&display=swap"
          rel="stylesheet"
        />
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "vjlaeypp4b");
          `}
        </Script>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '2941143189410493');
            fbq('track', 'PageView');
          `}
        </Script>
      </head>
      <body>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=2941143189410493&ev=PageView&noscript=1"
          />
        </noscript>
        <PageViewTracker />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
