import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { db } from '../db/database';

export function isValidHostAuth(password?: string | null, token?: string | null, roomCode?: string): boolean {
  if (password && password === config.hostPassword) {
    return true;
  }

  if (token) {
    if (roomCode) {
      const room = db
        .prepare('SELECT host_token FROM rooms WHERE code = ?')
        .get(roomCode.toUpperCase()) as { host_token: string } | undefined;
      if (room && room.host_token === token) return true;
    } else {
      const anyRoom = db
        .prepare('SELECT code FROM rooms WHERE host_token = ? LIMIT 1')
        .get(token) as { code: string } | undefined;
      if (anyRoom) return true;
    }
  }

  return false;
}

export function requireHostAuth(req: Request, res: Response, next: NextFunction): void {
  const password = (req.headers['x-host-password'] as string) || undefined;
  const token = (req.headers['x-host-token'] as string) || undefined;

  if (isValidHostAuth(password, token)) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Acesso restrito ao anfitrião. Informe a senha do anfitrião (HOST_PASSWORD) ou token da sala válido.',
  });
}
