import { cx, Icon, Popup, initials } from './core.jsx';
import { Button, IconButton } from './actions.jsx';
import { Tag } from './feedback.jsx';
import { Tooltip } from './containers.jsx';
const { useState } = React;

const toneOf = (name = '') => 't' + ((Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 5) + 1);

/** Avatar — person or team, with initials fallback and presence. */
export function Avatar({ name = '', src, size = 'md', status, tone }) {
  return (
    <span className={cx('fk-avatar', size !== 'md' && 'fk-avatar--' + size, !src && 'fk-avatar--' + (tone || toneOf(name)))} title={name} role="img" aria-label={name}>
      {src ? <img src={src} alt="" /> : initials(name)}
      {status && <span className={cx('fk-avatar__status', 'fk-avatar__status--' + status)} />}
    </span>
  );
}
/** AvatarGroup — overlapping avatars with +N. */
export function AvatarGroup({ people = [], max = 4, size = 'sm' }) {
  const shown = people.slice(0, max), rest = people.length - shown.length;
  return (
    <span className="fk-avatars">
      {shown.map((p, i) => <Avatar key={i} name={p.name || p} src={p.avatar} size={size} />)}
      {rest > 0 && <span className={cx('fk-avatar', size !== 'md' && 'fk-avatar--' + size, 'fk-avatars__more')} title={people.slice(max).map((p) => p.name || p).join(', ')}>+{rest}</span>}
    </span>
  );
}

/** UserCard — person with role, team and contact. */
export function UserCard({ name, role, email, phone, location, team, tags = [], avatar, status, actions }) {
  return (
    <div className="fk-usercard">
      <div className="fk-usercard__top">
        <Avatar name={name} src={avatar} size="xl" status={status} />
        <div className="fk-usercard__who"><span className="fk-h3">{name}</span>{role && <span className="fk-usercard__role">{role}</span>}</div>
      </div>
      {(tags.length > 0 || team) && <div className="fk-usercard__tags">{team && <Tag variant="brand" size="sm">{team}</Tag>}{tags.map((t) => <Tag key={t} size="sm">{t}</Tag>)}</div>}
      <div className="fk-usercard__rows">
        {email && <span className="fk-usercard__row"><Icon name="mail" size={16} />{email}</span>}
        {phone && <span className="fk-usercard__row"><Icon name="message" size={16} />{phone}</span>}
        {location && <span className="fk-usercard__row"><Icon name="building" size={16} />{location}</span>}
      </div>
      {actions !== false && <div className="fk-usercard__actions">{actions || <><Button size="sm" variant="secondary" icon="message">Mensaje</Button><Button size="sm" variant="ghost" icon="calendar">Agendar</Button></>}</div>}
    </div>
  );
}

/** NotificationCenter — bell with unread count and a panel of notifications. */
export function NotificationCenter({ items = [], defaultOpen = false, onMarkAllRead, inverse, staticPanel }) {
  const [open, setOpen] = useState(defaultOpen || !!staticPanel);
  const [tab, setTab] = useState('all');
  const unread = items.filter((i) => i.unread).length;
  const list = tab === 'all' ? items : items.filter((i) => i.unread);
  const panel = (
    <div className="fk-notif">
      <div className="fk-notif__head"><span className="fk-h4">Notificaciones</span><button type="button" className="fk-link" style={{ fontSize: 13 }} onClick={onMarkAllRead}>Marcar todo como leído</button></div>
      <div className="fk-tabs" role="tablist" style={{ marginTop: 6 }}>
        <button type="button" role="tab" className="fk-tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>Todas</button>
        <button type="button" role="tab" className="fk-tab" aria-selected={tab === 'unread'} onClick={() => setTab('unread')}>No leídas<span className="fk-tab__count">{unread}</span></button>
      </div>
      <ul className="fk-notif__list">
        {list.length === 0 && <li className="fk-listbox__empty">No tenés notificaciones sin leer.</li>}
        {list.map((n, i) => (
          <li key={i} className="fk-notif__item">
            {n.icon ? <span className="fk-list__lead fk-list__lead--icon" style={{ width: 32, height: 32 }}><Icon name={n.icon} size={16} /></span> : <Avatar name={n.actor} size="sm" />}
            <div className="fk-notif__body"><span>{n.text}</span><span className="fk-notif__time">{n.time}</span></div>
            {n.unread && <span className="fk-notif__unread" aria-label="No leída" />}
          </li>
        ))}
      </ul>
      <div className="fk-notif__foot"><a className="fk-link" href="#">Ver todas las notificaciones</a></div>
    </div>
  );
  if (staticPanel) return <div className="fk-layer fk-layer--static">{panel}</div>;
  return (
    <Popup open={open} onClose={() => setOpen(false)} placement="end"
      trigger={<IconButton icon="bell" label={`Notificaciones (${unread} sin leer)`} variant={inverse ? 'inverse' : 'ghost'} badge={unread} onClick={() => setOpen(!open)} />}>
      {panel}
    </Popup>
  );
}

const renderMentions = (text) => String(text).split(/(@[\wÁÉÍÓÚáéíóúñÑ.]+)/g).map((p, i) => (p.startsWith('@') ? <span key={i} className="fk-comment__mention">{p}</span> : p));

/** Comments — discussion thread on a record, with composer. */
export function Comments({ comments = [], currentUser, onSubmit, placeholder = 'Escribí un comentario. Usá @ para mencionar.' }) {
  const [text, setText] = useState('');
  return (
    <div className="fk-comments">
      {comments.map((c, i) => (
        <div key={i} className={cx('fk-comment', c.reply && 'fk-comment--reply')}>
          <Avatar name={c.author} size={c.reply ? 'sm' : 'md'} />
          <div className="fk-comment__body">
            <div className="fk-comment__head"><span className="fk-comment__name">{c.author}</span><span className="fk-comment__time">{c.time}</span></div>
            <p className="fk-comment__text">{renderMentions(c.text)}</p>
            <div className="fk-comment__actions"><button type="button">Responder</button><button type="button">Copiar enlace</button></div>
          </div>
        </div>
      ))}
      {currentUser && (
        <div className="fk-composer">
          <Avatar name={currentUser.name} />
          <div className="fk-composer__box">
            <div className="fk-control fk-control--multiline"><textarea rows={2} value={text} placeholder={placeholder} aria-label="Nuevo comentario" onChange={(e) => setText(e.target.value)} style={{ minHeight: 48 }} /></div>
            <div className="fk-composer__bar">
              <IconButton icon="paperclip" label="Adjuntar archivo" size="sm" />
              <IconButton icon="users" label="Mencionar" size="sm" />
              <Button size="sm" icon="send" disabled={!text.trim()} onClick={() => { onSubmit && onSubmit(text); setText(''); }}>Comentar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** CopyButton — copy an ID, CUIT or link with confirmation. */
export function CopyButton({ value, label = 'Copiar', showValue, copiedLabel = 'Copiado' }) {
  const [done, setDone] = useState(false);
  const copy = () => { try { navigator.clipboard && navigator.clipboard.writeText(value); } catch (e) { /* noop */ } setDone(true); setTimeout(() => setDone(false), 1600); };
  const btn = (
    <Tooltip content={done ? copiedLabel : label}>
      <IconButton icon={done ? 'check' : 'copy'} label={done ? copiedLabel : label + ' ' + value} size="sm" className={done ? 'fk-iconbtn--copied' : undefined} onClick={copy} />
    </Tooltip>
  );
  if (!showValue) return btn;
  return <span className="fk-copy"><span className="fk-copy__value">{value}</span>{btn}</span>;
}

/** Kbd — keyboard key or shortcut. */
export function Kbd({ keys, children }) {
  const list = keys ? (Array.isArray(keys) ? keys : String(keys).split('+')) : [children];
  return <span className="fk-kbds">{list.map((k, i) => <kbd key={i} className="fk-kbd">{k}</kbd>)}</span>;
}
