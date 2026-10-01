import { treeToGrid } from '../../src/export/grid';
import { gridToSheets } from '../../src/export/sheets';
import { samples } from '../../src/samples';

declare const google: any;

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cid = $<HTMLInputElement>('cid');
const pick = $<HTMLSelectElement>('sample');
const go = $<HTMLButtonElement>('go');
const log = $<HTMLPreElement>('log');
const link = $<HTMLDivElement>('link');

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

cid.value = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || store.get('poc.clientId');
cid.oninput = () => store.set('poc.clientId', cid.value.trim());
for (const s of samples) pick.append(new Option(s.label, s.key));

let t0 = 0;
const say = (msg: string, cls = '') => {
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = `${((performance.now() - t0) / 1000).toFixed(2)}s  ${msg}`;
  log.append(line);
};

let token: { value: string; expires: number } | null = null;

function getToken(clientId: string): Promise<string> {
  if (token && Date.now() < token.expires - 60_000) return Promise.resolve(token.value);
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(`${resp.error}: ${resp.error_description ?? ''}`));
        token = { value: resp.access_token, expires: Date.now() + Number(resp.expires_in) * 1000 };
        say(`Signed in. Granted scopes: ${resp.scope}`, 'ok');
        resolve(resp.access_token);
      },
      error_callback: (err: any) => reject(new Error(`Sign-in popup: ${err.type ?? err.message ?? err}`)),
    });
    client.requestAccessToken();
  });
}

async function api(tokenValue: string, url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenValue}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${json.error?.status ?? ''}: ${json.error?.message ?? JSON.stringify(json)}`);
  return json;
}

go.onclick = async () => {
  const clientId = cid.value.trim();
  log.textContent = '';
  link.textContent = '';
  t0 = performance.now();
  if (!clientId) return say('Paste the OAuth client ID first.', 'err');
  if (typeof google === 'undefined') return say('Google sign-in script has not loaded (network / blocker?).', 'err');
  go.disabled = true;
  try {
    const sample = samples.find((s) => s.key === pick.value)!;
    const payload = gridToSheets(treeToGrid(sample.make()));
    const kb = (JSON.stringify(payload).length / 1024).toFixed(0);
    say(`Built payload for "${sample.label}" (${kb} KB).`);

    const tok = await getToken(clientId);
    const created = await api(tok, 'https://sheets.googleapis.com/v4/spreadsheets', payload.create);
    say(`Created spreadsheet ${created.spreadsheetId}.`, 'ok');
    await api(tok, `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}:batchUpdate`, { requests: payload.requests });
    say('Applied formatting.', 'ok');

    const url = created.spreadsheetUrl as string;
    link.innerHTML = `<a class="open" href="${url}" target="_blank" rel="noopener">Open the Sheet ↗</a>`;
    // No 'noopener' feature: with it window.open always returns null and we couldn't detect a blocked popup.
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    say(win ? 'Opened in a new tab.' : 'Popup blocker stopped the new tab. Use the link above.', win ? 'ok' : 'err');
  } catch (e) {
    say(String((e as Error).message ?? e), 'err');
  } finally {
    go.disabled = false;
  }
};

log.textContent = 'Ready. Paste the client ID, pick a sample, click Export.';
