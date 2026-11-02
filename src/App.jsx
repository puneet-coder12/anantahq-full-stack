import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const day = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const inputDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function Toast({ toast, onClose }) {
  useEffect(() => { if (toast) { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); } }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type}`} role="status" onClick={onClose}>
      <strong>{toast.message}</strong>
      {toast.details?.map((d) => <div key={d.field + d.message}>{d.field}: {d.message}</div>)}
    </div>
  );
}

function SlotTile({ slot, children, note }) {
  return (
    <article className={`tile ${slot.status}`}>
      <div className="when"><span className="time">{time(slot.startsAt)}</span><span className="day">{day(slot.startsAt)}</span></div>
      <div className="meta">
        <h3>{slot.clinicName}</h3>
        <p>{slot.provider} · {slot.durationMinutes} min</p>
        {note}
      </div>
      <div className="actions">{children}</div>
    </article>
  );
}

function BookDialog({ slot, onClose, onBooked, notify }) {
  const [form, setForm] = useState({ patientName: '', patientEmail: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.book(slot.id, form);
      notify({ type: 'ok', message: `Booked ${time(slot.startsAt)} on ${day(slot.startsAt)}. Use ${form.patientEmail} to manage it.` });
      onBooked(form.patientEmail);
    } catch (err) {
      notify({ type: 'err', message: err.message, details: err.details });
      if (err.code === 'SLOT_TAKEN' || err.code === 'SLOT_CANCELLED') onBooked();
    } finally { setBusy(false); }
  }
  return (
    <div className="scrim" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Book {time(slot.startsAt)}, {day(slot.startsAt)}</h2>
        <p className="muted">{slot.clinicName} · {slot.provider}</p>
        <label>Your name<input value={form.patientName} onChange={set('patientName')} autoFocus required /></label>
        <label>Email<input type="email" value={form.patientEmail} onChange={set('patientEmail')} required /></label>
        <label>Note for the clinic (optional)<textarea rows="2" value={form.note} onChange={set('note')} /></label>
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>Close</button>
          <button className="primary" disabled={busy}>{busy ? 'Booking…' : 'Confirm booking'}</button>
        </div>
      </form>
    </div>
  );
}

function PatientView({ notify }) {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState({ text: '', date: '' });
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSlots = useCallback(async () => {
    try { setSlots(await api.listSlots({ status: 'open', from: new Date().toISOString() })); }
    catch (e) { notify({ type: 'err', message: e.message }); }
    setLoading(false);
  }, [notify]);
  const loadBookings = useCallback(async (addr) => {
    if (!addr) return setBookings([]);
    try { setBookings(await api.listBookings({ patientEmail: addr.trim().toLowerCase() })); }
    catch (e) { notify({ type: 'err', message: e.message, details: e.details }); }
  }, [notify]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const shown = slots.filter((s) =>
    (!filter.text || `${s.clinicName} ${s.provider}`.toLowerCase().includes(filter.text.toLowerCase())) &&
    (!filter.date || inputDate(new Date(s.startsAt)).startsWith(filter.date)));

  async function cancel(b) {
    try { await api.cancelBooking(b.id, b.patientEmail); notify({ type: 'ok', message: 'Booking cancelled. The slot is open again.' }); }
    catch (e) { notify({ type: 'err', message: e.message }); }
    loadBookings(email); loadSlots();
  }

  return (
    <div className="split">
      <section>
        <div className="head"><h2>Open appointments</h2><span className="count">{shown.length}</span></div>
        <div className="filters">
          <input placeholder="Search clinic or doctor" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
          <input type="date" aria-label="Filter by date" value={filter.date} onChange={(e) => setFilter({ ...filter, date: e.target.value })} />
        </div>
        <div className="grid">
          {shown.map((s) => (
            <SlotTile key={s.id} slot={s}><button className="primary" onClick={() => setPicked(s)}>Book</button></SlotTile>
          ))}
        </div>
        {!loading && !shown.length && <p className="empty">No open slots match. Clear the filters or check back when clinics publish more times.</p>}
      </section>

      <aside>
        <div className="head"><h2>My bookings</h2></div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); loadBookings(email); }}>
          <input type="email" placeholder="Email you booked with" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="ghost">Find</button>
        </form>
        <div className="stack">
          {bookings.map((b) => (
            <SlotTile key={b.id} slot={{ ...b, status: b.status === 'confirmed' ? 'booked' : 'cancelled' }}
              note={<span className={`badge ${b.status}`}>{b.status}</span>}>
              {b.status === 'confirmed' && new Date(b.startsAt) > new Date() && <button className="danger" onClick={() => cancel(b)}>Cancel</button>}
            </SlotTile>
          ))}
          {!bookings.length && <p className="empty">Enter your email to see and cancel your appointments.</p>}
        </div>
      </aside>

      {picked && <BookDialog slot={picked} notify={notify} onClose={() => setPicked(null)}
        onBooked={(addr) => { setPicked(null); loadSlots(); if (addr) { setEmail(addr); loadBookings(addr); } }} />}
    </div>
  );
}

function ClinicView({ notify }) {
  const [clinic, setClinic] = useState(() => localStorage.getItem('clinic') || '');
  const [form, setForm] = useState({ provider: '', startsAt: inputDate(new Date(Date.now() + 864e5)), durationMinutes: 30 });
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState({});
  const name = clinic.trim();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    if (name.length < 2) return setSlots([]);
    try {
      const [s, b] = await Promise.all([api.listSlots({ clinicName: name }), api.listBookings({ clinicName: name })]);
      setSlots(s);
      setBookings(Object.fromEntries(b.filter((x) => x.status === 'confirmed').map((x) => [x.slotId, x])));
    } catch (e) { notify({ type: 'err', message: e.message }); }
  }, [name, notify]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { localStorage.setItem('clinic', clinic); }, [clinic]);

  async function publish(e) {
    e.preventDefault();
    try {
      await api.createSlot({ clinicName: name, provider: form.provider || undefined, durationMinutes: form.durationMinutes, startsAt: new Date(form.startsAt).toISOString() });
      notify({ type: 'ok', message: 'Slot published. Patients can book it now.' });
      load();
    } catch (err) { notify({ type: 'err', message: err.message, details: err.details }); }
  }
  async function cancel(s) {
    try { await api.cancelSlot(s.id); notify({ type: 'ok', message: 'Slot cancelled.' }); }
    catch (err) { notify({ type: 'err', message: err.message }); }
    load();
  }

  return (
    <div className="split">
      <aside>
        <div className="head"><h2>Publish a slot</h2></div>
        <form className="card" onSubmit={publish}>
          <label>Clinic name<input value={clinic} onChange={(e) => setClinic(e.target.value)} placeholder="e.g. Green Cross Clinic" required /></label>
          <label>Doctor or room<input value={form.provider} onChange={set('provider')} placeholder="Dr. Rao" /></label>
          <label>Starts<input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required /></label>
          <label>Length (minutes)<input type="number" min="5" max="480" step="5" value={form.durationMinutes} onChange={set('durationMinutes')} /></label>
          <button className="primary">Publish slot</button>
        </form>
      </aside>
      <section>
        <div className="head"><h2>{name.length > 1 ? `${name} slots` : 'Your slots'}</h2><span className="count">{slots.length}</span></div>
        <div className="grid">
          {slots.map((s) => {
            const b = bookings[s.id];
            return (
              <SlotTile key={s.id} slot={s} note={<>
                <span className={`badge ${s.status}`}>{s.status}</span>
                {b && <p className="who">{b.patientName} · {b.patientEmail}{b.note ? ` — “${b.note}”` : ''}</p>}
              </>}>
                {s.status === 'open' && <button className="danger" onClick={() => cancel(s)}>Cancel slot</button>}
              </SlotTile>
            );
          })}
        </div>
        {name.length > 1 && !slots.length && <p className="empty">No slots yet for this clinic. Publish the first one on the left.</p>}
        {name.length < 2 && <p className="empty">Type your clinic name to see and manage its slots.</p>}
      </section>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('patient');
  const [toast, setToast] = useState(null);
  const close = useCallback(() => setToast(null), []);
  const notify = useCallback((t) => setToast(t), []);
  return (
    <>
      <header className="top">
        <h1>Clinic Slots</h1>
        <nav role="tablist" aria-label="Choose your role">
          <button role="tab" aria-selected={tab === 'patient'} onClick={() => setTab('patient')}>I’m a patient</button>
          <button role="tab" aria-selected={tab === 'clinic'} onClick={() => setTab('clinic')}>I run a clinic</button>
        </nav>
      </header>
      <main>{tab === 'patient' ? <PatientView notify={notify} /> : <ClinicView notify={notify} />}</main>
      <Toast toast={toast} onClose={close} />
    </>
  );
}
