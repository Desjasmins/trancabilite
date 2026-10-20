#!/usr/bin/env node
// Faux Supabase Storage LOCAL pour l'essai navigateur des photos de défaut (#23).
// Aucun appel au vrai Supabase (GUARDRAILS §12) : écoute sur 127.0.0.1 seulement,
// garde les fichiers en mémoire et journalise chaque requête (une ligne JSON).
// Imite les 4 routes utilisées par src/lib/storage.ts et l'envoi du navigateur, plus
// les limites du bucket nc-photos (5 Mo, JPEG/PNG/WebP/HEIC).
//   node scripts/fake-storage.mjs [port=54399] [journal]
//   puis NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_SERVICE_ROLE_KEY=factice pnpm dev
import http from "node:http";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const port = Number(process.argv[2] || 54399);
const logFile = process.argv[3];
const MAX = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const files = new Map(); // "bucket/path" -> { type, body }
const uploadTokens = new Map(); // token -> "bucket/path"
const readTokens = new Map();

function log(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  console.log(line);
  if (logFile) appendFileSync(logFile, line + "\n");
}
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,POST,PUT,OPTIONS",
  "access-control-allow-headers": "authorization,apikey,content-type,x-upsert,cache-control,x-client-info",
};
function send(res, status, body, type = "application/json") {
  res.writeHead(status, { ...cors, "content-type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const body = Buffer.concat(chunks);
      const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
      const auth = req.headers.authorization ? "bearer" : "aucune";
      const entry = { method: req.method, path: p, auth, bytes: body.length };
      if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");

      let m;
      // Signature d'un envoi (serveur, clé de service).
      if (req.method === "POST" && (m = p.match(/^\/object\/upload\/sign\/(.+)$/))) {
        if (auth !== "bearer") return log({ ...entry, status: 401 }), send(res, 401, { error: "no key" });
        const token = randomUUID();
        uploadTokens.set(token, m[1]);
        log({ ...entry, status: 200, key: m[1] });
        return send(res, 200, { url: `/object/upload/sign/${m[1]}?token=${token}` });
      }
      // Envoi du fichier (navigateur, jeton dans l'URL, sans clé).
      if (req.method === "PUT" && (m = p.match(/^\/object\/upload\/sign\/(.+)$/))) {
        const key = uploadTokens.get(url.searchParams.get("token") || "");
        const type = String(req.headers["content-type"] || "").split(";")[0];
        let status = 200;
        if (key !== m[1]) status = 403;
        else if (body.length > MAX) status = 413;
        else if (!TYPES.has(type)) status = 415;
        else if (files.has(key)) status = 409;
        log({ ...entry, status, key: m[1], type });
        if (status !== 200) return send(res, status, { error: String(status) });
        uploadTokens.delete(url.searchParams.get("token"));
        files.set(key, { type, body });
        return send(res, 200, { Key: key });
      }
      // Existence (serveur).
      if (req.method === "HEAD" && (m = p.match(/^\/object\/(.+)$/))) {
        const status = auth !== "bearer" ? 401 : files.has(m[1]) ? 200 : 404;
        log({ ...entry, status, key: m[1] });
        res.writeHead(status, cors);
        return res.end();
      }
      // URL de lecture signée (serveur).
      if (req.method === "POST" && (m = p.match(/^\/object\/sign\/(.+)$/))) {
        if (auth !== "bearer") return log({ ...entry, status: 401 }), send(res, 401, { error: "no key" });
        const token = randomUUID();
        readTokens.set(token, m[1]);
        const { expiresIn } = JSON.parse(body.toString() || "{}");
        log({ ...entry, status: 200, key: m[1], expiresIn });
        return send(res, 200, { signedURL: `/object/sign/${m[1]}?token=${token}` });
      }
      // Lecture par URL signée (navigateur du Bureau).
      if (req.method === "GET" && (m = p.match(/^\/object\/sign\/(.+)$/))) {
        const key = readTokens.get(url.searchParams.get("token") || "");
        const file = key === m[1] && files.get(key);
        log({ ...entry, status: file ? 200 : 403, key: m[1] });
        if (!file) return send(res, 403, { error: "bad token" });
        return send(res, 200, file.body, file.type);
      }
      log({ ...entry, status: 404 });
      send(res, 404, { error: "route inconnue du faux stockage" });
    });
  })
  .listen(port, "127.0.0.1", () => log({ event: "listening", port }));
