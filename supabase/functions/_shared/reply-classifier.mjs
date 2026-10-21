// Pure classifier. Use only after backend validates account ownership and exact thread binding.
export function classifyReply(thread, binding) {
 if (!thread || thread.id !== binding.threadId || !Array.isArray(thread.messages) || !thread.messages.length)
   throw new Error('invalid_thread');
 const own = new Set((binding.ownAddresses || []).map(x => x.trim().toLowerCase()));
 const peers = new Set((binding.counterpartAddresses || []).map(x => x.trim().toLowerCase()));
 if (!own.size || !peers.size || [...own].some(x => peers.has(x))) throw new Error('invalid_participants');
 const address = value => {
   const s = String(value || '').trim().toLowerCase(), m = s.match(/<([^<>]+)>\s*$/);
   const result = m ? m[1] : s;
   return /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(result) ? result : null;
 };
 const messages = [];
 for (const m of thread.messages) {
   if (m.threadId !== thread.id || !m.id || !/^\d+$/.test(String(m.internalDate))) throw new Error('invalid_message');
   const labels = new Set(m.labelIds || []);
   if (['SPAM','TRASH','DRAFT'].some(x => labels.has(x))) continue;
   const headers = new Map((m.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
   const auto = String(headers.get('auto-submitted') || '').trim().toLowerCase();
   if ((auto && auto !== 'no') || headers.has('x-autoreply') || headers.has('x-autorespond')) continue;
   const sender = address(headers.get('from'));
   const direction = own.has(sender) && labels.has('SENT') ? 'outgoing' : peers.has(sender) && !labels.has('SENT') ? 'incoming' : null;
   if (direction) messages.push({ id:m.id, at:Number(m.internalDate), direction });
 }
 messages.sort((a,b) => a.at-b.at || a.id.localeCompare(b.id));
 const sent = messages.filter(m => m.direction === 'outgoing').at(-1);
 const received = messages.filter(m => m.direction === 'incoming').at(-1);
 const pending = !!received && (!sent || received.at > sent.at);
 const since = pending ? messages.find(m => m.direction === 'incoming' && (!sent || m.at > sent.at)).at : null;
 return {pending, pendingSince:since, lastReceivedId:received?.id || null,lastReceivedAt:received?.at || null,lastSentId:sent?.id || null,lastSentAt:sent?.at || null};
}
