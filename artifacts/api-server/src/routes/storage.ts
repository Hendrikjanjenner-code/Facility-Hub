import { Readable } from 'stream';
import express, {
  Router,
  type IRouter,
  type Request,
  type Response,
} from 'express';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { loadUser } from '../lib/auth';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Uploaden en lezen van private objecten is voorbehouden aan MJOP-rollen
// (inspectiefoto's zijn de enige toepassing van private storage).
const STORAGE_ROLES = ['facilitair_manager', 'beheerder'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Bepaalt het werkelijke afbeeldingstype op basis van magic bytes.
 * Geeft null terug als het geen toegestane afbeelding is — de door de
 * client opgegeven Content-Type header wordt bewust NIET vertrouwd.
 */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return 'image/png';
  // GIF: "GIF87a" / "GIF89a"
  const head6 = buf.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  // WEBP: "RIFF"...."WEBP"
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  // HEIC/HEIF: "ftyp" op offset 4 met heic/heix/mif1-brand
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

/**
 * POST /storage/uploads
 *
 * Upload van een inspectiefoto. De bytes gaan door de API zodat de limieten
 * daadwerkelijk worden afgedwongen: express.raw kapt op MAX_UPLOAD_BYTES en
 * het bestandstype wordt via magic bytes geverifieerd (client-headers worden
 * niet vertrouwd). Alleen MJOP-rollen mogen uploaden.
 */
router.post(
  '/storage/uploads',
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    const user = await loadUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!STORAGE_ROLES.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Geen bestand ontvangen' });
      return;
    }
    const detectedType = sniffImageType(body);
    if (!detectedType) {
      res.status(400).json({
        error: 'Alleen afbeeldingen (JPEG, PNG, GIF, WebP, HEIC) zijn toegestaan',
      });
      return;
    }

    try {
      const objectPath = await objectStorageService.uploadObject(
        body,
        detectedType,
      );
      res.status(201).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading object');
      res.status(500).json({ error: 'Upload mislukt' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(
        file,
        3600,
        true,
      );

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const user = await loadUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!STORAGE_ROLES.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
