// src/components/assistant/PublicAssistantChat.tsx
// Chat público del asistente de servicio técnico (fase 3): /#/asistente/<slug>.
// Lo usan clientes sin cuenta, así que se monta fuera de los contextos de la app
// (src/index.tsx). Todo el texto se muestra como texto plano.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MailCheck, Send, ShieldCheck, Wrench, X } from 'lucide-react';
import {
  AssistantApiError, initAssistant, sendAssistantMessage, sendVerificationCode, verifyCode,
  type AssistantCompany,
} from '../../services/assistantChat';
import { safeUrl } from '../../utils/html';

type Msg = { id: number; role: 'user' | 'assistant'; text: string; kind?: 'error' | 'note' };

const MAX_CHARS = 2000;
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

const storage = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { sessionStorage.setItem(key, value); } catch { /* sin almacenamiento: se trabaja en memoria */ }
  },
  remove(key: string) {
    try { sessionStorage.removeItem(key); } catch { /* idem */ }
  },
};

let nextId = 1;
const msg = (role: Msg['role'], text: string, kind?: Msg['kind']): Msg => ({ id: nextId++, role, text, kind });

const PublicAssistantChat: React.FC<{ slug: string }> = ({ slug }) => {
  const convKey = `nt_asistente_conv_${slug}`;
  const consentKey = `nt_asistente_consent_${slug}`;

  const [phase, setPhase] = useState<'loading' | 'unavailable' | 'ready'>('loading');
  const [unavailableReason, setUnavailableReason] = useState('');
  const [company, setCompany] = useState<AssistantCompany | null>(null);
  const [notice, setNotice] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [consented, setConsented] = useState(() => storage.get(consentKey) === '1');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [requestInfo, setRequestInfo] = useState<{ status: string; reference: string } | null>(null);
  const [verified, setVerified] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Abrir o retomar la conversación
  useEffect(() => {
    let cancelled = false;
    initAssistant(slug, storage.get(convKey))
      .then((data) => {
        if (cancelled) return;
        setCompany(data.company);
        setNotice(data.privacyNotice);
        setConversationId(data.conversationId);
        setVerified(data.verified);
        storage.set(convKey, data.conversationId);
        setMessages([msg('assistant', data.welcome), ...data.messages.map((m) => msg(m.role, m.text))]);
        setPhase('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setUnavailableReason(e instanceof AssistantApiError ? e.message : 'No se pudo abrir el asistente.');
        setPhase('unavailable');
      });
    return () => { cancelled = true; };
  }, [slug, convKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  useEffect(() => {
    if (company?.name) document.title = `Asistente · ${company.name}`;
  }, [company?.name]);

  const accept = () => {
    storage.set(consentKey, '1');
    setConsented(true);
  };

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || !conversationId || sending) return;
    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, msg('user', clean)]);
    try {
      const res = await sendAssistantMessage(slug, conversationId, clean);
      setMessages((prev) => [...prev, msg('assistant', res.reply)]);
      if (res.request) setRequestInfo(res.request);
    } catch (e) {
      const status = e instanceof AssistantApiError ? e.status : 0;
      // Conversación perdida (p. ej. purgada): se descarta para abrir una nueva al recargar.
      if (status === 404) storage.remove(convKey);
      setMessages((prev) => [...prev, msg('assistant', e instanceof Error ? e.message : 'Ocurrió un error.', 'error')]);
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, slug, convKey]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const brandColor = company?.primaryColor && HEX_COLOR.test(company.primaryColor) ? company.primaryColor : null;
  const brandStyle = brandColor
    ? ({ '--color-primary': brandColor, '--color-primary-dark': brandColor } as React.CSSProperties)
    : undefined;
  const logo = company?.logoUrl ? safeUrl(company.logoUrl, ['https:']) : null;

  if (phase === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-surface flex items-center justify-center gap-3 text-ink-faint">
        <Loader2 className="animate-spin" size={24} aria-hidden="true" /> <span>Abriendo el asistente…</span>
      </div>
    );
  }

  if (phase === 'unavailable') {
    return (
      <div className="min-h-[100dvh] bg-surface flex items-center justify-center p-6">
        <div className="card p-8 max-w-sm text-center space-y-2">
          <Wrench className="mx-auto text-ink-faint" size={28} aria-hidden="true" />
          <h1 className="text-lg font-bold text-ink">Asistente no disponible</h1>
          <p className="text-sm text-ink-soft">{unavailableReason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-surface flex flex-col" style={brandStyle}>
      {/* Encabezado con la marca de la empresa */}
      <header className="bg-raised border-b border-line px-4 py-3 flex items-center gap-3 shrink-0">
        {logo
          ? <img src={logo} alt="" className="h-9 max-w-[120px] object-contain" />
          : <div className="h-9 w-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold">{company?.name?.[0] ?? 'A'}</div>}
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-ink truncate">{company?.name}</h1>
          <p className="text-xs text-ink-faint">Asistente de servicio técnico</p>
        </div>
        {verified && (
          <span className="ml-auto badge bg-green-100 text-green-800"><ShieldCheck size={12} aria-hidden="true" /> Correo verificado</span>
        )}
      </header>

      {!consented ? (
        <main className="flex-1 overflow-y-auto p-4 flex items-start sm:items-center justify-center">
          <section className="card p-6 max-w-md w-full space-y-4" aria-labelledby="aviso-datos">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-primary" size={20} aria-hidden="true" />
              <h2 id="aviso-datos" className="text-base font-bold text-ink">Antes de empezar</h2>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">{notice}</p>
            <button type="button" onClick={accept} className="btn-primary w-full">Acepto y quiero continuar</button>
          </section>
        </main>
      ) : (
        <>
          <main className="flex-1 overflow-y-auto px-4 py-4">
            <div className="max-w-2xl mx-auto flex flex-col gap-2" aria-live="polite">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'self-end bg-primary text-white rounded-br-md'
                      : m.kind === 'error'
                        ? 'self-start bg-red-50 text-red-800 border border-red-200 rounded-bl-md'
                        : m.kind === 'note'
                          ? 'self-center bg-green-50 text-green-800 text-xs'
                          : 'self-start bg-raised text-ink border border-line-soft rounded-bl-md'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {sending && (
                <div className="self-start bg-raised border border-line-soft rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-ink-faint inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Escribiendo…
                </div>
              )}
              <div ref={endRef} />
            </div>
          </main>

          {requestInfo?.status === 'pendiente' && (
            <div className="shrink-0 bg-green-50 border-t border-green-200 px-4 py-2.5 text-sm text-green-800">
              <p className="max-w-2xl mx-auto flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                <span>Solicitud registrada (ref. {requestInfo.reference}). Un administrador confirmará la fecha y el técnico.</span>
              </p>
            </div>
          )}

          {showVerify && conversationId && (
            <VerifyPanel
              slug={slug}
              conversationId={conversationId}
              onClose={() => setShowVerify(false)}
              onVerified={() => {
                setVerified(true);
                setShowVerify(false);
                setMessages((prev) => [...prev, msg('assistant', 'Correo verificado. Ya puedo consultar tus datos de cliente.', 'note')]);
              }}
            />
          )}

          <form onSubmit={onSubmit} className="shrink-0 bg-raised border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-end gap-2">
                <label htmlFor="mensaje" className="sr-only">Mensaje</label>
                <textarea
                  id="mensaje"
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Escribe tu mensaje…"
                  className="flex-1 resize-none max-h-32 bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  aria-label="Enviar"
                  className="h-10 w-10 shrink-0 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40"
                >
                  <Send size={17} aria-hidden="true" />
                </button>
              </div>
              {!verified && !showVerify && (
                <button type="button" onClick={() => setShowVerify(true)} className="mt-2 text-xs font-semibold text-primary inline-flex items-center gap-1">
                  <MailCheck size={13} aria-hidden="true" /> ¿Ya eres cliente? Verificar mi correo
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
};

const VerifyPanel: React.FC<{ slug: string; conversationId: string; onClose: () => void; onVerified: () => void }> = ({
  slug, conversationId, onClose, onVerified,
}) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await sendVerificationCode(slug, conversationId, email.trim());
      setInfo(`Te enviamos un código de 6 dígitos. Vence en ${res.minutes} minutos.`);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el código.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(slug, conversationId, email.trim(), code.trim());
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'flex-1 min-w-0 bg-sunken border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20';

  return (
    <section className="shrink-0 bg-sunken border-t border-line px-4 py-3" aria-label="Verificar correo">
      <div className="max-w-2xl mx-auto space-y-2">
        <div className="flex items-center gap-2">
          <MailCheck size={15} className="text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">Verificar mi correo</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ml-auto p-1 rounded-full text-ink-faint hover:bg-line">
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          Si ya eres cliente, verifica el correo que tiene registrado la empresa para que el asistente vea tus equipos.
        </p>
        {step === 'email' ? (
          <form onSubmit={requestCode} className="flex gap-2">
            <label htmlFor="verif-email" className="sr-only">Correo</label>
            <input id="verif-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" className={inputCls} />
            <button type="submit" disabled={busy || !email.trim()} className="btn-primary !py-2 disabled:opacity-50 inline-flex items-center gap-1">
              {busy && <Loader2 size={14} className="animate-spin" />} Enviar código
            </button>
          </form>
        ) : (
          <form onSubmit={confirm} className="flex gap-2">
            <label htmlFor="verif-code" className="sr-only">Código</label>
            <input
              id="verif-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${inputCls} tracking-[0.3em]`}
            />
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary !py-2 disabled:opacity-50 inline-flex items-center gap-1">
              {busy && <Loader2 size={14} className="animate-spin" />} Verificar
            </button>
          </form>
        )}
        {info && !error && <p className="text-xs text-ink-soft">{info}</p>}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
    </section>
  );
};

export default PublicAssistantChat;
