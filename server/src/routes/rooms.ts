import { Router, type Request, type Response } from 'express';
import { isValidHostAuth } from '../middleware/auth';
import {
  computeCurrentPosition,
  createNewRoom,
  executeHostCommand,
  loadOrCreateRoom,
  touchRoomClient,
} from '../socket/roomManager';

export const roomsRouter = Router();

// POST /api/rooms/auth - Verify host password or token
roomsRouter.post('/auth', (req: Request, res: Response) => {
  const { password, hostToken, code } = req.body || {};
  const valid = isValidHostAuth(password, hostToken, code);
  if (!valid) {
    res.status(401).json({
      valid: false,
      error: 'Senha de anfitrião incorreta.',
    });
    return;
  }

  const roomCode = typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : 'AB12CD';
  const { state, hostToken: roomToken } = loadOrCreateRoom(roomCode);
  const now = Date.now();

  res.json({
    valid: true,
    roomCode: state.code,
    hostToken: roomToken,
    state: {
      ...state,
      positionSec: computeCurrentPosition(state, now),
      updatedAt: now,
      serverNow: now,
    },
  });
});

// POST /api/rooms - Create a new room (returns short code and hostToken)
roomsRouter.post('/', (req: Request, res: Response) => {
  const password = (req.headers['x-host-password'] as string) || req.body?.password;
  const token = (req.headers['x-host-token'] as string) || req.body?.hostToken;

  // Allow creating a room with valid password/token OR generate a new room token directly
  const customCode =
    typeof req.body?.code === 'string' && /^[A-Za-z0-9]{4,10}$/.test(req.body.code.trim())
      ? req.body.code.trim().toUpperCase()
      : undefined;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;

  if (customCode) {
    if (!isValidHostAuth(password, token, customCode)) {
      res.status(401).json({
        error: 'Informe a senha do anfitrião para criar ou assumir uma sala com código personalizado.',
      });
      return;
    }
    const { state, hostToken } = loadOrCreateRoom(customCode, name);
    res.status(201).json({
      state,
      hostToken,
      sharePath: `/sala/${state.code}`,
    });
    return;
  }

  const { state, hostToken } = createNewRoom(name);
  res.status(201).json({
    state,
    hostToken,
    sharePath: `/sala/${state.code}`,
  });
});

// GET /api/rooms/:code - Fetch room state & record active listener heartbeat
roomsRouter.get('/:code', (req: Request, res: Response) => {
  const code = req.params.code.trim().toUpperCase();
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
  const password = req.headers['x-host-password'] as string | undefined;
  const token = req.headers['x-host-token'] as string | undefined;

  const { state, hostToken } = loadOrCreateRoom(code);
  const listenerCount = touchRoomClient(code, clientId);
  state.listenerCount = listenerCount;
  const isHost = isValidHostAuth(password, token, code);
  const now = Date.now();

  res.json({
    state: {
      ...state,
      listenerCount,
      positionSec: computeCurrentPosition(state, now),
      updatedAt: now,
      serverNow: now,
    },
    isHost,
    hostToken: isHost ? hostToken : undefined,
  });
});

// POST /api/rooms/:code/command - Execute host playback command via HTTP (for serverless / fallback)
roomsRouter.post('/:code/command', (req: Request, res: Response) => {
  const code = req.params.code.trim().toUpperCase();
  const password = (req.headers['x-host-password'] as string) || req.body?.password;
  const hostToken = (req.headers['x-host-token'] as string) || req.body?.hostToken;

  const result = executeHostCommand(
    {
      ...req.body,
      code,
      password,
      hostToken,
    },
    code
  );

  if (!result.ok) {
    res.status(401).json(result);
    return;
  }

  res.json(result);
});
