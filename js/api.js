// api.js — strato che parla con GitHub (Contents API). Porting di
// 03-burocrazia/app/js/api.js, con due aggiunte per un file grande come
// catalogo.json (oltre il limite di 1 MB del base64 di getFile):
//   - getSha: legge solo i metadati (sha, size), per capire se il file è cambiato
//     senza scaricarlo tutto;
//   - getRaw: scarica il contenuto grezzo (fino a 100 MB) invece del base64.
//
// api.github.com espone CORS permissivo: nessun proxy/server serve.

const API_ROOT = "https://api.github.com";

export class ApiError extends Error {
  constructor(message, { status = 0, conflict = false, kind = "generic" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.conflict = conflict; // sha stale → il chiamante fa retry
    this.kind = kind;         // "auth" | "notfound" | "conflict" | "network" | "generic"
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

export class GitHubApi {
  constructor({ owner, repo, token, branch = "main" }) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this.branch = branch;
  }

  _headers(extra = {}) {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra,
    };
  }

  _contentsUrl(path) {
    return `${API_ROOT}/repos/${this.owner}/${this.repo}/contents/${path}`;
  }

  async _toError(resp, fallback) {
    let detail = "";
    try { detail = (await resp.json())?.message || ""; } catch { /* corpo non-JSON */ }
    const msg = detail ? `${fallback}: ${detail}` : fallback;
    if (resp.status === 401) return new ApiError("Token errato o scaduto.", { status: 401, kind: "auth" });
    if (resp.status === 403) return new ApiError("Accesso negato (permessi del token?).", { status: 403, kind: "auth" });
    if (resp.status === 404) return new ApiError("Repo o file non trovato.", { status: 404, kind: "notfound" });
    if (resp.status === 409 || resp.status === 412) {
      return new ApiError("Conflitto: il file è cambiato.", { status: resp.status, conflict: true, kind: "conflict" });
    }
    return new ApiError(msg, { status: resp.status });
  }

  // GET file (fino a 1 MB) → { data: <oggetto JSON>, sha }
  async getFile(path) {
    let resp;
    try {
      resp = await fetch(`${this._contentsUrl(path)}?ref=${encodeURIComponent(this.branch)}`, {
        headers: this._headers(), cache: "no-store",
      });
    } catch {
      throw new ApiError("Rete assente.", { kind: "network" });
    }
    if (!resp.ok) throw await this._toError(resp, "Lettura fallita");
    const body = await resp.json();
    const text = base64ToUtf8(body.content || "");
    return { data: JSON.parse(text), sha: body.sha };
  }

  // Solo i metadati (sha, size): per capire se un file grande è cambiato senza scaricarlo.
  async getSha(path) {
    let resp;
    try {
      resp = await fetch(`${this._contentsUrl(path)}?ref=${encodeURIComponent(this.branch)}`, {
        headers: this._headers(), cache: "no-store",
      });
    } catch {
      throw new ApiError("Rete assente.", { kind: "network" });
    }
    if (!resp.ok) throw await this._toError(resp, "Verifica fallita");
    const body = await resp.json();
    return { sha: body.sha, size: body.size };
  }

  // Contenuto grezzo (fino a 100 MB): niente base64, restituisce testo o JSON già parsato.
  async getRaw(path, { json = true } = {}) {
    let resp;
    try {
      resp = await fetch(`${this._contentsUrl(path)}?ref=${encodeURIComponent(this.branch)}`, {
        headers: this._headers({ "Accept": "application/vnd.github.raw+json" }), cache: "no-store",
      });
    } catch {
      throw new ApiError("Rete assente.", { kind: "network" });
    }
    if (!resp.ok) throw await this._toError(resp, "Lettura fallita");
    const text = await resp.text();
    return json ? JSON.parse(text) : text;
  }

  // PUT file (commit). Ritorna il nuovo sha. `sha` = quello noto (lock ottimistico).
  async putFile(path, dataObj, sha, message) {
    const content = utf8ToBase64(JSON.stringify(dataObj, null, 2) + "\n");
    const body = { message, content, branch: this.branch };
    if (sha) body.sha = sha; // assente solo alla creazione del file
    let resp;
    try {
      resp = await fetch(this._contentsUrl(path), {
        method: "PUT",
        headers: this._headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError("Rete assente.", { kind: "network" });
    }
    if (!resp.ok) throw await this._toError(resp, "Scrittura fallita");
    const out = await resp.json();
    return out.content?.sha;
  }

  // Prova leggera per il pulsante "Verifica" dell'onboarding.
  async verify(path) {
    await this.getSha(path);
    return true;
  }
}
