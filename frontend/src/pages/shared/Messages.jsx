import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import useFetch from '../../hooks/useFetch';
import { Alert, FetchBody, Field, LoadError } from '../../components/ui';
import { isNativeApp } from '../../native/platform';
import { errorText } from '../../utils/format';

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, pick } = useLanguage();
  const threads = useFetch('/messages/threads');
  const contacts = useFetch('/messages/contacts');
  const thread = useFetch(id ? `/messages/threads/${id}` : null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ contact: '', subject: '', body: '' });
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.data]);

  async function send(e) {
    e.preventDefault();
    setError('');
    const c = (contacts.data || [])[Number(form.contact)];
    if (!c) return;
    setSending(true);
    try {
      const r = await api.post('/messages/threads', { receiver_id: c.id, offering_id: c.offering_id, subject: form.subject, body: form.body });
      setComposing(false);
      setForm({ contact: '', subject: '', body: '' });
      threads.reload();
      navigate(`/messages/${r.data.id}`);
    } catch (err) { setError(errorText(err, t)); }
    finally { setSending(false); }
  }

  async function sendReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/messages/threads/${id}/reply`, { body: reply });
      setReply('');
      thread.reload();
      threads.reload();
    } catch (err) { setError(errorText(err, t)); }
    finally { setSending(false); }
  }

  const native = isNativeApp();
  const showThread = Boolean(id || composing);

  return (
    <div className={native ? `msg-layout native-msgs${showThread ? ' is-thread' : ' is-list'}` : 'msg-layout'}>
      <div className="card msg-list">
        <button className="b b-primary full" onClick={() => { setComposing(true); navigate('/messages'); }}>✉️ {t('msg.new')}</button>
        <FetchBody loading={threads.loading} error={threads.error} data={threads.data} onRetry={threads.reload}>
          {(list) => (
            <>
        {list.length === 0 && <p className="muted">{t('msg.none')}</p>}
        {list.map((th) => (
          <div key={th.id} className={`thread ${String(th.id) === id ? 'active' : ''}`} onClick={() => { setComposing(false); navigate(`/messages/${th.id}`); }}>
            <div className="row between">
              <strong>{pick(th.other_ar, th.other_en)}</strong>
              {th.unread > 0 && <span className="count">{th.unread}</span>}
            </div>
            <div className="small">{th.subject}{th.course_code ? ` · ${th.course_code}` : ''}</div>
            <div className="small muted ellipsis">{th.last_body}</div>
          </div>
        ))}
            </>
          )}
        </FetchBody>
      </div>

      <div className="card msg-view">
        {native && showThread && (
          <button type="button" className="b b-ghost gap-bottom" onClick={() => { setComposing(false); navigate('/messages'); }}>{t('native.back')}</button>
        )}
        <Alert>{error}</Alert>
        {composing && contacts.error && <LoadError error={contacts.error} onRetry={contacts.reload} />}
        {composing && (
          <form onSubmit={send}>
            <h3 className="m0">{t('msg.new')}</h3>
            <Field label={t('msg.to')}>
              <select required value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}>
                <option value="">—</option>
                {(contacts.data || []).map((c, i) => (
                  <option key={i} value={i}>{pick(c.full_name_ar, c.full_name_en)} — {c.course_code}</option>
                ))}
              </select>
            </Field>
            <Field label={t('msg.subject')}><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label={t('msg.body')}><textarea required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            <button className="b b-primary" disabled={sending}>{t('msg.send')}</button>
          </form>
        )}

        {!composing && !id && <p className="muted">{t('msg.select')}</p>}

        {!composing && id && (
          <FetchBody loading={thread.loading} error={thread.error} data={thread.data} onRetry={thread.reload}>
            {(conv) => (
          <>
            <h3 className="m0">{conv.thread.subject}</h3>
            <p className="muted small">{pick(conv.thread.other_ar, conv.thread.other_en)}{conv.thread.course_code ? ` · ${conv.thread.course_code}` : ''}</p>
            <div className="bubbles">
              {conv.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'mine' : ''}`}>
                  <div className="small muted">{pick(m.full_name_ar, m.full_name_en)} · {m.created_at}</div>
                  <div>{m.body}</div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={sendReply} className="reply">
              <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('msg.reply')} />
              <button className="b b-primary" disabled={sending || !reply.trim()}>{t('msg.send')}</button>
            </form>
          </>
            )}
          </FetchBody>
        )}
      </div>
    </div>
  );
}
