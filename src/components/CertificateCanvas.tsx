import React, { useRef, useEffect, useState } from 'react';
import { Download, Award, ShieldCheck, Sparkles } from 'lucide-react';

interface CertificateCanvasProps {
  templateId: string;
  recipientName: string;
  rank: number;
  score: number;
  totalQuestions: number;
  topic: string;
  groupTitle: string;
  date?: string;
  signatoryTitle?: string;
  signatoryName?: string;
  width?: number;
  height?: number;
  showDownloadBtn?: boolean;
  certId?: string;
}

export const CertificateCanvas: React.FC<CertificateCanvasProps> = ({
  templateId,
  recipientName,
  rank,
  score,
  totalQuestions,
  topic,
  groupTitle,
  date = '',
  signatoryTitle = 'Guruh Admini',
  signatoryName = '',
  certId = 'QZ-00000000',
  width = 800,
  height = 560,
  showDownloadBtn = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    // Canvas text must wait for the web fonts, otherwise the first paint uses fallback fonts.
    const f: any = (document as any).fonts;
    if (!f?.load) return setFontsReady(true);
    Promise.all([
      f.load('800 34px "Plus Jakarta Sans"'),
      f.load('600 14px "Plus Jakarta Sans"'),
      f.load('700 13px "Cinzel"'),
      f.load('700 13px "Space Grotesk"'),
    ])
      .catch(() => {})
      .finally(() => setFontsReady(true));
  }, []);

  // Draws centered text, shrinking the font until it fits maxWidth (long names).
  const fitText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) => {
    const clean = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim() || text;
    const m = ctx.font.match(/(\d+)px/);
    let size = m ? Number(m[1]) : 34;
    while (size > 14 && ctx.measureText(clean).width > maxWidth) {
      size -= 1;
      ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    }
    ctx.fillText(clean, x, y);
  };

  useEffect(() => {
    if (!fontsReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI scaling
    const dpr = window.devicePixelRatio || 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clean background
    ctx.clearRect(0, 0, width, height);

    if (templateId === 'tmpl-royal-indigo') {
      // 1. Royal Indigo Style
      drawRoyalIndigo(ctx, width, height);
    } else if (templateId === 'tmpl-emerald-classic') {
      // 2. Emerald Classic Style
      drawEmeraldClassic(ctx, width, height);
    } else {
      // 3. Default: Modern Gold
      drawModernGold(ctx, width, height);
    }
  }, [fontsReady, templateId, recipientName, rank, score, totalQuestions, topic, groupTitle, date, signatoryTitle, signatoryName, certId, width, height]);

  // Template 1: Modern Gold
  const drawModernGold = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Dark luxury background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#090d16');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Golden Outer Border
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Thin inner gold border
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    // Decorative corners
    drawGoldCorners(ctx, 28, 28, w - 56, h - 56);

    // Top Header
    ctx.fillStyle = '#f59e0b';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('TELEGRAM QUIZBOT RASMIY SERTIFIKATI', w / 2, 65);

    // Main Certificate Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('SERTIFIKAT', w / 2, 110);

    // Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 14px "Plus Jakarta Sans", sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText("Ushbu maxsus sertifikat yuqori bilim va tezkor natija uchun taqdim etiladi:", w / 2, 140);

    // Recipient Name with gold glow
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
    ctx.shadowBlur = 10;
    fitText(ctx, recipientName || 'Foydalanuvchi', w / 2, 200, w - 140);
    ctx.restore();

    // Underline
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 140, 215);
    ctx.lineTo(w / 2 + 140, 215);
    ctx.stroke();

    // Place Badge & Description
    const rankLabel = rank === 1 ? "1-O'RIN (G'OLIB)" : rank === 2 ? "2-O'RIN (KUMUSH)" : rank === 3 ? "3-O'RIN (BRONZA)" : `${rank}-O'RIN`;
    
    // Pill badge for rank
    ctx.fillStyle = rank === 1 ? '#d97706' : rank === 2 ? '#64748b' : '#b45309';
    roundRect(ctx, w / 2 - 100, 240, 200, 32, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`🏆 ${rankLabel}`, w / 2, 261);

    // Details paragraph
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '400 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`"${groupTitle}" guruhida o'tkazilgan intellektual viktorinada`, w / 2, 305);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Mavzu: "${topic}"`, w / 2, 335);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Natija: ${score} / ${totalQuestions} ball (${Math.round((score / totalQuestions) * 100)}%)`, w / 2, 365);

    // Golden Seal in the middle bottom
    drawSeal(ctx, w / 2, 440, '#f59e0b', '#78350f', rank);

    // Left info: Date & Verification
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('BERILGAN SANA', 60, 435);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(date, 60, 455);
    ctx.fillStyle = '#64748b';
    ctx.font = '400 10px monospace';
    ctx.fillText(`ID: ${certId}`, 60, 475);

    // Right info: Signature
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(signatoryTitle.toUpperCase(), w - 60, 435);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(signatoryName, w - 60, 455);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 200, 470);
    ctx.lineTo(w - 60, 470);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Elektron tasdiqlangan ✓', w - 60, 485);
  };

  // Template 2: Royal Indigo
  const drawRoyalIndigo = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#1e1b4b');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Indigo & Cyan borders
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 5;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, 30, w - 60, h - 60);

    // Header
    ctx.fillStyle = '#818cf8';
    ctx.font = '700 13px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '5px';
    ctx.fillText('XALQARO BILIM VA MAHORAT SERTIFIKATI', w / 2, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px "Cinzel", Georgia, serif';
    ctx.fillText('DIPLOM', w / 2, 115);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 13px "Plus Jakarta Sans", sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText("Ingliz tili fani bo'yicha namunali natija ko'rsatgani uchun:", w / 2, 145);

    // Recipient Name
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
    fitText(ctx, recipientName || 'Foydalanuvchi', w / 2, 205, w - 140);

    // Rank pill
    ctx.fillStyle = '#4f46e5';
    roundRect(ctx, w / 2 - 90, 235, 180, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${rank}-O'RIN SOHIBI`, w / 2, 256);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '400 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Telegram guruhi: ${groupTitle}`, w / 2, 305);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Maxsus mavzu: "${topic}"`, w / 2, 335);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`To'plangan ball: ${score} / ${totalQuestions} (${Math.round((score / totalQuestions) * 100)}%)`, w / 2, 365);

    drawSeal(ctx, w / 2, 440, '#818cf8', '#312e81', rank);

    // Left info
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SANA VA VAQT', 60, 435);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(date, 60, 455);

    // Right info
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(signatoryTitle.toUpperCase(), w - 60, 435);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(signatoryName, w - 60, 455);
  };

  // Template 3: Emerald Classic
  const drawEmeraldClassic = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#064e3b');
    bgGrad.addColorStop(0.5, '#022c22');
    bgGrad.addColorStop(1, '#021f18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Emerald & Gold borders
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 5;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, 30, w - 60, h - 60);

    ctx.fillStyle = '#6ee7b7';
    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('ZUKKO BILIMDONLAR VA GʻOLIBLAR KENGASHI', w / 2, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('FAXRIY YORLIQ', w / 2, 115);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = '400 14px "Plus Jakarta Sans", sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText("Ingliz tili fanidan erishgan yuksak natijalari munosabati bilan:", w / 2, 145);

    ctx.fillStyle = '#fef08a';
    ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
    fitText(ctx, recipientName || 'Foydalanuvchi', w / 2, 205, w - 140);

    ctx.fillStyle = '#059669';
    roundRect(ctx, w / 2 - 90, 235, 180, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`🏅 ${rank}-O'RIN SOHIBI`, w / 2, 256);

    ctx.fillStyle = '#d1fae5';
    ctx.font = '400 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`"${groupTitle}" jamoasida`, w / 2, 305);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`"${topic}" testi bo'yicha`, w / 2, 335);

    ctx.fillStyle = '#ffffff';
    ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Ko'rsatkich: ${score} / ${totalQuestions} ball`, w / 2, 365);

    drawSeal(ctx, w / 2, 440, '#10b981', '#064e3b', rank);

    // Left info
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SANA', 60, 435);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(date, 60, 455);

    // Right info
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '400 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(signatoryTitle.toUpperCase(), w - 60, 435);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(signatoryName, w - 60, 455);
  };

  // Helper: Seal
  const drawSeal = (ctx: CanvasRenderingContext2D, x: number, y: number, strokeColor: string, fillColor: string, rnk: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 32, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = strokeColor;
    ctx.textAlign = 'center';
    ctx.font = '800 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(rnk === 1 ? '★ 1 ★' : rnk === 2 ? '★ 2 ★' : '★ 3 ★', x, y + 5);
    ctx.restore();
  };

  // Helper: Gold corners
  const drawGoldCorners = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const size = 18;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - size, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + size);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + h - size);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + size, y + h);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - size, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - size);
    ctx.stroke();
  };

  // Helper: Rounded Rect
  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sertifikat_${recipientName.replace(/\s+/g, '_')}_${rank}-orin.png`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="overflow-hidden rounded-xl shadow-2xl border border-slate-700/60 bg-slate-900 max-w-full">
        <canvas
          ref={canvasRef}
          style={{ width: `${width}px`, maxWidth: '100%', height: 'auto' }}
          className="block"
        />
      </div>

      {showDownloadBtn && (
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Sertifikatni PNG formatda yuklab olish
        </button>
      )}
    </div>
  );
};
