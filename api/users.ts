// Users API - v1.0
import { UserService, CreateUserRequest, UpdateUserRequest } from '../services/UserService';
import { User } from '../schemas/UserSchema';

export interface Request {
  params: Record<string, string>;
  body: any;
  user?: { id: string };
}

export interface Response {
  status: (code: number) => Response;
  json: (data: any) => void;
}

const userService = new UserService();

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { email, name, role } = req.body;

    const request: CreateUserRequest = { email, name, role };
    const user = await userService.createUser(request);

    res.status(201).json({ user });
  } catch (error) {
    if ((error as Error).message === 'Email already registered') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const user = await userService.getUser(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const updates: UpdateUserRequest = req.body;

    const user = await userService.updateUser(userId, updates);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deactivateUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const success = await userService.deactivateUser(userId);

    if (!success) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({ message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getUserPreferences(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const preferences = await userService.getUserPreferences(userId);

    if (!preferences) {
      res.status(404).json({ error: 'Preferences not found' });
      return;
    }

    res.status(200).json({ preferences });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
