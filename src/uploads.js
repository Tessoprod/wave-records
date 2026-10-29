// Приймання файлів потоком прямо на диск (великі WAV не тримаються в пам'яті) + перевірка вмісту.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { HttpError } from './http.js';

function sniff(head) {
  const s = (a, b) => head.subarray(a, b).toString('latin1');
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { ext: '.wav', mime: 'audio/wav', kind: 'audio' };
  if (s(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return { ext: '.mp3', mime: 'audio/mpeg', kind: 'audio' };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg', kind: 'image' };
  if (head[0] === 0x89 && s(1, 4) === 'PNG') return { ext: '.png', mime: 'image/png', kind: 'image' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return { ext: '.webp', mime: 'image/webp', kind: 'image' };
  return null;
}

export async function receiveUpload(req, dir, { maxBytes, kind }) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) throw new HttpError(413, `Файл завеликий (максимум ${Math.round(maxBytes / 1024 / 1024)} МБ)`);
  const tmp = path.join(dir, `.upload-${crypto.randomBytes(8).toString('hex')}`);
  let size = 0;
  let head = Buffer.alloc(0);
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (head.length < 64) head = Buffer.concat([head, chunk]).subarray(0, 64);
      if (size > maxBytes) return cb(new HttpError(413, `Файл завеликий (максимум ${Math.round(maxBytes / 1024 / 1024)} МБ)`));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, counter, fs.createWriteStream(tmp));
  } catch (err) {
    fs.rm(tmp, { force: true }, () => {});
    throw err instanceof HttpError ? err : new HttpError(400, 'Завантаження перервалося. Спробуйте ще раз.');
  }
  const type = sniff(head);
  if (!type || type.kind !== kind || size === 0) {
    fs.rm(tmp, { force: true }, () => {});
    throw new HttpError(415, kind === 'audio' ? 'Підтримуються лише файли WAV та MP3' : 'Підтримуються лише JPG, PNG та WEBP');
  }
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${type.ext}`;
  fs.renameSync(tmp, path.join(dir, name));
  return { file: name, mime: type.mime, size };
}

/** Тривалість WAV за заголовком (якщо браузер не передав її сам). */
export function wavDuration(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    let byteRate = 0;
    let pos = 12;
    while (pos + 8 <= n) {
      const id = buf.toString('latin1', pos, pos + 4);
      const len = buf.readUInt32LE(pos + 4);
      if (id === 'fmt ') byteRate = buf.readUInt32LE(pos + 16);
      if (id === 'data' && byteRate) {
        const dataLen = Math.min(len, fs.statSync(filePath).size - pos - 8);
        return dataLen / byteRate;
      }
      pos += 8 + len + (len % 2);
    }
  } catch { /* невідомий формат */ }
  return 0;
}

export function removeFile(dir, name) {
  if (!name || name.includes('/') || name.includes('..')) return;
  fs.rm(path.join(dir, name), { force: true }, () => {});
}
