import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../lib/api';
import { insideTelegram, webApp } from '../lib/tg';
import type { PublicCertificate } from '../types';
import { CertificateCanvas } from '../components/CertificateCanvas';
import { ErrorBox, Spinner } from '../components/ui';

// Certificate page. Opens either as /cert.html?q=<quizId>&u=<userId> or inside Telegram
// as a Mini App link (startapp=cert_<quizId>_<userId>).
export function CertView({ q, u }: { q: string; u: string }) {
  const [cert, setCert] = useState<PublicCertificate | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.certificate(q, u).then(setCert).catch(e => setError(e.message));
  }, [q, u]);

  const inTg = insideTelegram();
  // Downloads are unreliable inside Telegram's built-in browser, so open the normal page there.
  const openExternal = () => webApp()?.openLink?.(`${location.origin}/cert.html?q=${encodeURIComponent(q)}&u=${encodeURIComponent(u)}`);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
      {error && <ErrorBox message={error} />}
      {!cert && !error && <Spinner label="Sertifikat yuklanmoqda..." />}
      {cert && (
        <>
          <h1 className="text-lg font-extrabold text-white text-center">🎓 {cert.recipientName}, tabriklaymiz!</h1>
          <CertificateCanvas
            templateId={cert.templateId}
            recipientName={cert.recipientName}
            rank={cert.rank}
            score={cert.score}
            totalQuestions={cert.totalQuestions}
            groupTitle={cert.groupTitle}
            date={cert.date}
            signatoryTitle={cert.signatoryTitle}
            signatoryName={cert.signatoryName}
            certId={cert.certId}
            showDownloadBtn={!inTg}
          />
          {inTg && (
            <button onClick={openExternal} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-sm shadow-lg cursor-pointer">
              <Download className="w-4 h-4" /> Brauzerda ochib, yuklab olish
            </button>
          )}
          <p className="text-[11px] text-slate-500">Sertifikat ID: {cert.certId}</p>
        </>
      )}
    </div>
  );
}

export function CertApp() {
  const p = new URLSearchParams(location.search);
  return <CertView q={p.get('q') || ''} u={p.get('u') || ''} />;
}
