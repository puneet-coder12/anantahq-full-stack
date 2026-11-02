async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    throw Object.assign(new Error(e.message || 'Request failed'), { code: e.code, details: e.details });
  }
  return data;
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

export const api = {
  listSlots: (q = {}) => call(`/slots?${qs(q)}`),
  createSlot: (body) => call('/slots', { method: 'POST', body }),
  cancelSlot: (id) => call(`/slots/${id}/cancel`, { method: 'POST' }),
  book: (slotId, body) => call(`/slots/${slotId}/bookings`, { method: 'POST', body }),
  listBookings: (q) => call(`/bookings?${qs(q)}`),
  cancelBooking: (id, patientEmail) => call(`/bookings/${id}/cancel`, { method: 'POST', body: { patientEmail } }),
};
