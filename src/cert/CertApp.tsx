import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PublicCertificate } from '../types';
import { CertificateCanvas } from '../components/CertificateCanvas';
import { ErrorBox, Spinner } from '../components/ui';

// Public, shareable certificate page: /cert.html?q=<quizId>&u=<userId>
export function CertApp() {
  const [cert, setCert] = useState<PublicCertificate | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    api.certificate(p.get('q') || '', p.get('u') || '').then(setCert).catch(e => setError(e.message));
  }, []);

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
            topic={cert.topic}
            groupTitle={cert.groupTitle}
            date={cert.date}
            signatoryTitle={cert.signatoryTitle}
            signatoryName={cert.signatoryName}
            certId={cert.certId}
          />
          <p className="text-[11px] text-slate-500">Sertifikat ID: {cert.certId}</p>
        </>
      )}
    </div>
  );
}
