const { ImapFlow } = require('imapflow');
const { log } = require('../utils/utils');

/**
 * Poll une boîte IMAP (Gmail) pour extraire un code Hinge (4-8 chiffres) 
 * depuis le dernier email reçu (sujet/expéditeur contenant 'hinge').
 */
async function waitForHingeCodeFromGmail({
  host,
  port = 993,
  secure = true,
  auth: { user, pass },
  timeoutMs = 120000
}) {
  const client = new ImapFlow({ host, port, secure, auth: { user, pass } });
  const start = Date.now();
  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    while (Date.now() - start < timeoutMs) {
      // Cherche les derniers messages (limiter à 20 derniers)
      const lock = await client.getMailboxLock('INBOX');
      try {
        const seq = await client.search({ seen: false }, { uid: true });
        const lastUids = seq.slice(-20);
        for (const uid of lastUids.reverse()) {
          const msg = await client.fetchOne(uid, { envelope: true, source: true, bodyStructure: true, bodyParts: [
            {path: '1'}, {path: '1.1'}, {path: 'TEXT'}, {path: '2'}
          ]});
          const subj = (msg.envelope?.subject || '').toLowerCase();
          const from = ((msg.envelope?.from && msg.envelope.from[0]?.address) || '').toLowerCase();

          let text = '';
          try {
            const dl = await client.download(uid);
            const chunks = [];
            for await (const chunk of dl.source) chunks.push(chunk);
            const raw = Buffer.concat(chunks).toString('utf8');
            text = raw;
          } catch {}

          if (subj.includes('hinge') || from.includes('hinge')) {
            const m = text.match(/\b(\d{4,8})\b/);
            if (m) return m[1];
          }
        }
      } finally {
        lock.release();
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('EMAIL_CODE_TIMEOUT');
  } finally {
    try { await client.logout(); } catch {}
  }
}

module.exports = {
  waitForHingeCodeFromGmail,
};
